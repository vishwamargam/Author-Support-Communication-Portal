process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/bookleaf_auth_test';
process.env.JWT_SECRET = 'test-only-secret-with-more-than-thirty-two-characters';
process.env.CORS_ORIGIN = 'http://localhost:5173,http://localhost:5174';
process.env.SESSION_TTL_SECONDS = '3600';

const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Book = require('../src/models/Book');
const Ticket = require('../src/models/Ticket');
const Message = require('../src/models/Message');
const { createAiSupportService, validateClassification, safeProviderError } = require('../src/services/AiSupportService');

let mongo;
let authorOne;
let authorTwo;
let admin;
const password = 'demo-password-for-tests';

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Book.deleteMany({}), Ticket.deleteMany({}), Message.deleteMany({})]);
  const passwordHash = await bcrypt.hash(password, 4);
  [authorOne, authorTwo, admin] = await User.create([
    { _id: 'AUTH001', role: 'author', name: 'Author One', email: 'one@example.test', passwordHash },
    { _id: 'AUTH002', role: 'author', name: 'Author Two', email: 'two@example.test', passwordHash },
    { _id: 'ADMIN001', role: 'admin', name: 'Support Admin', email: 'admin@example.test', passwordHash }
  ]);
  await Book.create([
    { _id: 'BK001', authorId: authorOne.id, title: 'One Book', isbn: 'ISBN-1', genre: 'Fiction', status: 'Published', totalCopiesSold: 0, totalRoyaltyEarned: 0, royaltyPaid: 0, royaltyPending: 0 },
    { _id: 'BK002', authorId: authorTwo.id, title: 'Two Book', isbn: 'ISBN-2', genre: 'Fiction', status: 'Published', totalCopiesSold: 0, totalRoyaltyEarned: 0, royaltyPaid: 0, royaltyPending: 0 }
  ]);
  const [ticketOne, ticketTwo] = await Ticket.create([
    { authorId: authorOne.id, subject: 'Ticket one' },
    { authorId: authorTwo.id, subject: 'Ticket two' }
  ]);
  await Message.create([
    { ticketId: ticketOne.id, senderId: authorOne.id, senderRole: 'author', body: 'Public text', visibility: 'public' },
    { ticketId: ticketOne.id, senderId: admin.id, senderRole: 'admin', body: 'Confidential note', visibility: 'internal' }
  ]);
  global.testTicketOne = ticketOne;
  global.testTicketTwo = ticketTwo;
});

async function login(email, origin = 'http://localhost:5173') {
  return request.agent(app).post('/api/v1/auth/login').set('Origin', origin)
    .send({ email, password });
}

function csrfHeader(response, agent, origin = 'http://localhost:5173') {
  return agent.post('/api/v1/auth/logout')
    .set('Origin', origin)
    .set('X-CSRF-Token', response.body.data.csrfToken);
}

test('unauthenticated requests are rejected consistently', async () => {
  const response = await request(app).get('/api/v1/auth/me');
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'UNAUTHENTICATED');
});

test('health endpoint reports the API and database readiness without authentication', async () => {
  const response = await request(app).get('/api/v1/health').expect(200);
  assert.equal(response.body.data.status, 'ok');
  assert.equal(response.body.data.database, 'connected');
});

test('malformed JSON and unknown routes use the shared API error envelope', async () => {
  const malformed = await request(app).post('/api/v1/auth/login')
    .set('Content-Type', 'application/json').send('{"email":');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'INVALID_JSON');
  assert.ok(malformed.body.requestId);
  const missing = await request(app).get('/api/v1/does-not-exist');
  assert.equal(missing.status, 404);
  assert.equal(typeof missing.body.error.code, 'string');
  assert.ok(missing.body.requestId);
});

test('login sets HTTP-only session cookie and current-user omits password hash', async () => {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').set('Origin', 'http://localhost:5173')
    .send({ email: 'one@example.test', password });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.user.passwordHash, undefined);
  assert.equal(response.body.data.token, undefined);
  const sessionCookie = response.headers['set-cookie'].find((cookie) => cookie.startsWith('bookleaf_session='));
  assert.match(sessionCookie, /HttpOnly/i);
  assert.match(sessionCookie, /SameSite=Lax/i);

  const current = await agent.get('/api/v1/auth/me');
  assert.equal(current.status, 200);
  assert.equal(current.body.data.user.email, 'one@example.test');
  assert.equal(current.body.data.user.passwordHash, undefined);
  // A page reload uses a fresh JS context but sends the same persistent cookie.
  const cookieHeader = response.headers['set-cookie'].map((cookie) => cookie.split(';')[0]).join('; ');
  const afterReload = await request(app).get('/api/v1/auth/me').set('Cookie', cookieHeader).expect(200);
  assert.equal(afterReload.body.data.user.email, 'one@example.test');

  const csrfOne = await agent.get('/api/v1/auth/csrf').expect(200);
  const csrfTwo = await agent.get('/api/v1/auth/csrf').expect(200);
  assert.equal(csrfOne.body.data.csrfToken, csrfTwo.body.data.csrfToken);
});

test('author and admin sessions coexist in one browser using role-scoped cookies', async () => {
  const agent = request.agent(app);
  const authorLogin = await agent.post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:5173').set('X-BookLeaf-Portal', 'author')
    .send({ email: 'one@example.test', password }).expect(200);
  const adminLogin = await agent.post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:5174').set('X-BookLeaf-Portal', 'admin')
    .send({ email: 'admin@example.test', password }).expect(200);

  assert.ok(authorLogin.headers['set-cookie'].some((cookie) => cookie.startsWith('bookleaf_session=')));
  assert.ok(adminLogin.headers['set-cookie'].some((cookie) => cookie.startsWith('bookleaf_admin_session=')));
  assert.notEqual(authorLogin.body.data.csrfToken, adminLogin.body.data.csrfToken);
  assert.equal((await agent.get('/api/v1/auth/me').set('X-BookLeaf-Portal', 'author').expect(200)).body.data.user.role, 'author');
  assert.equal((await agent.get('/api/v1/auth/me').set('X-BookLeaf-Portal', 'admin').expect(200)).body.data.user.role, 'admin');

  await agent.post('/api/v1/auth/logout').set('Origin', 'http://localhost:5173')
    .set('X-BookLeaf-Portal', 'author').set('X-CSRF-Token', authorLogin.body.data.csrfToken).expect(204);
  await agent.get('/api/v1/auth/me').set('X-BookLeaf-Portal', 'author').expect(401);
  await agent.get('/api/v1/auth/me').set('X-BookLeaf-Portal', 'admin').expect(200);
});

test('a portal login cannot create a session for the other role', async () => {
  const response = await request(app).post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:5173').set('X-BookLeaf-Portal', 'author')
    .send({ email: 'admin@example.test', password }).expect(403);
  assert.equal(response.body.error.code, 'PORTAL_ROLE_MISMATCH');
  assert.equal(response.headers['set-cookie'], undefined);
});

test('invalid credentials return 401 and invalid request bodies return 400', async () => {
  const invalid = await request(app).post('/api/v1/auth/login').set('Origin', 'http://localhost:5173')
    .send({ email: 'one@example.test', password: 'wrong-password' });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.error.code, 'INVALID_CREDENTIALS');

  const malformed = await request(app).post('/api/v1/auth/login').set('Origin', 'http://localhost:5173')
    .send({ email: 'not-an-email', password: password, authorId: 'AUTH002' });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'VALIDATION_ERROR');
});

test('authors are restricted to their own profile, books, tickets, and public conversation', async () => {
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').set('Origin', 'http://localhost:5173')
    .send({ email: 'one@example.test', password }).expect(200);

  await agent.get('/api/v1/authors/me').expect(200);
  await agent.get('/api/v1/authors/AUTH002').expect(404);
  const books = await agent.get('/api/v1/books').expect(200);
  assert.deepEqual(books.body.data.books.map((book) => book._id), ['BK001']);
  const attemptedOverride = await agent.get('/api/v1/books?authorId=AUTH002').expect(200);
  assert.deepEqual(attemptedOverride.body.data.books.map((book) => book._id), ['BK001']);
  const tickets = await agent.get('/api/v1/tickets').expect(200);
  assert.equal(tickets.body.meta.total, 1);
  assert.equal('assignedTo' in tickets.body.data.tickets[0], false);
  assert.equal('priorityScore' in tickets.body.data.tickets[0], false);
  await agent.get(`/api/v1/tickets/${global.testTicketTwo.id}/conversation`).expect(404);

  const conversation = await agent.get(`/api/v1/tickets/${global.testTicketOne.id}/conversation`).expect(200);
  assert.deepEqual(conversation.body.data.messages.map((message) => message.body), ['Public text']);
  assert.equal(JSON.stringify(conversation.body).includes('Confidential note'), false);
});

test('admins can access all author records, tickets, and internal notes', async () => {
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').set('Origin', 'http://localhost:5173')
    .send({ email: 'admin@example.test', password }).expect(200);

  const authors = await agent.get('/api/v1/authors').expect(200);
  assert.equal(authors.body.data.authors.length, 2);
  const books = await agent.get('/api/v1/books').expect(200);
  assert.equal(books.body.data.books.length, 2);
  const allBooks = await agent.get('/api/v1/books?authorId=AUTH002').expect(200);
  assert.deepEqual(allBooks.body.data.books.map((book) => book._id), ['BK002']);
  const tickets = await agent.get('/api/v1/tickets').expect(200);
  assert.equal(tickets.body.meta.total, 2);
  const conversation = await agent.get(`/api/v1/tickets/${global.testTicketOne.id}/conversation`).expect(200);
  assert.equal(conversation.body.data.messages.some((message) => message.visibility === 'internal'), true);
});

test('authors can create scoped tickets with an Open status and first conversation message', async () => {
  const agent = request.agent(app);
  const loggedIn = await agent.post('/api/v1/auth/login').set('Origin', 'http://localhost:5173')
    .send({ email: 'one@example.test', password }).expect(200);
  const csrf = loggedIn.body.data.csrfToken;
  const created = await agent.post('/api/v1/tickets').set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', csrf)
    .send({ bookId: 'BK001', subject: 'Royalty statement', description: 'Please explain my latest royalty statement.' })
    .expect(201);
  assert.equal(created.body.data.ticket.authorId, 'AUTH001');
  assert.equal(created.body.data.ticket.status, 'Open');
  assert.equal(created.body.data.ticket.bookId, 'BK001');
  assert.equal(created.body.data.book.title, 'One Book');
  assert.equal(created.body.data.originalQuery.body, 'Please explain my latest royalty statement.');

  const detail = await agent.get(`/api/v1/tickets/${created.body.data.ticket._id}`).expect(200);
  assert.equal(detail.body.data.messages.length, 1);
  assert.equal(detail.body.data.messages[0].visibility, 'public');
  assert.equal(detail.body.data.book.title, 'One Book');

  await agent.post('/api/v1/tickets').set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', csrf)
    .send({ bookId: 'BK002', subject: 'A ticket', description: 'This book is not owned by me.' })
    .expect(404);
  await agent.post('/api/v1/tickets').set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', csrf)
    .send({ authorId: 'AUTH002', status: 'Closed', subject: 'A ticket', description: 'No client-controlled owner.' })
    .expect(400);
});

test('general tickets, duplicate submissions, and invalid references have explicit behavior', async () => {
  const agent = request.agent(app);
  const loggedIn = await agent.post('/api/v1/auth/login').set('Origin', 'http://localhost:5173')
    .send({ email: 'one@example.test', password }).expect(200);
  const headers = { Origin: 'http://localhost:5173', 'X-CSRF-Token': loggedIn.body.data.csrfToken };
  const body = { subject: 'Account access question', description: 'I need help updating my account email address.' };
  const first = await agent.post('/api/v1/tickets').set(headers).send(body).expect(201);
  const repeated = await agent.post('/api/v1/tickets').set(headers).send(body).expect(201);
  assert.equal(first.body.data.ticket.bookId, null);
  assert.equal(first.body.data.ticket.status, 'Open');
  assert.notEqual(first.body.data.ticket._id, repeated.body.data.ticket._id);
  assert.equal(await Ticket.countDocuments({ authorId: 'AUTH001', subject: body.subject }), 2);
  await agent.post('/api/v1/tickets').set(headers).send({ ...body, bookId: 'BK999' }).expect(404);
  await agent.get('/api/v1/tickets/not-a-valid-id').expect(400);
  await agent.get('/api/v1/tickets/507f1f77bcf86cd799439011').expect(404);
});

test('zero-valued books remain visible and admin queue pagination is stable', async () => {
  const author = request.agent(app);
  await author.post('/api/v1/auth/login').set('Origin', 'http://localhost:5173')
    .send({ email: 'one@example.test', password }).expect(200);
  const books = await author.get('/api/v1/books').expect(200);
  const zeroBook = books.body.data.books.find((book) => book._id === 'BK001');
  assert.equal(zeroBook.totalCopiesSold, 0);
  assert.equal(zeroBook.royaltyPaid, 0);
  assert.equal(zeroBook.royaltyPending, 0);
  assert.equal(zeroBook.mrp, null);
  assert.equal(zeroBook.publicationDate, null);

  await Ticket.create([
    { authorId: 'AUTH001', subject: 'Page check one' },
    { authorId: 'AUTH002', subject: 'Page check two' },
    { authorId: 'AUTH001', subject: 'Page check three' }
  ]);
  const admin = request.agent(app);
  await admin.post('/api/v1/auth/login').set('Origin', 'http://localhost:5173')
    .send({ email: 'admin@example.test', password }).expect(200);
  const pageOne = await admin.get('/api/v1/admin/tickets?limit=2&page=1&sort=newest').expect(200);
  const pageTwo = await admin.get('/api/v1/admin/tickets?limit=2&page=2&sort=newest').expect(200);
  assert.equal(pageOne.body.data.tickets.length, 2);
  assert.equal(pageOne.body.meta.total, 5);
  assert.equal(pageOne.body.meta.pages, 3);
  assert.equal(pageTwo.body.data.tickets.length, 2);
  assert.notDeepEqual(pageOne.body.data.tickets.map((ticket) => ticket._id), pageTwo.body.data.tickets.map((ticket) => ticket._id));
  await admin.get('/api/v1/admin/tickets?limit=0').expect(400);
  await admin.get('/api/v1/admin/tickets?from=2026-02-30').expect(400);
});

test('only admins can change a ticket status, and invalid statuses are rejected', async () => {
  const authorAgent = request.agent(app);
  const authorLogin = await authorAgent.post('/api/v1/auth/login').set('Origin', 'http://localhost:5173')
    .send({ email: 'one@example.test', password }).expect(200);
  await authorAgent.patch(`/api/v1/tickets/${global.testTicketOne.id}/status`)
    .set('Origin', 'http://localhost:5173').set('X-CSRF-Token', authorLogin.body.data.csrfToken)
    .send({ status: 'Closed' }).expect(403);

  const adminAgent = request.agent(app);
  const adminLogin = await adminAgent.post('/api/v1/auth/login').set('Origin', 'http://localhost:5173')
    .send({ email: 'admin@example.test', password }).expect(200);
  await adminAgent.patch(`/api/v1/tickets/${global.testTicketOne.id}/status`)
    .set('Origin', 'http://localhost:5173').set('X-CSRF-Token', adminLogin.body.data.csrfToken)
    .send({ status: 'On Hold' }).expect(400);
  const result = await adminAgent.patch(`/api/v1/tickets/${global.testTicketOne.id}/status`)
    .set('Origin', 'http://localhost:5173').set('X-CSRF-Token', adminLogin.body.data.csrfToken)
    .send({ status: 'In Progress' }).expect(200);
  assert.equal(result.body.data.ticket.status, 'In Progress');
});

test('admin queue filters and audited response workflow reach the author conversation', async () => {
  const authorAgent = request.agent(app);
  const authorLogin = await authorAgent.post('/api/v1/auth/login').set('Origin', 'http://localhost:5173')
    .send({ email: 'one@example.test', password }).expect(200);
  const created = await authorAgent.post('/api/v1/tickets').set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', authorLogin.body.data.csrfToken)
    .send({ bookId: 'BK001', subject: 'Need help with distribution', description: 'Could you help me understand distribution availability?' })
    .expect(201);
  const ticketId = created.body.data.ticket._id;

  const adminAgent = request.agent(app);
  const adminLogin = await adminAgent.post('/api/v1/auth/login').set('Origin', 'http://localhost:5173')
    .send({ email: 'admin@example.test', password }).expect(200);
  const csrf = adminLogin.body.data.csrfToken;
  const day = new Date().toISOString().slice(0, 10);
  const queue = await adminAgent.get(`/api/v1/admin/tickets?q=Author%20One&status=Open&from=${day}&to=${day}&sort=oldest`)
    .expect(200);
  const row = queue.body.data.tickets.find((ticket) => ticket._id === ticketId);
  assert.ok(row);
  assert.equal(row.author.name, 'Author One');
  assert.equal(row.originalQuery.body, 'Could you help me understand distribution availability?');
  assert.equal(row.book.title, 'One Book');
  assert.ok(queue.body.meta.oldestUnresolvedTicketId);
  const idSearch = await adminAgent.get(`/api/v1/admin/tickets?q=BL-${ticketId}`).expect(200);
  assert.equal(idSearch.body.data.tickets.some((ticket) => ticket._id === ticketId), true);

  const detail = await adminAgent.get(`/api/v1/admin/tickets/${ticketId}`).expect(200);
  assert.equal(detail.body.data.book.title, 'One Book');
  assert.equal(detail.body.data.author.email, 'one@example.test');

  await adminAgent.patch(`/api/v1/admin/tickets/${ticketId}/category`).set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', csrf).send({ category: 'Distribution & Availability' }).expect(200);
  await adminAgent.patch(`/api/v1/admin/tickets/${ticketId}/priority`).set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', csrf).send({ priority: 'High' }).expect(200);
  await adminAgent.post(`/api/v1/admin/tickets/${ticketId}/assign-to-me`).set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', csrf).send({ assignedTo: 'AUTH002' }).expect(400);
  await adminAgent.post(`/api/v1/admin/tickets/${ticketId}/assign-to-me`).set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', csrf).send({}).expect(200);
  await adminAgent.post(`/api/v1/admin/tickets/${ticketId}/notes`).set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', csrf).send({ body: 'Internal follow-up for support staff.' }).expect(201);
  await adminAgent.post(`/api/v1/admin/tickets/${ticketId}/replies`).set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', csrf).send({ body: 'We have updated the distribution details for you.' }).expect(201);

  const adminView = await adminAgent.get(`/api/v1/admin/tickets/${ticketId}`).expect(200);
  assert.equal(adminView.body.data.ticket.status, 'Waiting on Author');
  assert.equal(adminView.body.data.messages.some((message) => message.visibility === 'internal'), true);
  assert.ok(adminView.body.data.ticket.auditTrail.length >= 4);
  assert.ok(adminView.body.data.ticket.auditTrail.every((event) => event.actorId === 'ADMIN001'));

  const authorView = await authorAgent.get(`/api/v1/tickets/${ticketId}`).expect(200);
  assert.equal(authorView.body.data.ticket.status, 'Waiting on Author');
  assert.equal(authorView.body.data.messages.some((message) => message.body.includes('Internal follow-up')), false);
  assert.equal(authorView.body.data.messages.some((message) => message.body.includes('updated the distribution')), true);
  assert.equal(authorView.body.data.ticket.auditTrail, undefined);
  assert.equal(authorView.body.data.ticket.assignedTo, undefined);
});

test('logout clears both cookies and requires CSRF token', async () => {
  const agent = request.agent(app);
  const loggedIn = await agent.post('/api/v1/auth/login').set('Origin', 'http://localhost:5173')
    .send({ email: 'one@example.test', password }).expect(200);
  await agent.post('/api/v1/auth/logout').set('Origin', 'http://localhost:5173').expect(403);
  const logout = await csrfHeader(loggedIn, agent).expect(204);
  assert.equal(logout.headers['set-cookie'].some((cookie) => /bookleaf_session=;/i.test(cookie)), true);
  await agent.get('/api/v1/auth/me').expect(401);
});

test('disallowed frontend origins are rejected', async () => {
  const response = await request(app).post('/api/v1/auth/login').set('Origin', 'https://attacker.example')
    .send({ email: 'one@example.test', password });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'ORIGIN_NOT_ALLOWED');
});

test('AI schema accepts exactly each of the six support categories', () => {
  for (const category of Ticket.categories) {
    assert.deepEqual(validateClassification({ category, priority: 'Medium', priorityExplanation: 'Routine request without an urgent impact.' }), {
      category, priority: 'Medium', priorityExplanation: 'Routine request without an urgent impact.'
    });
  }
  assert.throws(() => validateClassification({ category: 'other', priority: 'Medium', priorityExplanation: 'x' }), { code: 'MALFORMED_OUTPUT' });
});

test('classification persists mock results and preserves admin category and priority overrides', async () => {
  for (const [index, category] of Ticket.categories.entries()) {
    const ticket = await Ticket.create({ authorId: authorOne.id, subject: `Category check ${index}` });
    await Message.create({ ticketId: ticket.id, senderId: authorOne.id, senderRole: 'author', body: 'Please help me with this support request.', visibility: 'public' });
    const service = createAiSupportService({ providerFactory: () => ({
      name: 'mock', model: 'mock-test',
      classify: async () => ({ category, priority: 'Medium', priorityExplanation: 'The request is useful to answer but not urgent.' })
    }) });
    await service.classifyTicket(ticket.id);
    const saved = await Ticket.findById(ticket.id);
    assert.equal(saved.aiClassification.status, 'complete');
    assert.equal(saved.category, category);
    assert.equal(saved.priority, 'Medium');
  }

  const ticket = await Ticket.create({ authorId: authorOne.id, subject: 'Human override example', category: Ticket.categories[0], categorySource: 'human', priority: 'Low', prioritySource: 'human' });
  await Message.create({ ticketId: ticket.id, senderId: authorOne.id, senderRole: 'author', body: 'The book record needs review.', visibility: 'public' });
  const service = createAiSupportService({ providerFactory: () => ({ name: 'mock', model: 'mock-test', classify: async () => ({ category: Ticket.categories[1], priority: 'High', priorityExplanation: 'ISBN errors need timely review.' }) }) });
  await service.classifyTicket(ticket.id);
  const saved = await Ticket.findById(ticket.id);
  assert.equal(saved.category, Ticket.categories[0]);
  assert.equal(saved.priority, 'Low');
  assert.equal(saved.aiClassification.category, Ticket.categories[1]);
});

test('priority examples preserve all four levels, and malformed/provider errors fail safely', async () => {
  for (const [index, priority] of Ticket.priorities.entries()) {
    const ticket = await Ticket.create({ authorId: authorOne.id, subject: `Priority check ${index}` });
    await Message.create({ ticketId: ticket.id, senderId: authorOne.id, senderRole: 'author', body: 'A request with an impact and timeline described.', visibility: 'public' });
    const service = createAiSupportService({ providerFactory: () => ({ name: 'mock', model: 'mock-test', classify: async () => ({ category: Ticket.categories[5], priority, priorityExplanation: `The details support ${priority} priority.` }) }) });
    await service.classifyTicket(ticket.id);
    assert.equal((await Ticket.findById(ticket.id)).priority, priority);
  }

  const malformedTicket = await Ticket.create({ authorId: authorOne.id, subject: 'Malformed model output' });
  await Message.create({ ticketId: malformedTicket.id, senderId: authorOne.id, senderRole: 'author', body: 'Please review the request.', visibility: 'public' });
  await createAiSupportService({ providerFactory: () => ({ name: 'mock', model: 'mock-test', classify: async () => 'not-json' }) }).classifyTicket(malformedTicket.id);
  let saved = await Ticket.findById(malformedTicket.id);
  assert.equal(saved.aiClassification.status, 'failed');
  assert.equal(saved.aiClassification.errorCode, 'MALFORMED_OUTPUT');
  assert.equal(saved.category, 'General Inquiry');
  assert.equal(saved.priority, 'Medium');

  const failedTicket = await Ticket.create({ authorId: authorOne.id, subject: 'Provider unavailable' });
  await Message.create({ ticketId: failedTicket.id, senderId: authorOne.id, senderRole: 'author', body: 'Please check a book update.', visibility: 'public' });
  await createAiSupportService({ providerFactory: () => ({ name: 'mock', model: 'mock-test', classify: async () => { throw Object.assign(new Error('private provider detail'), { status: 429 }); } }) }).classifyTicket(failedTicket.id);
  saved = await Ticket.findById(failedTicket.id);
  assert.equal(saved.aiClassification.status, 'failed');
  assert.equal(saved.aiClassification.errorCode, 'RATE_LIMITED');
  assert.equal(safeProviderError({ status: 401 }), 'INVALID_API_KEY');
  assert.equal(safeProviderError({ status: 429, code: 'insufficient_quota' }), 'QUOTA_EXHAUSTED');
  assert.equal(safeProviderError({ name: 'APIConnectionTimeoutError' }), 'TIMEOUT');
});

test('draft failure leaves the manual author-visible reply workflow available', async () => {
  const ticket = await Ticket.create({ authorId: authorOne.id, subject: 'Draft provider outage' });
  await Message.create({ ticketId: ticket.id, senderId: authorOne.id, senderRole: 'author', body: 'Please help with my account details.', visibility: 'public' });
  const service = createAiSupportService({ providerFactory: () => ({ name: 'mock', model: 'mock-test', draft: async () => { throw Object.assign(new Error('private provider detail'), { status: 503 }); } }) });
  const draft = await service.generateDraft(ticket.id);
  assert.equal(draft.status, 'failed');
  assert.equal(draft.text, null);
  const TicketService = require('../src/services/TicketService');
  await TicketService.addMessage(ticket.id, { id: admin.id, role: 'admin' }, 'A teammate will verify this and follow up.', 'public');
  const authorView = await TicketService.getConversation(ticket.id, { id: authorOne.id, role: 'author' });
  assert.equal(authorView.messages.at(-1).body, 'A teammate will verify this and follow up.');
  assert.equal(authorView.ticket.aiDraft, undefined);
});

test('valid AI drafts are cached, malformed drafts fail, and regeneration is explicit', async () => {
  const ticket = await Ticket.create({ authorId: authorOne.id, subject: 'Royalty policy question', category: 'Royalty & Payments' });
  await Message.create({ ticketId: ticket.id, senderId: authorOne.id, senderRole: 'author', body: 'How do quarterly royalty payments work?', visibility: 'public' });
  let calls = 0;
  const service = createAiSupportService({ providerFactory: () => ({
    name: 'mock', model: 'mock-test', draft: async () => { calls += 1; return { draft: 'I understand your question. Royalties are calculated quarterly; we can verify your account details before confirming an amount.', articleIds: ['royalty_schedule'] }; }
  }) });
  const first = await service.generateDraft(ticket.id);
  const cached = await service.generateDraft(ticket.id);
  assert.equal(first.status, 'complete');
  assert.equal(cached.text, first.text);
  assert.equal(calls, 1);
  const regenerated = await service.generateDraft(ticket.id, { force: true });
  assert.equal(regenerated.status, 'complete');
  assert.equal(calls, 2);

  const malformed = await Ticket.create({ authorId: authorOne.id, subject: 'Malformed draft response' });
  await Message.create({ ticketId: malformed.id, senderId: authorOne.id, senderRole: 'author', body: 'Please answer my question.', visibility: 'public' });
  const malformedDraft = await createAiSupportService({ providerFactory: () => ({ name: 'mock', model: 'mock-test', draft: async () => 'not-json' }) }).generateDraft(malformed.id);
  assert.equal(malformedDraft.status, 'failed');
  assert.equal(malformedDraft.errorCode, 'MALFORMED_OUTPUT');
});
