const server = require('./server');
const connectDb = require('./db/connect');

const port = process.env.PORT || 8080;

(async () => {
  await connectDb();
  server.listen(port);
  console.log(`[${port}] server running...`);
})();
