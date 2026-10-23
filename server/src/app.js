const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { getConfig } = require('./config/env');
const requestId = require('./middleware/requestId');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const authorRoutes = require('./routes/authorRoutes');
const bookRoutes = require('./routes/bookRoutes');
const originGuard = require('./middleware/originGuard');
const adminTicketRoutes = require('./routes/adminTicketRoutes');

const app = express();
const config = getConfig();
app.disable('x-powered-by');
app.use(helmet());
const allowedOrigins = config.corsOrigin.split(',').map((value) => value.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    return callback(null, Boolean(origin && allowedOrigins.includes(origin)));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-BookLeaf-Portal']
}));
// Assign an ID before parsers so malformed and oversized bodies also receive
// the same traceable API error envelope as route-level failures.
app.use(requestId);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(originGuard(allowedOrigins));
app.use('/api/v1', healthRoutes);
app.use('/api/v1', authRoutes);
app.use('/api/v1/authors', authorRoutes);
app.use('/api/v1/books', bookRoutes);
app.use('/api/v1/admin/tickets', adminTicketRoutes);
app.use('/api/v1/tickets', ticketRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
