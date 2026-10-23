const { randomBytes, createHmac, timingSafeEqual } = require('node:crypto');
const { getConfig } = require('../config/env');

function cookieOptions(httpOnly) {
  const config = getConfig();
  return {
    httpOnly,
    secure: config.nodeEnv === 'production',
    sameSite: config.cookieSameSite,
    path: '/api/v1',
    maxAge: config.sessionTtlSeconds * 1000
  };
}

function createCsrfToken() {
  const nonce = randomBytes(32).toString('base64url');
  const signature = createHmac('sha256', getConfig().jwtSecret).update(nonce).digest('base64url');
  return `${nonce}.${signature}`;
}

function validCsrfToken(token) {
  if (typeof token !== 'string') return false;
  const [nonce, signature, extra] = token.split('.');
  if (!nonce || !signature || extra || nonce.length > 100 || signature.length > 100) return false;
  const expected = createHmac('sha256', getConfig().jwtSecret).update(nonce).digest();
  let provided;
  try { provided = Buffer.from(signature, 'base64url'); } catch (_error) { return false; }
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function sessionCookieName(config, role) {
  return role === 'admin' ? config.adminCookieName : config.cookieName;
}

function csrfCookieName(config, role) {
  return role === 'admin' ? config.adminCsrfCookieName : config.csrfCookieName;
}

function setSessionCookies(res, token, csrfToken, role = 'author') {
  const config = getConfig();
  res.cookie(sessionCookieName(config, role), token, cookieOptions(true));
  res.cookie(csrfCookieName(config, role), csrfToken, cookieOptions(false));
}

function clearSessionCookies(res, role = 'author') {
  const config = getConfig();
  const options = cookieOptions(true);
  delete options.maxAge;
  res.clearCookie(sessionCookieName(config, role), options);
  res.clearCookie(csrfCookieName(config, role), { ...options, httpOnly: false });
}

module.exports = { createCsrfToken, validCsrfToken, sessionCookieName, csrfCookieName, setSessionCookies, clearSessionCookies };
