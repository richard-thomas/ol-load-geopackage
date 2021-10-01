/**
 * @module ol-load-geopackage
 * @overview Loads OGC GeoPackage vector data into OpenLayers Vector Sources.
 *  Also (if it exists), loads the "layer_styles" table of SLD XML styling data
 *  as exported by the QGIS "Package Layers" Processing operation into strings.
 *  Vector data will be reprojected into the specified display projection.
 *  Both Sources and SLDs are returned in objects with table names used as keys.
 */

import initSqlJs from "sql.js";
import {get as ol_proj_get} from 'ol/proj';
import ol_source_Vector from 'ol/source/Vector';
import ol_format_WKB from 'ol/format/WKB';

// For reading OGC GeoPackage files, use the sql.js SQLite reader;
// initSqlJs() will load the sql-wasm.wasm file from the current directory
const promiseSqlWasmLoaded = initSqlJs();
promiseSqlWasmLoaded
    .catch(error => {
        console.error("Error loading SQLite JS wasm binary: " + error);
        throw error;
    });

// -------- Public Functions --------

/**
 * Wrapper to load a single OGC GeoPackage
 * @param {string} gpkgFile - OGC GeoPackage file path
 * @param {string} displayProjection - map display projection (e.g. EPSG:3857)
 * @returns {Promise} Promise which delivers array of 2 objects:
 *   data tables (OpenLayers vector sources, indexed by table name),
 *   styles (SLD layer_styles XML strings, indexed by layer name)
 */
export default function (gpkgFile, displayProjection) {
    // Start OGC GeoPackage load and processing to extract data/SLDs
    var gpkgPromise = loadGpkg(gpkgFile);

    // Check if we have a definition for the display projection (SRS)
    if (!ol_proj_get(displayProjection)) {
        throw new Error("Missing requested display projection [" +
            displayProjection +
            '] - can be added beforehand with ol/proj/proj4');
    }

    // When SQLite and this OGC GeoPackage loaded, extract data/SLDs
    return Promise.all([promiseSqlWasmLoaded, gpkgPromise])
        .then(([sqlWasm, gpkgArrayBuffer]) => processGpkgData(gpkgFile,
            gpkgArrayBuffer, sqlWasm, displayProjection))
        .catch(error => { throw error; });
}

// -------- Private Functions --------

/**
 * Load a single OGC GeoPackage
 * @param {string} gpkgFile - OGC GeoPackage file path
 * @returns {Promise} Promise with Gpkg contents in ArrayBuffer format
 */
function loadGpkg(gpkgFile) {
    return new Promise(function(succeed, fail) {
        var oReq = new XMLHttpRequest();
        oReq.responseType = "arraybuffer";
        oReq.onreadystatechange = function() {

            // When request finished and response is ready
            if (this.readyState == 4) {
                var gpkgArrayBuffer = this.response;
                if (this.status === 200 && gpkgArrayBuffer) {
                    succeed(gpkgArrayBuffer);
                } else {
                    fail(new Error(
                        'Requested GPKG file could not be loaded: ' +
                        gpkgFile));
                }
            }
        };
        oReq.open("GET", gpkgFile);
        oReq.send();
    });
}

/**
 * Process OGC GeoPackage (SQLite database) once loaded
 * @param {*} loadedGpkgFile - name of GeoPackage file (for diagnostics only)
 * @param {ArrayBuffer} gpkgArrayBuffer - ArrayBuffer containing Gpkg data read
 * @param {WebAssembly} sqlWasm - sql.js SQLITE database access library
 * @param {string} displayProjection - map display projection (e.g. EPSG:3857)
 * @returns {object[]} array of 2 objects: [<data tables>, <slds>]
 *   <data tables>: OpenLayers vector sources, indexed by table name
 *   <slds>: SLD XML strings, indexed by layer name
 */
function processGpkgData(loadedGpkgFile, gpkgArrayBuffer, sqlWasm,
    displayProjection) {
    var db;

    // Data and associated SLD styles loaded both from GPKG
    var dataFromGpkg = {};
    var sldsFromGpkg = {};

    // DEBUG: measure GPKG processing time
    //var startProcessing = Date.now();

    // Convert Array Buffer to Byte Array for SQLite
    var gpkgByteArray = new Uint8Array(gpkgArrayBuffer);

    try {
        db = new sqlWasm.Database(gpkgByteArray);

        // Extract all feature tables, SRS IDs and their geometry types
        // Note the following fields are not extracted:
        //   gpkg_contents.identifier - title (QGIS: same as table_name)
        //   gpkg_contents.description - human readable (QGIS: blank)
        //   gpkg_geometry_columns.geometry_type_name
        //     - e.g. LINESTRING (but info also embedded in each feature)
        var featureTableNames = [];
        var stmt;
        stmt = db.prepare(`
            SELECT gpkg_contents.table_name, gpkg_contents.srs_id,
                gpkg_geometry_columns.column_name
            FROM gpkg_contents JOIN gpkg_geometry_columns
            WHERE gpkg_contents.data_type='features' AND
                gpkg_contents.table_name=gpkg_geometry_columns.table_name;
        `);
        while (stmt.step()) {
            let row = stmt.get();
            featureTableNames.push({
                "table_name": row[0],
                "srs_id": row[1].toString(),
                "geometry_column_name": row[2]
            });
        }
    }
    catch (err) {
        throw new Error(
            'Unable to extract feature tables from OGC GeoPackage file "' +
            loadedGpkgFile + '":\n' + err);
    }

    // Extract SLD styles for each layer (if styles included in the gpkg)
    stmt = db.prepare(`
        SELECT gpkg_contents.table_name
        FROM gpkg_contents
        WHERE gpkg_contents.table_name='layer_styles'
    `);
    if (stmt.step()) {
        stmt = db.prepare("SELECT f_table_name,styleSLD FROM layer_styles");
        while (stmt.step()) {
            let row = stmt.get();
            sldsFromGpkg[row[0]] = row[1];
        }
    }

    // For each table, extract geometry and other properties
    // (Note: becomes OpenLayers-specific from here)
    var formatWKB = new ol_format_WKB();
    for (let table of featureTableNames) {
        let features;
        let table_name = table.table_name;
        let tableDataProjection = 'EPSG:' + table.srs_id;

        // Check if we have a definition for the data projection (SRS)
        if (!ol_proj_get(tableDataProjection)) {
            throw new Error("Missing data projection [" +
                tableDataProjection + '] for table "' + table_name +
                '" - can be added beforehand with ol/proj/proj4');
        }

        stmt = db.prepare("SELECT * FROM '" + table_name + "'");
        let vectorSource = new ol_source_Vector();
        let geometry_column_name = table.geometry_column_name;
        let properties = {};
        while (stmt.step()) {
            // Extract properties & geometry for a single feature
            properties = stmt.getAsObject();
            let geomProp = properties[geometry_column_name];
            delete properties[geometry_column_name];
            let featureWkb = parseGpkgGeom(geomProp);
/*
            // DEBUG: show endianness of WKB data (can differ from header)
            if (!vectorSource.getFeatures().length) {
                console.log('WKB Geometry: ' +
                    (featureWkb[0] ? 'NDR (Little' : 'XDR (Big') + ' Endian)');
            }
*/
            // Put the feature into the vector source for the current table
            features = formatWKB.readFeatures(featureWkb, {
                dataProjection: tableDataProjection,
                featureProjection: displayProjection
            });
            features[0].setProperties(properties);
            vectorSource.addFeatures(features);
        }

        // For information only, save details of  original projection (SRS)
        vectorSource.setProperties({"origProjection": tableDataProjection});
        dataFromGpkg[table_name] = vectorSource;
    }
/*
    // DEBUG: measure OGC GeoPackage processing time
    var processingSecs = (Date.now() - startProcessing) / 1000;
    console.log('INFO: OGC GeoPackage file ("' + loadedGpkgFile +
        '") processing time = ' + processingSecs + ' s');
*/
    return [dataFromGpkg, sldsFromGpkg];
}

/**
 * Extract (SRS ID &) WKB from an OGC GeoPackage feature
 * (i.e. strip off the variable length header)
 * @param {object} gpkgBinGeom feature geometry property (includes header)
 * @returns feature geometry in WKB (Well Known Binary) format
 */
function parseGpkgGeom(gpkgBinGeom) {
    var flags = gpkgBinGeom[3];
    var eFlags = (flags >> 1) & 7;
    var envelopeSize;
    switch (eFlags) {
        case 0:
            envelopeSize = 0;
            break;
        case 1:
            envelopeSize = 32;
            break;
        case 2:
        case 3:
            envelopeSize = 48;
            break;
        case 4:
            envelopeSize = 64;
            break;
        default:
            throw new Error("Invalid geometry envelope size flag in GeoPackage");
    }
/*
    // Extract SRS (EPSG code)
    // (not required as given for whole table in gpkg_contents table)
    var littleEndian = flags & 1;
    var srs = gpkgBinGeom.subarray(4,8);
    var srsId;
    if (littleEndian) {
        srsId = srs[0] + (srs[1]<<8) + (srs[2]<<16) + (srs[3]<<24);
    } else {
        srsId = srs[3] + (srs[2]<<8) + (srs[1]<<16) + (srs[0]<<24);
    }
*/
/*
    // DEBUG: display other properties of the feature
    console.log('gpkgBinGeom Header: ' + (littleEndian ? 'Little' : 'Big')
        + ' Endian');
    console.log("gpkgBinGeom Magic: 0x${gpkgBinGeom[0].toString(16)}${gpkgBinGeom[1].toString(16)}");
    console.log("gpkgBinGeom Version:", gpkgBinGeom[2]);
    console.log("gpkgBinGeom Flags:", flags);
    console.log("gpkgBinGeom srs_id:", srsId);
    console.log("gpkgBinGeom envelope size (bytes):", envelopeSize);
*/
    // Extract WKB which starts after variable-size "envelope" field
    var wkbOffset = envelopeSize + 8;
    return gpkgBinGeom.subarray(wkbOffset);
}
