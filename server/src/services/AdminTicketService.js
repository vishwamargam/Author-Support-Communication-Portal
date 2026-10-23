const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const Message = require('../models/Message');
const User = require('../models/User');
const Book = require('../models/Book');
const TicketService = require('./TicketService');
const ApiError = require('../utils/ApiError');
const AiSupportService = require('./AiSupportService');

function parseDay(value, endOfDay = false) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Date filters must use YYYY-MM-DD.');
  }
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Date filter is not a real calendar date.');
  }
  return date;
}

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function listTickets(query, admin) {
  const { status, category, priority, page = '1', limit = '25', q, from, to,
    sort = 'oldest', assignee = 'any' } = query;
  const pageNumber = Number(page);
  const pageSize = Number(limit);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'page must be positive and limit must be between 1 and 100.');
  }
  if (status !== undefined && !Ticket.statuses.includes(status)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid ticket status.');
  if (category !== undefined && !Ticket.categories.includes(category)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid ticket category.');
  if (priority !== undefined && !Ticket.priorities.includes(priority)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid ticket priority.');
  if (typeof q === 'string' && q.trim().length > 120) throw new ApiError(400, 'VALIDATION_ERROR', 'Search must be 120 characters or fewer.');
  if (q !== undefined && typeof q !== 'string') throw new ApiError(400, 'VALIDATION_ERROR', 'Search must be a string.');
  if (!['oldest', 'newest', 'activity'].includes(sort)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid sort order.');
  if (!['any', 'me', 'unassigned'].includes(assignee)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid assignee filter.');

  const start = parseDay(from);
  const end = parseDay(to, true);
  if (start && end && start > end) throw new ApiError(400, 'VALIDATION_ERROR', 'Start date must be on or before end date.');
  const filter = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (priority) filter.priority = priority;
  if (start || end) filter.createdAt = { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) };
  if (assignee === 'me') filter.assignedTo = admin.id;
  if (assignee === 'unassigned') filter.assignedTo = null;

  const search = q?.trim();
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    const normalizedId = search.replace(/^BL-/i, '');
    const authorMatches = await User.find({ role: 'author', $or: [{ name: regex }, { email: regex }] })
      .select('_id').limit(100).lean();
    const alternatives = [{ subject: regex }];
    if (mongoose.Types.ObjectId.isValid(normalizedId)) alternatives.push({ _id: new mongoose.Types.ObjectId(normalizedId) });
    if (authorMatches.length) alternatives.push({ authorId: { $in: authorMatches.map((user) => user._id) } });
    filter.$or = alternatives;
  }

  const sortOrder = sort === 'oldest' ? { createdAt: 1 } : sort === 'newest' ? { createdAt: -1 } : { lastActivityAt: -1 };
  const oldestFilter = { ...filter };
  if (!oldestFilter.status) oldestFilter.status = { $nin: ['Resolved', 'Closed'] };
  else if (['Resolved', 'Closed'].includes(oldestFilter.status)) oldestFilter.status = { $in: [] };
  const [tickets, total, oldest] = await Promise.all([
    Ticket.find(filter).sort(sortOrder).skip((pageNumber - 1) * pageSize).limit(pageSize).lean(),
    Ticket.countDocuments(filter),
    Ticket.findOne(oldestFilter).sort({ createdAt: 1, _id: 1 }).select('_id').lean()
  ]);
  const authorIds = [...new Set(tickets.map((ticket) => ticket.authorId))];
  const bookIds = [...new Set(tickets.map((ticket) => ticket.bookId).filter(Boolean))];
  const assigneeIds = [...new Set(tickets.map((ticket) => ticket.assignedTo).filter(Boolean))];
  const [authors, books, assignees, originalMessages] = await Promise.all([
    User.find({ _id: { $in: authorIds }, role: 'author' }).select('name email').lean(),
    Book.find({ _id: { $in: bookIds } }).select('title').lean(),
    User.find({ _id: { $in: assigneeIds }, role: 'admin' }).select('name email').lean(),
    Message.find({ ticketId: { $in: tickets.map((ticket) => ticket._id) }, visibility: 'public' }).sort({ createdAt: 1 }).lean()
  ]);
  const authorById = new Map(authors.map((record) => [record._id, record]));
  const bookById = new Map(books.map((record) => [record._id, record]));
  const assigneeById = new Map(assignees.map((record) => [record._id, record]));
  const originalByTicket = new Map();
  for (const message of originalMessages) {
    const key = String(message.ticketId);
    if (!originalByTicket.has(key)) originalByTicket.set(key, message);
  }
  const rows = tickets.map((ticket) => ({
    ...ticket,
    author: authorById.get(ticket.authorId) || null,
    book: ticket.bookId ? bookById.get(ticket.bookId) || null : null,
    assignee: ticket.assignedTo ? assigneeById.get(ticket.assignedTo) || null : null,
    originalQuery: originalByTicket.get(String(ticket._id)) || null
  }));
  return {
    tickets: rows,
    meta: { page: pageNumber, limit: pageSize, total, pages: Math.ceil(total / pageSize), oldestUnresolvedTicketId: oldest?._id || null }
  };
}

async function getTicket(ticketId, adminId) {
  if (!mongoose.Types.ObjectId.isValid(ticketId)) throw new ApiError(400, 'INVALID_TICKET_ID', 'Ticket identifier is invalid.');
  // Generate once on first admin open. Failed drafts stay in manual mode until an
  // admin explicitly asks for regeneration; successful drafts are reused.
  const existing = await Ticket.findById(ticketId).select('aiDraft').lean();
  const draftStartedAt = existing?.aiDraft?.generatedAt ? new Date(existing.aiDraft.generatedAt).getTime() : 0;
  const staleGeneration = existing?.aiDraft?.status === 'generating' && Date.now() - draftStartedAt > 5 * 60 * 1000;
  if (existing && (!existing.aiDraft || existing.aiDraft.status === 'not_requested' || staleGeneration)) {
    await AiSupportService.generateDraft(ticketId);
  }
  return TicketService.getAdminDetail(ticketId, adminId);
}

async function regenerateDraft(ticketId) {
  if (!mongoose.Types.ObjectId.isValid(ticketId)) throw new ApiError(400, 'INVALID_TICKET_ID', 'Ticket identifier is invalid.');
  if (!await Ticket.exists({ _id: ticketId })) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
  return AiSupportService.generateDraft(ticketId, { force: true });
}

module.exports = { listTickets, getTicket, regenerateDraft };
