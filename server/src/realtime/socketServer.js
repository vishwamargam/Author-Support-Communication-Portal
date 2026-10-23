const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { getConfig } = require('../config/env');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const { bindSocketServer, sessionFingerprint } = require('./ticketEvents');
const { sessionCookieName } = require('../utils/sessionCookies');

// Session cookies are scoped to /api/v1, so the Engine.IO endpoint must live
// under that path for browsers to attach the HTTP-only cookie on handshake.
const SOCKET_PATH = '/api/v1/socket.io';

function readCookie(cookieHeader, name) {
  const prefix = `${name}=`;
  for (const part of String(cookieHeader || '').split(';')) {
    const cookie = part.trim();
    if (cookie.startsWith(prefix)) {
      try { return decodeURIComponent(cookie.slice(prefix.length)); } catch { return null; }
    }
  }
  return null;
}

function createSocketServer(httpServer, { config = getConfig() } = {}) {
  const origins = config.corsOrigin.split(',').map((origin) => origin.trim()).filter(Boolean);
  const io = new Server(httpServer, {
    path: SOCKET_PATH,
    cors: { origin: origins, credentials: true, methods: ['GET', 'POST'] },
    allowRequest(request, callback) {
      const origin = request.headers.origin;
      callback(null, !origin || origins.includes(origin));
    }
  });

  io.use(async (socket, next) => {
    try {
      const portal = socket.handshake.auth?.portal;
      if (!['author', 'admin'].includes(portal)) return next(new Error('INVALID_PORTAL'));
      const token = readCookie(socket.handshake.headers.cookie, sessionCookieName(config, portal));
      if (!token) return next(new Error('UNAUTHENTICATED'));
      const payload = jwt.verify(token, config.jwtSecret, {
        issuer: 'bookleaf-author-support', audience: 'bookleaf-portal', algorithms: ['HS256']
      });
      const user = await User.findOne({ _id: payload.sub, isActive: true }).select('_id role name');
      if (!user || user.role !== portal || payload.role !== portal) return next(new Error('UNAUTHENTICATED'));
      socket.data.user = { id: user.id, role: user.role, name: user.name };
      socket.data.sessionFingerprint = sessionFingerprint(token);
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (user.role === 'admin') socket.join('admin:queue');

    socket.on('ticket:subscribe', async (payload = {}, acknowledge = () => {}) => {
      try {
        const ticketId = typeof payload.ticketId === 'string' ? payload.ticketId : '';
        if (!/^[a-f\d]{24}$/i.test(ticketId)) return acknowledge({ ok: false, code: 'INVALID_TICKET_ID' });
        const ticket = await Ticket.findById(ticketId).select('_id authorId');
        if (!ticket) return acknowledge({ ok: false, code: 'TICKET_NOT_FOUND' });
        if (user.role === 'author' && ticket.authorId !== user.id) {
          return acknowledge({ ok: false, code: 'FORBIDDEN' });
        }
        const room = user.role === 'admin' ? `admin:ticket:${ticketId}` : `author:ticket:${ticketId}`;
        await socket.join(room);
        acknowledge({ ok: true, ticketId });
      } catch {
        acknowledge({ ok: false, code: 'SUBSCRIPTION_FAILED' });
      }
    });

    socket.on('ticket:unsubscribe', async (payload = {}, acknowledge = () => {}) => {
      const ticketId = typeof payload.ticketId === 'string' ? payload.ticketId : '';
      if (!/^[a-f\d]{24}$/i.test(ticketId)) return acknowledge({ ok: false, code: 'INVALID_TICKET_ID' });
      const room = user.role === 'admin' ? `admin:ticket:${ticketId}` : `author:ticket:${ticketId}`;
      await socket.leave(room);
      acknowledge({ ok: true, ticketId });
    });
  });

  bindSocketServer(io);
  return io;
}

module.exports = { createSocketServer, readCookie, SOCKET_PATH };
