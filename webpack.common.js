const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const webpack = require('webpack');
require('dotenv').config({ path: './.env' });

module.exports = {
  entry: {
    app: './client/index.jsx',
    admin: './admin/index.jsx',
  },
  cache: {
    type: 'filesystem',
    cacheDirectory: path.resolve(__dirname, '.webpack-cache'),
    buildDependencies: {
      config: [__filename],
    },
  },
  resolve: {
    extensions: ['.js', '.jsx', '.css'],
  },
  module: {
    unsafeCache: true,
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        options: {
          cacheDirectory: true,
          cacheCompression: false,
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
      {
        test: /\.(jpe?g|png|mp3)$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              outputPath: 'public/images',
            },
          },
        ],
      },
    ],
  },
  output: {
    publicPath: '/',
  },
  plugins: [
    new webpack.DefinePlugin({
      __APP_IS_DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
      __CHAT_UPLOAD_LIMIT_MB__: JSON.stringify(
        Number(process.env.CHAT_UPLOAD_LIMIT_MB || 100)
      ),
      __AVATAR_UPLOAD_LIMIT_MB__: JSON.stringify(
        Number(process.env.AVATAR_UPLOAD_LIMIT_MB || 10)
      ),
    }),
    new HtmlWebpackPlugin({
      template: './client/index.html',
      chunks: ['app'],
      filename: 'index.html',
    }),
    new HtmlWebpackPlugin({
      template: './admin/index.html',
      chunks: ['admin'],
      filename: 'admin/index.html',
    }),
  ],
};
