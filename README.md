# OpenLayers OGC GeoPackage Loader

A JavaScript module to load OGC GeoPackage vector data tables into OpenLayers Vector Sources, transforming the data (if necessary) to match the specified display projection. This was primarily designed to directly load data exported by the QGIS [Package Layers](https://docs.qgis.org/3.16/en/docs/user_manual/processing_algs/qgis/database.html#package-layers) Processing Toolbox operation. As such, it will also (if it exists) load the associated "layer_styles" table of SLD XML styling data exported by QGIS in the same GeoPackage.

It is implemented as an NPM module and is a lightweight wrapper around the [sql.js](https://github.com/sql-js/sql.js) SQLite JavaScript library.

## Examples

Each example is presented as HTML/JavaScript source code and a directly viewable web page (generated by the Webpack module bundler).

- Basic Example: [web page](https://richard-thomas.github.io/ol-load-geopackage/examples/dist/basic_example.html) (sources: [HTML](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples/dist/basic_example.html),
[JavaScript](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples/src/basic_example.js))
  - Loads vector tables and associated QGIS "layer_styles" SLD XML strings from an OGC GeoPackage and render all tables as layers on an OpenLayers map. Displays details of package contents.

- Proj4 Example: [web page](https://richard-thomas.github.io/ol-load-geopackage/examples/dist/proj4_example.html) (sources: [HTML](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples/dist/proj4_example.html),
[JavaScript](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples/src/proj4_example.js))
  - Used in conjunction with Proj4js module to enable additional projections to those built in to OpenLayers. These other projections can be for the input source data and/or the output display projection.

You can try the examples with your own GeoPackage data files (without having to install Node.js or WebPack) by cloning the GitHub repository then editing the "gpkgFile" definition in the HTML files. In order to ensure the sql.js WASM file is loaded you will have to host them with a (simple) local HTTP server, for example by running in the examples/dist folder...

```bash
python -m http.server
```

...which will allow you to view them in a browser at [http://localhost:8000/](http://localhost:8000/). Note however that if your source data uses projections (SRS) other than the few built in to OpenLayers, then you would need to modify the .js source files (as in the Proj4 example) to add more SRS and rebuild the .js bundles.

## Installation

Use Node.js to install the NPM package: [ol-load-geopackage](https://www.npmjs.com/package/ol-load-geopackage)

```bash
npm install --save ol-load-geopackage
```

After running npm install, the sql.js web assembly file (sql-wasm.wasm) will need to be copied from folder _node_modules/sql.js/dist/_ to the folder where the web page is to be loaded from.

## Basic usage

This package must be imported as a module - it is not designed to be loaded directly with a \<script\> tag. The examples above best demonstrate usage, but the following code segment outlines the basic methodology:

```javascript
import loadGpkg from 'ol-load-geopackage';
var gpkgPromise = loadGpkg(<gpkgFile>, <displayProjection>);
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
    .catch(error => alert('ol-load-geopackage error: ' + error));
```

Note that the ol-load-geopackage import statement will start the asynchronous loading of the sql.js WASM binary file, so is best placed early in the code.

### Webpack bundling

The (shared) support files used to bundle the examples using Webpack 5 ([package.json](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples/package.json), [webpack.config.js](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples/webpack.config.js)) are in the examples folder. If you clone the repository then you can (re-)build the code bundles (for both examples) with the commands:

```bash
cd examples
npm run-script build
```

The Webpack dev-server can be used to automatically re-build, act as a webhost and trigger the browser to reload every time the code changes. The following script commands (defined in [package.json](https://github.com/richard-thomas/ol-load-geopackage/tree/master/examples/package.json)) will start the dev-server for one or the other example:

```bash
npm run-script start-basic
npm run-script start-proj4
```

## API

### loadGpkg(gpkgFile, displayProjection)

Begin asynchronous load of a single OGC GeoPackage, then extracts vector data tables into OpenLayers Vector Sources,
transforming the data (if necessary) to match the specified display projection. If a "layer_styles" table is found (as generated by QGIS [Package Layers](https://docs.qgis.org/3.16/en/docs/user_manual/processing_algs/qgis/database.html#package-layers) Processing Toolbox command), it will extract the constituent SLD XML styling data associated with each vector data table.

Parameters:

- `gpkgFile`: OGC GeoPackage file URL
- `displayProjection`: Map display projection for output sources (e.g. 'EPSG:3857'). Note that projections not built in to OpenLayers must be defined before calling the function. This is most easily done using the Proj4JS library  - see Proj4 example.

Returns a Promise which delivers an array of 2 objects:

```javascript
[dataFromGpkg, sldsFromGpkg]
```

- `dataFromGpkg`: data tables (OpenLayers vector sources, indexed by table name),
- `sldsFromGpkg`: styles (SLD layer_styles XML strings, indexed by layer name)

For information only, the original data projection (SRS ID) will be returned as the string Property "origProjection" of each data source, so can be accessed:

```javascript
dataFromGpkg[table].getProperties()["origProjection"]
```

Notes:

1. `sldsFromGpkg` will be an empty object if no table named "layer_styles" is found in the GeoPackage.
2. In the output GeoPackage from QGIS [Package Layers](https://docs.qgis.org/3.16/en/docs/user_manual/processing_algs/qgis/database.html#package-layers) the "table name" used for each vector data table will be exactly the same as the "layer name" used to index the SLD style strings in the "layer_styles" table.

## Contributions

For bug reports, enhancement requests or code contributions please see [CONTRIBUTING](CONTRIBUTING.MD).

## Licence

ISC - see [LICENCE](LICENCE.MD).
