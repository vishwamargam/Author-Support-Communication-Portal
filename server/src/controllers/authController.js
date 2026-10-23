const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { getConfig } = require('../config/env');
const { createCsrfToken, validCsrfToken, csrfCookieName, setSessionCookies, clearSessionCookies } = require('../utils/sessionCookies');
const { disconnectSocketsForSession } = require('../realtime/ticketEvents');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateLoginBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }
  const unknownKeys = Object.keys(body).filter((key) => !['email', 'password'].includes(key));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (unknownKeys.length || !EMAIL_PATTERN.test(email) || email.length > 254 ||
      typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 1024) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide a valid email and a password up to 1024 characters.',
      unknownKeys.length ? { unknownFields: unknownKeys } : undefined);
  }
  return { email, password: body.password };
}

async function login(req, res, next) {
  try {
    const { email, password } = validateLoginBody(req.body);
    const user = await User.findOne({ email, isActive: true }).select('+passwordHash');
    // Perform a dummy bcrypt check for unknown emails to reduce timing-based account discovery.
    const dummyHash = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.1j7WqXK2WbZ0C2aR6J3E2oHfW9Y7yLQe';
    const matches = await bcrypt.compare(password, user?.passwordHash || dummyHash);
    if (!user || !matches) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    const portal = req.get('x-bookleaf-portal');
    if (portal && !['author', 'admin'].includes(portal)) {
      throw new ApiError(400, 'INVALID_PORTAL', 'X-BookLeaf-Portal must be author or admin.');
    }
    if (portal && portal !== user.role) {
      throw new ApiError(403, 'PORTAL_ROLE_MISMATCH', 'Use the login page for your account role.');
    }

    const config = getConfig();
    const token = jwt.sign({ role: user.role }, config.jwtSecret, {
      subject: user.id,
      expiresIn: config.sessionTtlSeconds,
      issuer: 'bookleaf-author-support',
      audience: 'bookleaf-portal'
    });
    // Keep a valid pre-login token stable so a second tab cannot invalidate an
    // already-open session's in-memory CSRF header.
    const csrfName = csrfCookieName(config, user.role);
    const csrfToken = validCsrfToken(req.cookies?.[csrfName])
      ? req.cookies[csrfName]
      : createCsrfToken();
    setSessionCookies(res, token, csrfToken, user.role);
    res.json({ data: { user: user.toJSON(), csrfToken } });
  } catch (error) { next(error); }
}

async function currentUser(req, res) {
  const user = await User.findOne({ _id: req.user.id, isActive: true });
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'The session is no longer active.');
  res.json({ data: { user: user.toJSON() } });
}

function logout(req, res) {
  disconnectSocketsForSession(req.sessionToken);
  clearSessionCookies(res, req.user.role);
  res.status(204).end();
}

function csrf(req, res) {
  const config = getConfig();
  const role = req.query.role || 'author';
  if (!['author', 'admin'].includes(role)) {
    throw new ApiError(400, 'INVALID_PORTAL', 'role must be author or admin.');
  }
  const csrfName = csrfCookieName(config, role);
  // This endpoint is called during app startup and on refresh. Rotating on
  // every call races across tabs because cookies are shared but JS state is not.
  const csrfToken = validCsrfToken(req.cookies?.[csrfName])
    ? req.cookies[csrfName]
    : createCsrfToken();
  res.cookie(csrfName, csrfToken, {
    httpOnly: false,
    secure: config.nodeEnv === 'production',
    sameSite: config.cookieSameSite,
    path: '/api/v1',
    maxAge: config.sessionTtlSeconds * 1000
  });
  res.json({ data: { csrfToken } });
}

module.exports = { login, currentUser, logout, csrf };
