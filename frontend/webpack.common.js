const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const webpack = require('webpack');
require('dotenv').config({ path: './.env' });

module.exports = {
  entry: {
    app: './client/index.jsx',
    admin: './admin/index.jsx',
    storage: './admin/storage.jsx',
    calling: './admin/calling.jsx',
    callingPush: './admin/callingPush.jsx',
    socialAuth: './admin/socialAuth.jsx',
  },
  cache: {
    type: 'filesystem',
    cacheDirectory: path.resolve(__dirname, '.webpack-cache'),
    buildDependencies: { config: [__filename] },
  },
  resolve: { extensions: ['.js', '.jsx', '.css'] },
  module: {
    unsafeCache: true,
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        options: { cacheDirectory: true, cacheCompression: false },
      },
      { test: /\.css$/, use: ['style-loader', 'css-loader', 'postcss-loader'] },
      {
        test: /\.(jpe?g|png|mp3)$/,
        use: [{ loader: 'file-loader', options: { outputPath: 'public/images' } }],
      },
    ],
  },
  output: { publicPath: '/' },
  plugins: [
    new webpack.DefinePlugin({
      __APP_IS_DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
      __API_BASE_URL__: JSON.stringify(process.env.API_BASE_URL || ''),
      __SOCKET_URL__: JSON.stringify(process.env.SOCKET_URL || ''),
      __PUBLIC_ORIGIN__: JSON.stringify(process.env.PUBLIC_ORIGIN || ''),
      __CLIENT_API_BASE_URL__: JSON.stringify(process.env.CLIENT_API_BASE_URL || process.env.API_BASE_URL || ''),
      __CLIENT_SOCKET_URL__: JSON.stringify(process.env.CLIENT_SOCKET_URL || process.env.SOCKET_URL || ''),
      __CLIENT_PUBLIC_ORIGIN__: JSON.stringify(process.env.CLIENT_PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN || ''),
      __ADMIN_API_BASE_URL__: JSON.stringify(process.env.ADMIN_API_BASE_URL || process.env.API_BASE_URL || ''),
      __ADMIN_SOCKET_URL__: JSON.stringify(process.env.ADMIN_SOCKET_URL || process.env.SOCKET_URL || ''),
      __ADMIN_PUBLIC_ORIGIN__: JSON.stringify(process.env.ADMIN_PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN || ''),
      __CHAT_UPLOAD_LIMIT_MB__: JSON.stringify(Number(process.env.CHAT_UPLOAD_LIMIT_MB || 100)),
      __AVATAR_UPLOAD_LIMIT_MB__: JSON.stringify(Number(process.env.AVATAR_UPLOAD_LIMIT_MB || 10)),
    }),
    new HtmlWebpackPlugin({ template: './client/index.html', chunks: ['app'], filename: 'index.html' }),
    new HtmlWebpackPlugin({ template: './admin/index.html', chunks: ['admin'], filename: 'admin/index.html' }),
    new HtmlWebpackPlugin({ template: './admin/storage.html', chunks: ['storage'], filename: 'admin/storage.html' }),
    new HtmlWebpackPlugin({ template: './admin/calling.html', chunks: ['calling'], filename: 'admin/calling.html' }),
    new HtmlWebpackPlugin({ template: './admin/callingPush.html', chunks: ['callingPush'], filename: 'admin/calling-push.html' }),
    new HtmlWebpackPlugin({ template: './admin/socialAuth.html', chunks: ['socialAuth'], filename: 'admin/social-auth.html' }),
  ],
};
