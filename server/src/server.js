const http = require('node:http');
const app = require('./app');
const { getConfig } = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const { createSocketServer } = require('./realtime/socketServer');

async function start() {
  const config = getConfig();
  await connectDatabase(config.mongoUri);
  const server = http.createServer(app);
  const io = createSocketServer(server, { config });
  server.listen(config.port, () => console.log(`BookLeaf API listening on port ${config.port}`));

  const shutdown = async (signal) => {
    console.log(`${signal} received; shutting down`);
    io.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  start().catch((error) => { console.error('API startup failed:', error.message); process.exit(1); });
}

module.exports = { start };
