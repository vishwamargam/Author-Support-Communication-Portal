const Ticket = require('../models/Ticket');
const Message = require('../models/Message');
const Book = require('../models/Book');
const KnowledgeBase = require('../knowledgeBase/bookleafKnowledgeBase');
const { createGeminiProvider } = require('../ai/provider');
const { CATEGORY_PRIORITY_SCHEMA, classificationInput, DRAFT_SCHEMA, draftInput } = require('../ai/prompts');
const ticketEvents = require('../realtime/ticketEvents');

function safeProviderError(error) {
  if (error?.name === 'AbortError' || error?.name === 'APIConnectionTimeoutError' || error?.name === 'TimeoutError') return 'TIMEOUT';
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code === 'MALFORMED_OUTPUT' || code === 'AI_NOT_CONFIGURED') return code;
  if (['ETIMEDOUT', 'ECONNABORTED', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) return 'TIMEOUT';
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  const providerMessage = typeof error?.message === 'string' ? error.message : '';
  if (status === 401 || status === 403 || code === 'invalid_api_key' || /api key.{0,20}(invalid|not valid)|invalid api key|unauthenticated/i.test(providerMessage)) {
    return 'INVALID_API_KEY';
  }
  if (/quota|billing|resource_exhausted|insufficient_quota/i.test(`${code} ${providerMessage}`)) return 'QUOTA_EXHAUSTED';
  if (status === 429) return 'RATE_LIMITED';
  if ([502, 503, 504].includes(status) || ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return 'PROVIDER_UNAVAILABLE';
  }
  return 'PROVIDER_ERROR';
}

function parseStructured(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') throw Object.assign(new Error('Malformed model output'), { code: 'MALFORMED_OUTPUT' });
  try { return JSON.parse(value); }
  catch { throw Object.assign(new Error('Malformed model output'), { code: 'MALFORMED_OUTPUT' }); }
}

function validateClassification(value) {
  const result = parseStructured(value);
  if (!result || !Ticket.categories.includes(result.category) || !Ticket.priorities.includes(result.priority) ||
      typeof result.priorityExplanation !== 'string' || !result.priorityExplanation.trim() || result.priorityExplanation.length > 500) {
    throw Object.assign(new Error('Malformed classification response'), { code: 'MALFORMED_OUTPUT' });
  }
  return { category: result.category, priority: result.priority, priorityExplanation: result.priorityExplanation.trim() };
}

function validateDraft(value, allowedIds) {
  const result = parseStructured(value);
  if (!result || typeof result.draft !== 'string' || !result.draft.trim() || result.draft.length > 10000 ||
      !Array.isArray(result.articleIds) || result.articleIds.some((id) => !allowedIds.includes(id))) {
    throw Object.assign(new Error('Malformed draft response'), { code: 'MALFORMED_OUTPUT' });
  }
  return { draft: result.draft.trim(), articleIds: [...new Set(result.articleIds)] };
}

function createAiSupportService({ providerFactory = createGeminiProvider, knowledgeBase = KnowledgeBase } = {}) {
  const inFlightDrafts = new Map();

  async function classifyTicket(ticketId, provider) {
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) return null;
    try {
      provider ||= providerFactory();
      if (!provider) throw Object.assign(new Error('AI is not configured'), { code: 'AI_NOT_CONFIGURED' });
      const original = await Message.findOne({ ticketId: ticket._id, senderRole: 'author', visibility: 'public' }).sort({ createdAt: 1 }).lean();
      const relevant = knowledgeBase.selectArticles(ticket.category, `${ticket.subject} ${original?.body || ''}`, 3);
      const context = relevant.map((item) => `[${item.id}] ${item.text}`).join('\n');
      const raw = await provider.classify(classificationInput(ticket, original?.body || '', context), CATEGORY_PRIORITY_SCHEMA);
      const suggested = validateClassification(raw);
      ticket.aiClassification = {
        status: 'complete', ...suggested,
        provider: provider.name || 'custom', model: provider.model || null,
        processedAt: new Date(), errorCode: null
      };
      // Human decisions are sticky. Reclassification only changes fields not explicitly overridden.
      if (ticket.categorySource !== 'human') { ticket.category = suggested.category; ticket.categorySource = 'ai'; }
      if (ticket.prioritySource !== 'human') { ticket.priority = suggested.priority; ticket.prioritySource = 'ai'; }
      await ticket.save();
      ticketEvents.emitTicketUpdated(ticket, 'ai_classified');
      return ticket;
    } catch (error) {
      ticket.aiClassification = {
        ...ticket.aiClassification.toObject?.(), status: 'failed', processedAt: new Date(),
        provider: provider?.name || null, model: provider?.model || null, errorCode: safeProviderError(error)
      };
      await ticket.save();
      return ticket;
    }
  }

  async function generateDraft(ticketId, { force = false, provider } = {}) {
    if (inFlightDrafts.has(String(ticketId))) return inFlightDrafts.get(String(ticketId));
    const task = (async () => {
      const ticket = await Ticket.findById(ticketId);
      if (!ticket) return null;
      if (!force && ['complete', 'failed'].includes(ticket.aiDraft?.status)) return ticket.aiDraft;
      ticket.aiDraft = { ...ticket.aiDraft?.toObject?.(), status: 'generating', text: null, generatedAt: new Date(), errorCode: null };
      await ticket.save();
      try {
        provider ||= providerFactory();
        if (!provider) throw Object.assign(new Error('AI is not configured'), { code: 'AI_NOT_CONFIGURED' });
        const original = await Message.findOne({ ticketId: ticket._id, senderRole: 'author', visibility: 'public' }).sort({ createdAt: 1 }).lean();
        const book = ticket.bookId ? await Book.findById(ticket.bookId).select('title').lean() : null;
        const relevant = knowledgeBase.selectArticles(ticket.category, `${ticket.subject} ${original?.body || ''}`, 3);
        const context = relevant.map((item) => `[${item.id}] ${item.text}`).join('\n');
        const raw = await provider.draft(draftInput(ticket, original?.body || '', book?.title || null, context), DRAFT_SCHEMA);
        const result = validateDraft(raw, relevant.map((item) => item.id));
        ticket.aiDraft = {
          status: 'complete', text: result.draft, articleIds: result.articleIds,
          provider: provider.name || 'custom', model: provider.model || null, generatedAt: new Date(), errorCode: null
        };
      } catch (error) {
        ticket.aiDraft = {
          status: 'failed', text: null, articleIds: [], provider: provider?.name || null,
          model: provider?.model || null, generatedAt: new Date(), errorCode: safeProviderError(error)
        };
      }
      await ticket.save();
      return ticket.aiDraft;
    })().finally(() => inFlightDrafts.delete(String(ticketId)));
    inFlightDrafts.set(String(ticketId), task);
    return task;
  }

  return { classifyTicket, generateDraft };
}

const service = createAiSupportService();
module.exports = { ...service, createAiSupportService, validateClassification, validateDraft, safeProviderError };
