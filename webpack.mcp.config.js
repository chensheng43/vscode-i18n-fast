//@ts-check
'use strict';

const path = require('path');
const webpack = require('webpack');

/** @type {import('webpack').Configuration} */
const mcpConfig = {
  target: 'node',
  mode: 'none',
  entry: './src/mcp/server.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'mcp-server.js',
    libraryTarget: 'commonjs2',
    clean: false,
  },
  externals: {
    fsevents: 'commonjs fsevents',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@mcp': path.resolve(__dirname, 'src/mcp'),
      '@vscode-ext': path.resolve(__dirname, 'src/vscode'),
    },
  },
  module: {
    rules: [{
      test: /\.ts$/,
      exclude: /node_modules/,
      use: [{ loader: 'ts-loader' }],
    }],
  },
  devtool: 'nosources-source-map',
  plugins: [new webpack.BannerPlugin({ banner: '#!/usr/bin/env node', raw: true, entryOnly: true })],
};

module.exports = [mcpConfig];
