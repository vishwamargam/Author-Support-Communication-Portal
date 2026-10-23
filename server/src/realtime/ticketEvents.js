const { randomUUID } = require('node:crypto');
const { createHash } = require('node:crypto');

let io = null;

function bindSocketServer(socketServer) { io = socketServer; }
function sessionFingerprint(token) { return createHash('sha256').update(token).digest('hex'); }
function disconnectSocketsForSession(token) {
  if (!io || !token) return;
  const fingerprint = sessionFingerprint(token);
  for (const socket of io.of('/').sockets.values()) {
    if (socket.data.sessionFingerprint === fingerprint) socket.disconnect(true);
  }
}
function eventMeta(ticketId) { return { eventId: randomUUID(), ticketId: String(ticketId), emittedAt: new Date().toISOString() }; }

function emitTicketCreated(ticket) {
  if (!io) return;
  const meta = eventMeta(ticket._id);
  // Queue clients receive an invalidation token only; they reload authorized rows via REST.
  io.to('admin:queue').emit('queue:ticket-created', meta);
}

function emitTicketUpdated(ticket, action = 'updated') {
  if (!io) return;
  const meta = eventMeta(ticket._id);
  const publicState = {
    ...meta,
    action,
    ticket: {
      id: String(ticket._id), status: ticket.status, category: ticket.category,
      priority: ticket.priority, lastActivityAt: ticket.lastActivityAt
    }
  };
  io.to(`author:ticket:${ticket._id}`).emit('ticket:updated', publicState);
  io.to(`admin:ticket:${ticket._id}`).emit('ticket:updated', publicState);
  io.to('admin:queue').emit('queue:ticket-updated', meta);
}

function serializePublicMessage(message) {
  return {
    id: String(message._id), ticketId: String(message.ticketId), senderRole: message.senderRole,
    body: message.body, createdAt: message.createdAt
  };
}

function emitPublicMessage(message) {
  if (!io || message.visibility !== 'public') return;
  const payload = { ...eventMeta(message.ticketId), message: serializePublicMessage(message) };
  io.to(`author:ticket:${message.ticketId}`).emit('ticket:message', payload);
  io.to(`admin:ticket:${message.ticketId}`).emit('ticket:message', payload);
  io.to('admin:queue').emit('queue:ticket-updated', eventMeta(message.ticketId));
}

function emitInternalNote(message) {
  if (!io || message.visibility !== 'internal') return false;
  // The private admin ticket room is never joined by authors.
  io.to(`admin:ticket:${message.ticketId}`).emit('ticket:internal-note', {
    ...eventMeta(message.ticketId), message: serializePublicMessage(message)
  });
  io.to('admin:queue').emit('queue:ticket-updated', eventMeta(message.ticketId));
  return true;
}

function closeSocketServer() {
  const current = io;
  io = null;
  return current;
}

module.exports = { bindSocketServer, closeSocketServer, disconnectSocketsForSession, sessionFingerprint, emitTicketCreated, emitTicketUpdated, emitPublicMessage, emitInternalNote };
