/* eslint-disable no-console */
const net = require('net');

const port = Number(process.argv[2] || 8080);
const host = process.argv[3] || '127.0.0.1';
const retryMs = 500;
const timeoutMs = 120000;
const startedAt = Date.now();

const wait = () => {
  const socket = new net.Socket();

  socket.setTimeout(1500);
  socket.once('connect', () => {
    socket.destroy();
    console.log(`[wait-for-port] ${host}:${port} is ready`);
    process.exit(0);
  });

  socket.once('timeout', () => {
    socket.destroy();
    retry();
  });

  socket.once('error', () => {
    socket.destroy();
    retry();
  });

  socket.connect(port, host);
};

const retry = () => {
  if (Date.now() - startedAt > timeoutMs) {
    console.error(
      `[wait-for-port] timeout after ${timeoutMs}ms waiting for ${host}:${port}`
    );
    process.exit(1);
  }
  setTimeout(wait, retryMs);
};

wait();
