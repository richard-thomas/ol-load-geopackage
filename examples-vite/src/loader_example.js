// ol-load-geopackage demo with user-selected GeoPackages
//
// Allow user to select local file or web URL to load OGC GeoPackage.
// Load vector tables (and optionally QGIS "layer_styles" SLD XML strings)
// from the OGC GeoPackage and render all tables as layers on an OpenLayers map.
// Display details of package contents.
// Demonstrate loading error tolerance options.

import 'ol/ol.css';

// Module to import OGC GeoPackages
import { initSqlJsWasm, loadGpkg } from 'ol-load-geopackage';

// Start loading of sql.js Web Assembly (WASM) from current folder
initSqlJsWasm('.');

// Use Proj4js (if additional coordinate projections required in OpenLayers)
import proj4 from 'proj4';
import {register as ol_proj_proj4_register} from 'ol/proj/proj4.js';

// OpenLayers 8.2+ modules
import ol_Map from 'ol/Map.js';
import ol_View from 'ol/View.js';
import ol_layer_Vector from 'ol/layer/Vector.js';
import ol_layer_Tile from 'ol/layer/Tile.js';
import ol_source_StadiaMaps from 'ol/source/StadiaMaps.js';

// Map View Projection (SRS)
const displayProjection = 'EPSG:3857';

// Initial map view [xmin, ymin, xmax, ymax]
// in projection EPSG:3857 (Web Mercator)
const initialMapExtent = [-20037508.34, -20048966.1, 20037508.34, 20048966.1];

// Use Proj4js to define additional coordinate systems to convert data from
// EPSG:27700 Projection (British National Grid) (from https://epsg.io/27700)
proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs');

// Make non-built-in projections defined in proj4 available in OpenLayers.
// (must be done before GeoPackages are loaded)
ol_proj_proj4_register(proj4);

const outputElem = document.getElementById('report');

// Create Map canvas and View
var map = new ol_Map({
    target: 'map',
    layers: [
        new ol_layer_Tile({
            source: new ol_source_StadiaMaps({ layer: 'stamen_toner_lite' })
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

// loadGpg() Option Selector: missingDataSrsAction
const changeEvent = new Event('change', { bubbles: true });
let missingDataSrsActionSelected;
const missingSrsSelector = document.getElementById('missing-data-srs-action-sel');
const missingSrsDescription = document.getElementById('missing-data-srs-action-descr');
const missingSrsText = {
    'stop': '(Throw error, stop processing, discard all tables)',
    'discard': '(Skip processing of data; put error and missing data SRS ID in table status)',
    'noProject': '(Keep data but do not reproject; put error and missing data SRC in table status)'
};
missingSrsSelector.addEventListener('change', (event) => {
    const selectedValue = event.target.value;
    missingSrsDescription.textContent = missingSrsText[selectedValue];
    missingDataSrsActionSelected = selectedValue;
});
missingSrsSelector.dispatchEvent(changeEvent);

// loadGpg() Option Selector: failedTableLoadAction
let failedTableLoadActionSelected;
const failedLoadSelector = document.getElementById('failed-table-load-action-sel');
const failedLoadDescription = document.getElementById('failed-table-load-action-descr');
const failedLoadText = {
    'stop': '(Throw error, stop processing, discard all tables)',
    'discard': '(Skip processing of data; put error and data SRS ID in table status)'
};
failedLoadSelector.addEventListener('change', (event) => {
    const selectedValue = event.target.value;
    failedLoadDescription.textContent = failedLoadText[selectedValue];
    failedTableLoadActionSelected = selectedValue;
});
failedLoadSelector.dispatchEvent(changeEvent);

// File selector
// Implemented by getting button to send a 'click' event to the
// (Hidden) 'fileInput' button.
const fileInput = document.getElementById('fileInput');
document.getElementById('gpkg-load-btn').addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (event) => {
    const fileList = event.target.files; // Get FileList object
    if (fileList.length < 1) {
        console.log('(No file to load)');
        return;
    }
    const selectedFile = fileList[0];
    loadSelectedGpkg(selectedFile, selectedFile.name);
    event.target.value = '';
});

// URL Selector
const urlLoadBtn = document.getElementById('url-load-btn');
urlLoadBtn.addEventListener('click', function() {
    const urlText = document.getElementById('url-text');
    const url = urlText.value.trim();

    if (url) {
        loadSelectedGpkg(url, url);
    } else {
        alert("Please enter a URL!");
    }
});

// Load GeoPackage selected by either File or URL selectors (above)
async function loadSelectedGpkg(gpkgFile, fileName) {
    // Kick off the loading of the OGC GeoPackage
    const startProcessing = Date.now();        
    let dataFromGpkg, sldsFromGpkg, gpkgTableStatus;
    try {
        [dataFromGpkg, sldsFromGpkg, gpkgTableStatus] = await loadGpkg(
            gpkgFile, displayProjection, {
                missingDataSrsAction: missingDataSrsActionSelected,
                failedTableLoadAction: failedTableLoadActionSelected
            });
    } catch (error) {
        alert('loadGpkg() error thrown when loading file:\n' +
            `  ${fileName}\n---- Throw error message ----\n${error}`);
        return;
    }
    const processingSecs = (Date.now() - startProcessing) / 1000;

    // Display data when GeoPackage load is complete
    outputElem.innerHTML =
        `<h4>Extracting File: ${fileName}</h4>
            <p>(GeoPackage load and processing completed after ${processingSecs} seconds.)</p>`;
    displayGpkgContents(dataFromGpkg, sldsFromGpkg, gpkgTableStatus);

    // Add all vector layers found to map (with default styling)
    for (const table in gpkgTableStatus) {
        // Only add layer if OK table extraction status code
        // (as we have allowed tables with unsupported SRS to be extracted)
        const tableStatusCode = gpkgTableStatus[table].statusCode;
        if (tableStatusCode < 2) {
            map.addLayer(new ol_layer_Vector({
                source: dataFromGpkg[table],
            }));
            if (tableStatusCode === 1) {
                outputElem.innerHTML +=
                    `<p>Table '${table}' shown on map for information but put ` +
                    'in <b>WRONG PLACE</b> as not reprojected due to ol/proj ' +
                    'missing table SRS.'; 
            }
         } else {
            outputElem.innerHTML +=
                `<p>Table '${table}' discarded because: ` +
                gpkgTableStatus[table].statusMsg;
        }
    }
}

// Display (in browser console) details of all tables in GeoPackage
function displayGpkgContents(dataFromGpkg, sldsFromGpkg, gpkgTableStatus) {
    var tablesText = '<p>Details extracted for each table { ' +
        '"table name" [original projection]: (attribute names) }:</p><ul>';
    for (var table in dataFromGpkg) {
        tablesText += '<li>"' + table + '" [EPSG:' +
            gpkgTableStatus[table].origSrsId + ']: (';

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
