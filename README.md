# OpenLayers OGC GeoPackage Loader

[![npm](https://img.shields.io/npm/v/ol-load-geopackage)](https://www.npmjs.com/package/ol-load-geopackage)

A JavaScript module to load OGC GeoPackage vector data tables into OpenLayers Vector Sources, transforming the data (if necessary) to match the specified display projection. This was primarily designed to directly load data exported by the QGIS [Package Layers](https://docs.qgis.org/3.16/en/docs/user_manual/processing_algs/qgis/database.html#package-layers) Processing Toolbox operation. As such, it will also (if it exists) load the associated "layer_styles" table of SLD XML styling data exported by QGIS in the same GeoPackage. It is implemented as an NPM module and is a lightweight wrapper around the [sql.js](https://github.com/sql-js/sql.js) SQLite JavaScript library.

The current version was tested with OpenLayers 10.7, but should work with OpenLayers 6+.

## Examples (in GitHub repository)

Each example (in the [GitHub repository](https://github.com/richard-thomas/ol-load-geopackage)) is presented as HTML/JavaScript source code and as directly viewable web pages (built using both [Vite](https://vite.dev/) and the [Webpack](https://webpack.js.org/) module bundler).

- Basic Example: web page: [Vite](https://richard-thomas.github.io/ol-load-geopackage/examples-vite/dist/basic_example.html), [Webpack](https://richard-thomas.github.io/ol-load-geopackage/examples/dist/basic_example.html) (sources: [Vite HTML](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples-vite/basic_example.html), [Webpack HTML](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples/dist/basic_example.html),
[JavaScript (common)](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples/src/basic_example.js))
  - Loads vector tables and associated QGIS "layer_styles" SLD XML strings from an OGC GeoPackage and render all tables as layers on an OpenLayers map. Displays details of package contents.

- Proj4 Example: web page: [Vite](https://richard-thomas.github.io/ol-load-geopackage/examples-vite/dist/proj4_example.html), [Webpack](https://richard-thomas.github.io/ol-load-geopackage/examples/dist/proj4_example.html) (sources: [Vite HTML](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples-vite/proj4_example.html), [Webpack HTML](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples/dist/proj4_example.html),
[JavaScript (common)](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples/src/proj4_example.js))
  - Used in conjunction with Proj4js module to enable additional projections to those built in to OpenLayers. These other projections can be for the input source data and/or the output display projection. Also demonstrates loading required sql.js WebAssembly binary (WASM) from an external Content Delivery Network (CDN) site.

Note: identical JavaScript code is used in the Webpack/Vite versions, with the HTML code only being very subtly different.

You can try the examples with your own GeoPackage data files (without having to install Node.js or WebPack) by cloning the GitHub repository then editing the "gpkgFile" definition in the HTML files. In order to ensure all the files are able to load you will have to host them with a (simple) local HTTP server, for example by running in the examples/dist or examples-vite/dist folder...

```bash
python -m http.server (Windows)
python3 -m http.server (macOS/Linux)
```

...which will allow you to view them in a browser at [http://localhost:8000/](http://localhost:8000/). Note however that if your source data uses projections (SRS) other than the few built in to OpenLayers, then you would need to modify the .js source files (as in the Proj4 example) to add more SRS and rebuild the .js bundles.

## Installation

Use Node.js to install the NPM package: [ol-load-geopackage](https://www.npmjs.com/package/ol-load-geopackage)

```bash
npm install --save ol-load-geopackage
```

After running npm install, the sql.js WebAssembly file (sql-wasm.wasm) will need to be copied from folder _node_modules/sql.js/dist/_ to a folder where the web page can load it from (unless you plan to load it from a CDN).

## Basic usage

This package must be imported as a module - it is not designed to be loaded directly with a \<script\> tag. The examples above best demonstrate usage, but the following code segment outlines the basic methodology:

```javascript
import { initSqlJsWasm, loadGpkg } from 'ol-load-geopackage';

initSqlJsWasm('.');
var gpkgPromise;
try {
    gpkgPromise = loadGpkg(<gpkgFile>, <displayProjection>);
} catch (error) {
    alert('loadGpkg() failed before Promise set-up:\n' + error);
}
gpkgPromise
    .then(([dataFromGpkg, sldsFromGpkg]) => {
        for (var table in dataFromGpkg) {
            // Handle each OpenLayers Vector Source:
            //   dataFromGpkg[table]
        }
        for (var layerName in sldsFromGpkg) {
            // Handle each SLD XML string:
            //   sldsFromGpkg[layerName]
        }
    })
    .catch(error => alert('ol-load-geopackage error:\n' + error));
```

Note that the _initSqlJsWasm()_ statement will start the asynchronous loading of the required sql.js WebAssembly binary file sql-wasm.wasm (from the current folder in this case), so is best placed early in the code.

### Building with Webpack

The (shared) support files used to build the examples using [Webpack 5](https://webpack.js.org/) ([package.json](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples/package.json), [webpack.config.js](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples/webpack.config.js)) are in the _examples_ folder. If you clone the repository then you can (re-)build the code bundles (for both examples) with the commands:

```bash
cd examples
npm install
npm run-script sql-install
npm run-script build
```
You can then test the output code placed in the dist folder in a web browser at URL [http://localhost:8000/](http://localhost:8000/) using a simple HTTP server:

```bash
cd dist
python -m http.server (Windows)
python3 -m http.server (macOS/Linux)
```

The Webpack dev-server can be used to automatically re-build, act as a webhost and trigger the browser to reload every time the code changes. The following script commands (defined in [package.json](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples/package.json)) will start the dev-server for one or the other example:

```bash
npm run-script start-basic
npm run-script start-proj4
```

### Building with Vite

The (shared) support files used to build the examples using [Vite](https://vite.dev/) ([package.json](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples-vite/package.json), [vite.config.js](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples-vite/vite.config.js)) are in the _examples-vite_ folder. If you clone the repository then you can (re-)build the code bundles (for both examples) with the commands:

```bash
cd examples-vite
npm install
npm run-script sql-install
npm run-script build
```
Although you can then test the output code placed in the dist folder using the python HTTP server method (as in the Webpack example), it is easier to use Vite's built in HTTP server with:

```bash
npm run-script preview
```

The Vite dev server can be used to automatically re-build, act as a webhost and trigger the browser to reload every time the code changes. The following script commands (defined in [package.json](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples-vite/package.json)) will start the dev server at a top level _index.html_ file which has links to the 2 examples:

```bash
npm run-script dev
```

## API

The JavaScript module has 3 exported functions/constants which are described in the separate [API Specification](API.md):

- [initSqlJsWasm()](API.md#initsqljswasmsqljswasmdir) - Initialisation: start loading of required sql.js WASM file
- [loadGpkg()](API.md#loadgpkggpkgfile-displayprojection) - start asynchronous loading and data extraction of GeoPackage
- [sql_js_version](API.md#sql_js_version) - NPM version number of  underlying sql.js module

## Migrating from ol-load-geopackage v1.x.x

In v1.x.x the sql.js WASM file (sql-wasm.wasm) was implicitly loaded from the current folder as a side effect of loading the module:

```javascript
import loadGpkg from 'ol-load-geopackage';
```
From v2.0.0 the WASM must be explicitly loaded by invoking the new [initSqlJsWasm()](API.md#initsqljswasmsqljswasmdir) function, with the sql-wasm.wasm file placed in the root folder if not specified as a parameter. In this example, it is placed in the current folder to mimic v1.x.x behaviour:

```javascript
import { initSqlJsWasm, loadGpkg } from 'ol-load-geopackage';
initSqlJsWasm('.');
```

## Contributions

For bug reports, enhancement requests or code contributions please see [CONTRIBUTING](CONTRIBUTING.md).

## Licence

ISC - see [LICENCE](LICENCE.md).
