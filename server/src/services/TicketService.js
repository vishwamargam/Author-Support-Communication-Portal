const Ticket = require('../models/Ticket');
const Message = require('../models/Message');
const ApiError = require('../utils/ApiError');
const Book = require('../models/Book');
const mongoose = require('mongoose');
const User = require('../models/User');

async function createAuthorTicket(author, input) {
  if (author.role !== 'author') throw new ApiError(403, 'FORBIDDEN', 'Only authors can submit support tickets.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }
  const allowed = new Set(['bookId', 'subject', 'description']);
  const unknownFields = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknownFields.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Request contains unsupported fields.', { unknownFields });
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (subject.length < 3 || subject.length > 180) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Subject must contain 3 to 180 characters.', { field: 'subject' });
  }
  if (description.length < 10 || description.length > 10000) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Description must contain 10 to 10000 characters.', { field: 'description' });
  }

  let bookId = null;
  let selectedBook = null;
  if (input.bookId !== undefined && input.bookId !== null && input.bookId !== '') {
    if (typeof input.bookId !== 'string' || input.bookId.length > 80) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'bookId must be a valid book identifier or null.', { field: 'bookId' });
    }
    selectedBook = await Book.findOne({ _id: input.bookId, authorId: author.id }).lean();
    if (!selectedBook) throw new ApiError(404, 'BOOK_NOT_FOUND', 'Book not found for this author.');
    bookId = String(selectedBook._id);
  }

  const ticket = await Ticket.create({
    authorId: author.id,
    bookId,
    subject,
    status: 'Open',
    category: 'General Inquiry',
    priority: 'Medium',
    lastActivityAt: new Date()
  });
  let originalQuery;
  try {
    originalQuery = await Message.create({
      ticketId: ticket._id,
      senderId: author.id,
      senderRole: 'author',
      body: description,
      visibility: 'public'
    });
    ticket.lastActivityAt = originalQuery.createdAt;
    await ticket.save();
    return { ticket, originalQuery, book: selectedBook };
  } catch (error) {
    await Message.deleteMany({ ticketId: ticket._id });
    await Ticket.deleteOne({ _id: ticket._id });
    throw error;
  }
}

async function getConversation(ticketId, viewer) {
  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    throw new ApiError(400, 'INVALID_TICKET_ID', 'Ticket identifier is invalid.');
  }
  const ticket = await Ticket.findById(ticketId);
  if (!ticket || (viewer.role === 'author' && ticket.authorId !== viewer.id)) {
    throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
  }
  const filter = { ticketId: ticket._id };
  if (viewer.role !== 'admin') filter.visibility = 'public';
  const [messages, book] = await Promise.all([
    Message.find(filter).sort({ createdAt: 1 }),
    ticket.bookId ? Book.findById(ticket.bookId).lean() : null
  ]);
  if (viewer.role === 'admin') return { ticket, messages, book };
  const authorTicket = ticket.toObject();
  delete authorTicket.assignedTo;
  delete authorTicket.priorityScore;
  delete authorTicket.auditTrail;
  delete authorTicket.aiDraft;
  delete authorTicket.aiClassification;
  delete authorTicket.categorySource;
  delete authorTicket.prioritySource;
  return { ticket: authorTicket, messages, book };
}

async function getAdminDetail(ticketId, adminId) {
  const { ticket, messages, book } = await getConversation(ticketId, { role: 'admin' });
  const [author, assignee] = await Promise.all([
    User.findById(ticket.authorId).select('name email phone city joinedDate').lean(),
    ticket.assignedTo ? User.findOne({ _id: ticket.assignedTo, role: 'admin' }).select('name email').lean() : null
  ]);
  return { ticket, messages, author, book, assignee, currentAdminId: adminId };
}

function addAudit(ticket, actorId, eventType, field = null, fromValue = null, toValue = null) {
  ticket.auditTrail.push({ actorId, eventType, field, fromValue, toValue, createdAt: new Date() });
}

async function updateStatus(ticketId, status, actor) {
  if (!Ticket.statuses.includes(status)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Status must be one of the allowed ticket statuses.',
      { allowed: Ticket.statuses });
  }
  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    throw new ApiError(400, 'INVALID_TICKET_ID', 'Ticket identifier is invalid.');
  }
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
  const previous = ticket.status;
  if (previous !== status) addAudit(ticket, actor.id, 'status_changed', 'status', previous, status);
  ticket.status = status;
  ticket.closedAt = ['Resolved', 'Closed'].includes(status) ? new Date() : null;
  ticket.lastActivityAt = new Date();
  await ticket.save();
  return ticket;
}

async function updateCategory(ticketId, category, actor) {
  if (!Ticket.categories.includes(category)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Category must be one of the allowed ticket categories.',
      { allowed: Ticket.categories });
  }
  if (!mongoose.Types.ObjectId.isValid(ticketId)) throw new ApiError(400, 'INVALID_TICKET_ID', 'Ticket identifier is invalid.');
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
  if (ticket.category !== category) addAudit(ticket, actor.id, 'category_changed', 'category', ticket.category, category);
  ticket.category = category;
  ticket.categorySource = 'human';
  ticket.lastActivityAt = new Date();
  await ticket.save();
  return ticket;
}

async function updatePriority(ticketId, priority, actor) {
  if (!Ticket.priorities.includes(priority)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Priority must be one of the allowed priority levels.',
      { allowed: Ticket.priorities });
  }
  if (!mongoose.Types.ObjectId.isValid(ticketId)) throw new ApiError(400, 'INVALID_TICKET_ID', 'Ticket identifier is invalid.');
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
  if (ticket.priority !== priority) addAudit(ticket, actor.id, 'priority_changed', 'priority', ticket.priority, priority);
  ticket.priority = priority;
  ticket.prioritySource = 'human';
  ticket.lastActivityAt = new Date();
  await ticket.save();
  return ticket;
}

async function assignToSelf(ticketId, actor) {
  if (!mongoose.Types.ObjectId.isValid(ticketId)) throw new ApiError(400, 'INVALID_TICKET_ID', 'Ticket identifier is invalid.');
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
  if (ticket.assignedTo !== actor.id) addAudit(ticket, actor.id, 'assigned', 'assignedTo', ticket.assignedTo, actor.id);
  ticket.assignedTo = actor.id;
  ticket.lastActivityAt = new Date();
  await ticket.save();
  return ticket;
}

async function addMessage(ticketId, viewer, body, visibility = 'public') {
  if (visibility === 'internal' && viewer.role !== 'admin') {
    throw new ApiError(403, 'FORBIDDEN', 'Only admins can create internal notes.');
  }
  const ticket = await Ticket.findById(ticketId);
  if (!ticket || (viewer.role === 'author' && ticket.authorId !== viewer.id)) {
    throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found.');
  }
  const message = await Message.create({
    ticketId: ticket._id,
    senderId: viewer.id,
    senderRole: viewer.role,
    body,
    visibility
  });
  ticket.lastActivityAt = message.createdAt;
  if (viewer.role === 'admin' && visibility === 'public') {
    if (ticket.status !== 'Waiting on Author') {
      addAudit(ticket, viewer.id, 'status_changed', 'status', ticket.status, 'Waiting on Author');
      ticket.status = 'Waiting on Author';
      ticket.closedAt = null;
    }
    addAudit(ticket, viewer.id, 'public_reply_sent');
  } else if (viewer.role === 'admin' && visibility === 'internal') {
    addAudit(ticket, viewer.id, 'internal_note_added');
  }
  await ticket.save();
  return message;
}

module.exports = {
  createAuthorTicket, getConversation, getAdminDetail, updateStatus,
  updateCategory, updatePriority, assignToSelf, addMessage
};
