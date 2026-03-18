const path = require('path');
const common = require('./webpack.common');

module.exports = {
  ...common,
  mode: 'production',
  performance: {
    hints: 'warning',
    maxEntrypointSize: 2 * 1024 * 1024,
    maxAssetSize: 2 * 1024 * 1024,
  },
  output: {
    path: path.resolve(__dirname, 'client/public'),
    filename: '[name].[fullhash].js',
  },
};
