const webpack = require('webpack'); // Access built-in webpack plugins

module.exports = [
{
  name: 'basic',
  mode: 'development',
  //mode: 'production',
  entry: './src/basic_example.js',
  output: {
    filename: 'basic_example_bundle.js'
  },
  devtool: 'source-map',
  devServer: {
    static: './dist'
  },
  resolve: {
    fallback: {
      fs: false,
      "crypto": require.resolve("crypto-browserify"),
      "stream": require.resolve("stream-browserify"),
      "path": require.resolve("path-browserify"),
      "buffer": false
    }
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader',
        ],
      }
    ],
  },
  experiments: {
    // Used by loadGpkg.js to load sql.js
    asyncWebAssembly: true
  }
},
{
  name: 'proj4',
  mode: 'development',
  //mode: 'production',
  entry: './src/proj4_example.js',
  output: {
    filename: 'proj4_example_bundle.js'
  },
  devtool: 'source-map',
  devServer: {
    static: './dist'
  },
  resolve: {
    fallback: {
      fs: false,
      "crypto": require.resolve("crypto-browserify"),
      "stream": require.resolve("stream-browserify"),
      "path": require.resolve("path-browserify"),
      "buffer": false
    }
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader',
        ],
      }
    ],
  },
  experiments: {
    // Used by loadGpkg.js to load sql.js
    asyncWebAssembly: true
  }
}];
