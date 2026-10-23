const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const csrfProtection = require('../middleware/csrfProtection');
const asyncRoute = require('../middleware/asyncRoute');
const TicketService = require('../services/TicketService');
const AdminTicketService = require('../services/AdminTicketService');
const ApiError = require('../utils/ApiError');
const Ticket = require('../models/Ticket');
const ticketEvents = require('../realtime/ticketEvents');

router.use(authenticate, authorize('admin'));

router.get('/', asyncRoute(async (req, res) => {
  const result = await AdminTicketService.listTickets(req.query, req.user);
  res.json({ data: { tickets: result.tickets }, meta: result.meta });
}));

router.get('/:ticketId', asyncRoute(async (req, res) => {
  const detail = await AdminTicketService.getTicket(req.params.ticketId, req.user.id);
  res.json({ data: detail });
}));

router.post('/:ticketId/draft', csrfProtection, asyncRoute(async (req, res) => {
  if (req.body && Object.keys(req.body).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Draft regeneration does not accept a request body.');
  const draft = await AdminTicketService.regenerateDraft(req.params.ticketId);
  res.json({ data: { aiDraft: draft } });
}));

function requireOnlyField(body, field, allowedValues) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body[field] !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', `Provide only a ${field} field.`);
  }
  if (allowedValues && !allowedValues.includes(body[field])) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid ${field}.`, { allowed: allowedValues });
  }
}

router.patch('/:ticketId/category', csrfProtection, asyncRoute(async (req, res) => {
  requireOnlyField(req.body, 'category', Ticket.categories);
  const ticket = await TicketService.updateCategory(req.params.ticketId, req.body.category, req.user);
  ticketEvents.emitTicketUpdated(ticket, 'category_changed');
  res.json({ data: { ticket } });
}));

router.patch('/:ticketId/priority', csrfProtection, asyncRoute(async (req, res) => {
  requireOnlyField(req.body, 'priority', Ticket.priorities);
  const ticket = await TicketService.updatePriority(req.params.ticketId, req.body.priority, req.user);
  ticketEvents.emitTicketUpdated(ticket, 'priority_changed');
  res.json({ data: { ticket } });
}));

router.patch('/:ticketId/status', csrfProtection, asyncRoute(async (req, res) => {
  requireOnlyField(req.body, 'status', Ticket.statuses);
  const ticket = await TicketService.updateStatus(req.params.ticketId, req.body.status, req.user);
  ticketEvents.emitTicketUpdated(ticket, 'status_changed');
  res.json({ data: { ticket } });
}));

router.post('/:ticketId/assign-to-me', csrfProtection, asyncRoute(async (req, res) => {
  if (req.body && Object.keys(req.body).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Assignment is derived from the signed-in admin.');
  const ticket = await TicketService.assignToSelf(req.params.ticketId, req.user);
  ticketEvents.emitTicketUpdated(ticket, 'assigned');
  res.json({ data: { ticket } });
}));

async function messageBody(req) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length !== 1 || typeof req.body.body !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide only a body field.');
  }
  const body = req.body.body.trim();
  if (!body || body.length > 10000) throw new ApiError(400, 'VALIDATION_ERROR', 'Message must contain 1 to 10000 characters.');
  return body;
}

router.post('/:ticketId/notes', csrfProtection, asyncRoute(async (req, res) => {
  const message = await TicketService.addMessage(req.params.ticketId, req.user, await messageBody(req), 'internal');
  ticketEvents.emitInternalNote(message);
  res.status(201).json({ data: { message } });
}));

router.post('/:ticketId/replies', csrfProtection, asyncRoute(async (req, res) => {
  const message = await TicketService.addMessage(req.params.ticketId, req.user, await messageBody(req), 'public');
  ticketEvents.emitPublicMessage(message);
  const ticket = await Ticket.findById(req.params.ticketId);
  ticketEvents.emitTicketUpdated(ticket, 'public_reply_sent');
  res.status(201).json({ data: { message } });
}));

module.exports = router;
