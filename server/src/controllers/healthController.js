const mongoose = require('mongoose');

function health(_req, res) {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    data: { status: connected ? 'ok' : 'degraded', database: connected ? 'connected' : 'disconnected' }
  });
}

module.exports = { health };
