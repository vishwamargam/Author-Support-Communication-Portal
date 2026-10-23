const dotenv = require('dotenv');
const path = require('node:path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value.trim();
}

function getConfig({ requireSeedCredentials = false } = {}) {
  const config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT || 4000),
    mongoUri: required('MONGODB_URI'),
    jwtSecret: required('JWT_SECRET'),
    sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS || 28800),
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174',
    cookieSameSite: (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase(),
    cookieName: process.env.COOKIE_NAME || 'bookleaf_session',
    csrfCookieName: process.env.CSRF_COOKIE_NAME || 'bookleaf_csrf',
    adminCookieName: process.env.ADMIN_COOKIE_NAME || 'bookleaf_admin_session',
    adminCsrfCookieName: process.env.ADMIN_CSRF_COOKIE_NAME || 'bookleaf_admin_csrf'
  };
  if (config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');
  if (!Number.isInteger(config.sessionTtlSeconds) || config.sessionTtlSeconds < 300 || config.sessionTtlSeconds > 604800) {
    throw new Error('SESSION_TTL_SECONDS must be an integer between 300 and 604800.');
  }
  if (!['lax', 'strict', 'none'].includes(config.cookieSameSite)) {
    throw new Error('COOKIE_SAME_SITE must be lax, strict, or none.');
  }
  if (config.cookieSameSite === 'none' && config.nodeEnv !== 'production') {
    throw new Error('COOKIE_SAME_SITE=none is allowed only in production, where cookies are Secure.');
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  if (requireSeedCredentials) {
    config.demoAuthorPassword = required('DEMO_AUTHOR_PASSWORD');
    config.adminEmail = required('ADMIN_EMAIL').toLowerCase();
    config.adminPassword = required('ADMIN_PASSWORD');
    if (config.demoAuthorPassword.length < 12 || config.adminPassword.length < 12) {
      throw new Error('Demo author and admin passwords must be at least 12 characters.');
    }
  }
  return config;
}

function getAiConfig() {
  const provider = (process.env.AI_PROVIDER || 'disabled').trim().toLowerCase();
  if (!['disabled', 'gemini'].includes(provider)) {
    throw new Error('AI_PROVIDER must be gemini or disabled.');
  }
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 12000);
  const classificationMaxTokens = Number(process.env.AI_CLASSIFICATION_MAX_TOKENS || 250);
  const draftMaxTokens = Number(process.env.AI_DRAFT_MAX_TOKENS || 450);
  for (const [name, value, min, max] of [
    ['AI_TIMEOUT_MS', timeoutMs, 1000, 60000],
    ['AI_CLASSIFICATION_MAX_TOKENS', classificationMaxTokens, 80, 1000],
    ['AI_DRAFT_MAX_TOKENS', draftMaxTokens, 100, 1500]
  ]) {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  }
  return {
    provider,
    apiKey: process.env.GEMINI_API_KEY?.trim() || '',
    model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
    timeoutMs, classificationMaxTokens, draftMaxTokens
  };
}

module.exports = { getConfig, getAiConfig };
