const server = require('./server');
const connectDb = require('./db/connect');
const { startScheduledMessageWorker } = require('./helpers/scheduledMessages');

const port = process.env.PORT || 8080;

(async () => {
  await connectDb();
  startScheduledMessageWorker();
  server.listen(port);
  console.log(`[${port}] server running...`);
})();
