const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');

function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  let normalized = error;
  if (error instanceof mongoose.Error.ValidationError) {
    normalized = new ApiError(400, 'VALIDATION_ERROR', 'The request contains invalid data.',
      Object.values(error.errors).map((item) => ({ field: item.path, message: item.message })));
  } else if (error instanceof mongoose.Error.CastError) {
    normalized = new ApiError(400, 'INVALID_ID', 'A supplied identifier is invalid.');
  } else if (error?.code === 11000) {
    normalized = new ApiError(409, 'DUPLICATE_RECORD', 'A record with that unique value already exists.');
  } else if (error?.type === 'entity.parse.failed') {
    normalized = new ApiError(400, 'INVALID_JSON', 'Request body must contain valid JSON.');
  } else if (error?.type === 'entity.too.large') {
    normalized = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }

  const status = normalized.statusCode || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({
    error: {
      code: normalized.code || 'INTERNAL_ERROR',
      message: status >= 500 && process.env.NODE_ENV === 'production'
        ? 'An unexpected server error occurred.'
        : (normalized.message || 'An unexpected server error occurred.'),
      ...(normalized.details ? { details: normalized.details } : {})
    },
    requestId: req.id
  });
}

module.exports = errorHandler;
