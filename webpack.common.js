const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

module.exports = {
  entry: './client/index.jsx',
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
  plugins: [
    new HtmlWebpackPlugin({
      template: './client/index.html',
    }),
  ],
};
