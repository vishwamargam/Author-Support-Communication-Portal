const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const asyncRoute = require('../middleware/asyncRoute');
const TicketService = require('../services/TicketService');
const ApiError = require('../utils/ApiError');
const Ticket = require('../models/Ticket');
const authorize = require('../middleware/authorize');
const csrfProtection = require('../middleware/csrfProtection');
const Message = require('../models/Message');
const AiSupportService = require('../services/AiSupportService');
const ticketEvents = require('../realtime/ticketEvents');

router.use(authenticate);
router.get('/', asyncRoute(async (req, res) => {
  const { status, category, priority, page = '1', limit = '25' } = req.query;
  const pageNumber = Number(page);
  const pageSize = Number(limit);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'page must be positive and limit must be between 1 and 100.');
  }
  const filter = req.user.role === 'admin' ? {} : { authorId: req.user.id };
  if (req.user.role === 'admin') {
    if (status && !Ticket.statuses.includes(status)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid ticket status.');
    if (category && !Ticket.categories.includes(category)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid ticket category.');
    if (priority && !Ticket.priorities.includes(priority)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid ticket priority.');
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
  }
  const [tickets, total] = await Promise.all([
    Ticket.find(filter).sort({ lastActivityAt: -1 }).skip((pageNumber - 1) * pageSize).limit(pageSize),
    Ticket.countDocuments(filter)
  ]);
  const ids = tickets.map((ticket) => ticket._id);
  const firstMessages = await Message.find({ ticketId: { $in: ids }, visibility: 'public' })
    .sort({ createdAt: 1 }).lean();
  const originalByTicket = new Map();
  for (const message of firstMessages) {
    const key = String(message.ticketId);
    if (!originalByTicket.has(key)) originalByTicket.set(key, message);
  }
  const ticketRows = tickets.map((ticket) => {
    const row = ticket.toJSON();
    if (req.user.role !== 'admin') {
      delete row.assignedTo;
      delete row.priorityScore;
      delete row.auditTrail;
      delete row.aiDraft;
      delete row.aiClassification;
      delete row.categorySource;
      delete row.prioritySource;
    }
    row.originalQuery = originalByTicket.get(String(ticket._id)) || null;
    return row;
  });
  res.json({ data: { tickets: ticketRows }, meta: { page: pageNumber, limit: pageSize, total } });
}));
router.post('/', authorize('author'), csrfProtection, asyncRoute(async (req, res) => {
  const result = await TicketService.createAuthorTicket(req.user, req.body);
  res.status(201).json({ data: result });
  ticketEvents.emitTicketCreated(result.ticket);
  // Keep author ticket creation available even when the provider is unavailable.
  setImmediate(() => AiSupportService.classifyTicket(result.ticket._id).catch(() => {}));
}));
router.get('/:ticketId', asyncRoute(async (req, res) => {
  const result = await TicketService.getConversation(req.params.ticketId, req.user);
  res.json({ data: result });
}));
router.patch('/:ticketId/status', csrfProtection, authorize('admin'), asyncRoute(async (req, res) => {
  if (!req.body || Object.keys(req.body).length !== 1 || typeof req.body.status !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide only a status field.');
  }
  const ticket = await TicketService.updateStatus(req.params.ticketId, req.body.status, req.user);
  ticketEvents.emitTicketUpdated(ticket, 'status_changed');
  res.json({ data: { ticket } });
}));
router.get('/:ticketId/conversation', asyncRoute(async (req, res) => {
  const result = await TicketService.getConversation(req.params.ticketId, req.user);
  res.json({ data: result });
}));
router.post('/:ticketId/messages', csrfProtection, asyncRoute(async (req, res) => {
  const body = req.body?.body;
  if (typeof body !== 'string' || !body.trim() || body.length > 10000) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Message body must contain 1 to 10000 characters.');
  }
  const message = await TicketService.addMessage(req.params.ticketId, req.user, body);
  ticketEvents.emitPublicMessage(message);
  res.status(201).json({ data: message });
}));
router.post('/:ticketId/notes', csrfProtection, authorize('admin'), asyncRoute(async (req, res) => {
  const body = req.body?.body;
  if (typeof body !== 'string' || !body.trim() || body.length > 10000) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Note body must contain 1 to 10000 characters.');
  }
  const message = await TicketService.addMessage(req.params.ticketId, req.user, body, 'internal');
  ticketEvents.emitInternalNote(message);
  res.status(201).json({ data: message });
}));
module.exports = router;
