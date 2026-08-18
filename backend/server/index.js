const server = require('./server');
const { bootstrap } = require('./bootstrap');

const port = process.env.PORT || 8080;

(async () => {
  await bootstrap({ startScheduledWorker: true });
  server.listen(port);
  console.log(`[${port}] server running...`);
})();
