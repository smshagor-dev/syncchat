const path = require('path');
require('dotenv').config({ path: './.env' });
const common = require('./webpack.common');

const backendPort = Number(process.env.PORT || 8080);
const backendHost = process.env.DEV_BACKEND_HOST || '127.0.0.1';
const backendTarget = process.env.DEV_BACKEND_TARGET
  || `http://${backendHost}:${backendPort}`;

module.exports = {
  ...common,
  mode: 'development',
  devtool: 'eval-cheap-module-source-map',
  optimization: {
    removeAvailableModules: false,
    removeEmptyChunks: false,
    splitChunks: false,
  },
  watchOptions: {
    ignored: /node_modules/,
  },
  devServer: {
    static: {
      directory: path.resolve(__dirname, 'client/public'),
    },
    port: 3000,
    historyApiFallback: {
      rewrites: [
        { from: /^\/admin(\/.*)?$/, to: '/admin/index.html' },
        { from: /./, to: '/index.html' },
      ],
    },
    proxy: [
      {
        context: ['/api', '/socket.io', '/uploads'],
        target: backendTarget,
        changeOrigin: true,
        ws: true,
        logLevel: 'silent',
        onError(err, req, res) {
          const hasHttpResponse =
            res
            && typeof res.writeHead === 'function'
            && typeof res.end === 'function';

          if (!hasHttpResponse) {
            console.error(
              `[proxy] ${req?.method || 'WS'} ${req?.url || ''} -> ${backendTarget} failed: ${err?.code || err?.message || 'PROXY_ERROR'}`
            );
            return;
          }

          if (res.headersSent) return;

          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Backend is unavailable',
              target: backendTarget,
              code: err?.code || 'PROXY_ERROR',
            })
          );
        },
      },
    ],
    // allows to open the browser automatically when the project is run
    open: true,
  },
};
