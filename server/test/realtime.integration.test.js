process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/bookleaf_realtime_test';
process.env.JWT_SECRET = 'test-only-secret-with-more-than-thirty-two-characters';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.SESSION_TTL_SECONDS = '3600';

const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { io: connectSocket } = require('socket.io-client');
const app = require('../src/app');
const { getConfig } = require('../src/config/env');
const User = require('../src/models/User');
const Ticket = require('../src/models/Ticket');
const Message = require('../src/models/Message');
const { createSocketServer } = require('../src/realtime/socketServer');
const { closeSocketServer, disconnectSocketsForSession, emitTicketCreated, emitPublicMessage, emitInternalNote } = require('../src/realtime/ticketEvents');
const { sessionCookieName } = require('../src/utils/sessionCookies');

let mongo;
let server;
let ioServer;
let baseUrl;
let authorOne;
let authorTwo;
let admin;
let ticket;
const config = getConfig();

function sessionToken(user) {
  return jwt.sign({ role: user.role }, config.jwtSecret, {
    subject: user.id, expiresIn: 3600, issuer: 'bookleaf-author-support', audience: 'bookleaf-portal'
  });
}

function connectWithToken(token, reconnect = false, portal = 'author') {
  return connectSocket(baseUrl, { path: '/api/v1/socket.io', auth: { portal }, extraHeaders: { Cookie: `${sessionCookieName(config, portal)}=${encodeURIComponent(token)}` }, transports: ['websocket'], reconnection: reconnect, reconnectionAttempts: 3, reconnectionDelay: 50, reconnectionDelayMax: 100 });
}

function connectAs(user) { return connectWithToken(sessionToken(user), false, user.role); }

function waitFor(socket, event, timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off(event, handler); reject(new Error(`Timed out waiting for ${event}`)); }, timeoutMs);
    const handler = (payload) => { clearTimeout(timeout); resolve(payload); };
    socket.once(event, handler);
  });
}

function subscribe(socket, ticketId) {
  return new Promise((resolve) => socket.emit('ticket:subscribe', { ticketId }, resolve));
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  server = http.createServer(app);
  ioServer = createSocketServer(server, { config });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  ioServer.close();
  closeSocketServer();
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Ticket.deleteMany({}), Message.deleteMany({})]);
  [authorOne, authorTwo, admin] = await User.create([
    { _id: 'AUTH001', role: 'author', name: 'Author One', email: 'one@example.test', passwordHash: 'test-hash' },
    { _id: 'AUTH002', role: 'author', name: 'Author Two', email: 'two@example.test', passwordHash: 'test-hash' },
    { _id: 'ADMIN001', role: 'admin', name: 'Support Admin', email: 'admin@example.test', passwordHash: 'test-hash' }
  ]);
  ticket = await Ticket.create({ authorId: authorOne.id, subject: 'A private author ticket' });
});

test('socket connections require a valid cookie session and authors cannot join another author ticket room', async () => {
  const unauthenticated = connectSocket(baseUrl, { path: '/api/v1/socket.io', auth: { portal: 'author' }, transports: ['websocket'], reconnection: false });
  const connectionError = waitFor(unauthenticated, 'connect_error');
  assert.match((await connectionError).message, /UNAUTHENTICATED/);
  unauthenticated.close();

  const token = sessionToken(authorTwo);
  const author = connectWithToken(token, false, 'author');
  await waitFor(author, 'connect');
  assert.deepEqual(await subscribe(author, ticket.id), { ok: false, code: 'FORBIDDEN' });
  const disconnect = waitFor(author, 'disconnect');
  disconnectSocketsForSession(token);
  assert.equal(await disconnect, 'io server disconnect');
  author.close();
});

test('created tickets notify admins without author details; public messages reach only authorized rooms', async () => {
  const adminSocket = connectAs(admin);
  const ownerSocket = connectAs(authorOne);
  const otherSocket = connectAs(authorTwo);
  await Promise.all([waitFor(adminSocket, 'connect'), waitFor(ownerSocket, 'connect'), waitFor(otherSocket, 'connect')]);
  const [adminSubscription, ownerSubscription] = await Promise.all([subscribe(adminSocket, ticket.id), subscribe(ownerSocket, ticket.id)]);
  assert.equal(adminSubscription.ok, true);
  assert.equal(ownerSubscription.ok, true);

  const createdEvent = waitFor(adminSocket, 'queue:ticket-created');
  const persistedTicket = await Ticket.create({ authorId: authorOne.id, subject: 'A newly persisted ticket' });
  emitTicketCreated(persistedTicket);
  const createdPayload = await createdEvent;
  assert.equal(createdPayload.ticketId, persistedTicket.id);
  assert.equal('author' in createdPayload, false);
  assert.equal('email' in createdPayload, false);

  const ownerMessageEvent = waitFor(ownerSocket, 'ticket:message');
  const adminMessageEvent = waitFor(adminSocket, 'ticket:message');
  const unrelatedMessageEvent = waitFor(otherSocket, 'ticket:message', 250).then(() => true).catch(() => false);
  assert.ok(await Ticket.exists({ _id: ticket._id }));
  const persistedMessage = await Message.create({ ticketId: ticket.id, senderId: admin.id, senderRole: 'admin', body: 'Public reply', visibility: 'public' });
  emitPublicMessage(persistedMessage);
  assert.equal((await ownerMessageEvent).message.body, 'Public reply');
  assert.equal((await adminMessageEvent).message.body, 'Public reply');
  assert.equal(await unrelatedMessageEvent, false);
  adminSocket.close(); ownerSocket.close(); otherSocket.close();
});

test('internal notes are sent only to an authorized admin ticket room', async () => {
  const adminSocket = connectAs(admin);
  const ownerSocket = connectAs(authorOne);
  await Promise.all([waitFor(adminSocket, 'connect'), waitFor(ownerSocket, 'connect')]);
  const results = await Promise.all([subscribe(adminSocket, ticket.id), subscribe(ownerSocket, ticket.id)]);
  assert.deepEqual(results.map((result) => result.ok), [true, true]);
  assert.equal(ioServer.sockets.adapter.rooms.get(`admin:ticket:${ticket.id}`)?.size, 1);
  const internalEvent = waitFor(adminSocket, 'ticket:internal-note');
  let authorReceived = false;
  const authorNoteListener = () => { authorReceived = true; };
  ownerSocket.on('ticket:internal-note', authorNoteListener);
  const persistedNote = await Message.create({ ticketId: ticket.id, senderId: admin.id, senderRole: 'admin', body: 'Private staff note', visibility: 'internal' });
  assert.equal(persistedNote.visibility, 'internal');
  assert.equal(String(persistedNote.ticketId), ticket.id);
  assert.equal(emitInternalNote(persistedNote), true);
  assert.equal((await internalEvent).message.body, 'Private staff note');
  await new Promise((resolve) => setTimeout(resolve, 250));
  ownerSocket.off('ticket:internal-note', authorNoteListener);
  assert.equal(authorReceived, false);
  adminSocket.close(); ownerSocket.close();
});

test('a reconnecting client can reauthorize and rejoin its ticket room', async () => {
  const authorSocket = connectWithToken(sessionToken(authorOne), true);
  await waitFor(authorSocket, 'connect');
  const joinOnConnect = () => authorSocket.emit('ticket:subscribe', { ticketId: ticket.id });
  authorSocket.on('connect', joinOnConnect);
  assert.deepEqual(await subscribe(authorSocket, ticket.id), { ok: true, ticketId: ticket.id });

  const reconnected = waitFor(authorSocket, 'connect', 3000);
  authorSocket.io.engine.close();
  await reconnected;
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(ioServer.sockets.adapter.rooms.get(`author:ticket:${ticket.id}`)?.size, 1);
  const messageEvent = waitFor(authorSocket, 'ticket:message');
  const saved = await Message.create({ ticketId: ticket.id, senderId: admin.id, senderRole: 'admin', body: 'After reconnect', visibility: 'public' });
  emitPublicMessage(saved);
  assert.equal((await messageEvent).message.body, 'After reconnect');
  authorSocket.close();
});
