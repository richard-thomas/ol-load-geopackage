// ol-load-geopackage basic demo
//
// Load vector tables (and optionally QGIS "layer_styles" SLD XML strings)
// from an OGC GeoPackage and render all tables as layers on an OpenLayers map.
// Display details of package contents.
// (Geopackage URL (gpkgFile) and initialMapExtent must be defined beforehand)

// ESLint settings:
/* global gpkgFile, initialMapExtent */

import 'ol/ol.css';

// Module to import OGC GeoPackages
// (import early to start async loading of required sql.js Web Assembly code)
import loadGpkg from 'ol-load-geopackage';

// OpenLayers 6 modules
import {get as ol_proj_get} from 'ol/proj';
import ol_Map from 'ol/Map';
import ol_View from 'ol/View';
import ol_layer_Vector from 'ol/layer/Vector';
import ol_layer_Tile from 'ol/layer/Tile';
import ol_source_Stamen from 'ol/source/Stamen';

// Map View Projection
const displayProjection = 'EPSG:3857';

// Check if we need to add Proj4s definition for requested display projection
if (!ol_proj_get(displayProjection)) {
    alert("Missing requested display projection [" +
        displayProjection + "] - this can be added with proj4.defs");
}

const outputElem = document.getElementById('report');

outputElem.innerHTML +=
    '<p>Loading OGC GeoPackage file (' + gpkgFile +
    ') and reprojecting sources (to ' + displayProjection + ')...</p>';

// Kick off the loading of the OGC GeoPackage
var startProcessing = Date.now();
let gpkgPromise = loadGpkg(gpkgFile, displayProjection);

// Create Map canvas and View
var map = new ol_Map({
    target: 'map',
    layers: [
        new ol_layer_Tile({
          source: new ol_source_Stamen({ layer: 'toner-lite' })
        }),
      ],
    view: new ol_View({
        projection: displayProjection,
        maxZoom: 28,
        minZoom: 1
    })
});
var mapView = map.getView();
mapView.fit(initialMapExtent, map.getSize());

// Display data when GeoPackage load is complete
gpkgPromise
    .then(([dataFromGpkg, sldsFromGpkg]) => {
        var processingSecs = (Date.now() - startProcessing) / 1000;
        outputElem.innerHTML +=
            '<p>...loading, data extraction and reprojection completed in ' +
            processingSecs + ' seconds.</p>';
        displayGpkgContents(dataFromGpkg, sldsFromGpkg);

        // Add all vector layers found to map (with default styling)
        for (var table in dataFromGpkg) {
            map.addLayer(new ol_layer_Vector({
                source: dataFromGpkg[table],
            }));
        }
    })
    .catch(error => alert('ol-load-geopackage error: ' + error));

// Display (in browser console) details of all tables in GeoPackage
function displayGpkgContents(dataFromGpkg, sldsFromGpkg) {
    var tablesText = '<p>Details extracted for each table { ' +
        '"table name" [original projection]: (attribute names) }:</p><ul>';
    for (var table in dataFromGpkg) {
        tablesText += '<li>"' + table + '" [' +
            dataFromGpkg[table].getProperties()["origProjection"] + ']: (';

        // Attribute names are stored as Feature "Properties":
        // list them for first feature in each table
        var properties = dataFromGpkg[table].getFeatures()[0].getProperties();
        tablesText += Object.keys(properties).join(', ') + ')</li>';
    }
    outputElem.innerHTML += tablesText + '</ul>';

    // Display SLD strings (if "layer_styles" was found in gpkg)
    if (Object.keys(sldsFromGpkg).length) {
        console.log('Raw SLD XML strings for each layer ("layer_styles" table):');
        console.log(sldsFromGpkg);
        //for (var layer in sldsFromGpkg) {
        //    console.log('"' + layer + '": ' + sldsFromGpkg[layer]);
        //}
        outputElem.innerHTML +=
            '<p>(Raw SLD XML strings for each layer are shown in browser console.)<p>';
    }
}
