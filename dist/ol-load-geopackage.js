/**
 * @module ol-load-geopackage
 * @overview Loads OGC GeoPackage vector data into OpenLayers Vector Sources.
 *  Also (if it exists), loads the "layer_styles" table of SLD XML styling data
 *  as exported by the QGIS "Package Layers" Processing operation into strings.
 *  Vector data will be reprojected into the specified display projection.
 *  Both Sources and SLDs are returned in objects with table names used as keys.
 */

import initSqlJs from 'sql.js';
import {get as ol_proj_get} from 'ol/proj.js';
import ol_source_Vector from 'ol/source/Vector.js';
import ol_format_WKB from 'ol/format/WKB.js';

// Extract sql.js version (to enable use of CDN for loading associated WASM)
import sqlJsPkg from 'sql.js/package.json' with { type: 'json' };
const sql_js_version = sqlJsPkg.version;

/**
 * Whether sql.js WASM file has been (successfully) loaded yet
 */
let promiseSqlWasmLoaded;

// -------- Public Functions --------
export { initSqlJsWasm, loadGpkg, sql_js_version };

/**
 * Initialisation: start asynchronous loading of WASM file required by sql.js.
 * Note that unless you require access to sql.js outside ol-load-geopackage,
 * then the returned promise can be ignored; loadGpkg() will wait if necessary
 * and handle any errors loading the WASM file.
 * @param {string} sqlJsWasmDir - URL of folder containing sql-wasm.wasm file to load for sql.js
 * @returns {Promise<WebAssembly>} Promise which delivers:
 *   sql.js SQLITE database access library WebAssembly
 */
function initSqlJsWasm(sqlJsWasmDir) {
    // If the WASM file location isn't specified look for it in the root folder
    if (sqlJsWasmDir === undefined) {
        sqlJsWasmDir = '';
    }

    // For reading OGC GeoPackage files, use the sql.js SQLite reader;
    // initSqlJs() will load the sql-wasm.wasm file from the specified location
    promiseSqlWasmLoaded = initSqlJs({
        locateFile: file => `${sqlJsWasmDir}/${file}`
    });
    promiseSqlWasmLoaded
        .catch(error => {
            // Only reporting error to console here to simplify error handling;
            // Error will be dealt with on later call(s) to loadGpkg()
            console.error('initSqlJsWasm() unable to load SQLite JS binary ' +
                `(sql-wasm.wasm) from URL folder:\n` +
                `  ${sqlJsWasmDir}/\n` +
                error);
        });

    return promiseSqlWasmLoaded;
}

/**
 * @typedef {'stop' | 'discard' | 'noProject'} MissingDataSrsAction
 * Action if missing source data CRS, one of:
 * * `stop` (default): Throw error, stop processing, discard all tables
 * * `discard`: Skip processing of data; put error and missing data SRS ID in table status
 * * `noProject`: Keep data but do not reproject; put error and missing data SRC in table status
 */

/**
 * @typedef {'stop' | 'discard'} FailedTableLoadAction
 * Action if gpkg table load fails, one of:
 * * `stop` (default): Throw error, stop processing, discard all tables
 * * `discard`: Skip processing of data; put error and data SRS ID in table status
 */

/**
 * Configuration options for loadGpkg() function
 * @typedef {Object} loadGpkgOptions
 * @property {MissingDataSrsAction} [missingDataSrsAction='stop'] Missing source data CRS action
 * @property {FailedTableLoadAction} [failedTableLoadAction='stop'] Failed gpkg table action
 */

/**
 * gpkgTableStatus return value object
 * @typedef {Object} gpkgTableStatusObj
 * @property {integer} statusCode - error code
 * @property {string} statusMsg - error message
 * @property {integer} origSrsId - original geopackage table SRS ID
 */

/**
 * Wrapper to load a single OGC GeoPackage
 * @param {(string|File|Blob|URL)} gpkgFile - OGC GeoPackage URL string or File/URL object
 * @param {string} displayProjection - map display projection (e.g. EPSG:3857)
 * @param {loadGpkgOptions} options - configuration options
 * @returns {Promise<[Object, Object, gpkgTableStatusObj]>} Promise delivering array of 3 objects:
 * * data tables (OpenLayers vector sources, indexed by table name),
 * * styles (SLD layer_styles XML strings, indexed by layer name),
 * * table status (indexed by table name) which is an object with 3 properties:
 * * (integer) `statusCode`: error code
 * * (string) `statusMsg`: error message
 * * (integer) `origSrsId`: original geopackage table SRS
 * @throws {Error} If SQL WASM loading not previously started
 * @throws {Error} If ol/proj is missing the requested display projection
 * @throws {TypeError} If gpkgFile is not a supported type
 */
function loadGpkg(gpkgFile, displayProjection, options) {
    options = options || {};
    options.missingDataSrsAction ??= 'stop';
    options.failedTableLoadAction ??= 'stop';

    // Check SQL WASM loading was initiated
    if (promiseSqlWasmLoaded === undefined) {
        throw new Error('SQL WASM loading has not started; ' +
            'did you forget to run initSqlJsWasm() first?');
    }

    // Check if we have a definition for the display projection (SRS)
    if (!ol_proj_get(displayProjection)) {
        throw new Error('Missing requested display projection [' +
            displayProjection +
            '] - can be added beforehand with ol/proj/proj4');
    }

    // Check if gpkgFile is valid type (string, URL, File or Blob)
    if (!(typeof gpkgFile === 'string' || gpkgFile instanceof URL ||
          gpkgFile instanceof Blob)) {        
        throw new TypeError('GeoPackage file specifier must be URL string ' +
            'or URL/File/Blob object');
    }

    // Start OGC GeoPackage load and processing to extract data/SLDs
    const gpkgReadPromise = readRawGpkg(gpkgFile);

    return Promise.allSettled([promiseSqlWasmLoaded, gpkgReadPromise])
        .then((results) => {
            if (results[0].status === 'rejected') {
                // Throw (initSqlJs() failure) will convert to rejected promise
                throw new Error(
                    'Unable to load SQLite JS binary (sql-wasm.wasm).\n' +
                    results[0].reason);
            }
            if (results[1].status === 'rejected') {
                // Propagate exact Error object from readRawGpkg().
                // Throw will convert to rejected promise
                throw results[1].reason;
            }
            const sqlWasm = results[0].value;
            const gpkgByteArray = results[1].value;
            const gpkgFileName = (gpkgFile instanceof File) ? gpkgFile.name :
                gpkgFile.toString();
            return processGpkgData(gpkgFileName, gpkgByteArray, sqlWasm,
                displayProjection, options);           
        }
    );
}

// -------- Private Functions --------

/**
 * Read raw data from source for a single OGC GeoPackage
 * @param {(string|File|Blob|URL)} input - OGC GeoPackage URL string or File/URL object
 * @returns {Promise<Uint8Array>} Promise with Gpkg contents in byte array format
 */
async function readRawGpkg(input) {

    // Fetch() or File/Blob object (both have the equivalent methods we need)
    let gpkgSource;

    if (input instanceof Blob) {
        // File or Blob (File object is a specific type of Blob)
        gpkgSource = input;
    } else {
        // URL string or URL object
        const response = await fetch(input);
        if (!response.ok) {
            // Throw will convert to rejected promise (as an async function)
            throw new Error('GPKG file could not be loaded from URL:\n' +
                `  ${input}\n` +
                `Response: (${response.status}) ${response.statusText}`);
        }
        gpkgSource = response;
    }

    try {
        // Use .bytes() method if available (most browsers since Jan 2025)
        if (typeof gpkgSource.bytes === 'function') {
            return await gpkgSource.bytes();
        }

        // Fallback approach: Convert ArrayBuffer to Uint8Array
        //console.log('readRawGpkg(): using fallback .arrayBuffer() + Uint8Array() methods');
        const buffer = await gpkgSource.arrayBuffer();
        return new Uint8Array(buffer);
    } catch (error) {
        // Throw will convert to rejected promise (as an async function)
        throw new Error('Unable to extract Byte Array from GPKG file.\n' + error);
    }
}

/**
 * Process OGC GeoPackage (based on SQLite database) once loaded
 * @param {string} loadedGpkgFile - name of GeoPackage file (for diagnostics only)
 * @param {Uint8Array} gpkgByteArray - Byte Array containing Gpkg data read
 * @param {WebAssembly} sqlWasm - sql.js SQLITE database access library
 * @param {string} displayProjection - map display projection (e.g. EPSG:3857)
 * @param {loadGpkgOptions} options - configuration options
 * @returns {[Object, Object, gpkgTableStatusObj]} Array of 3 objects:
 * * data tables (OpenLayers vector sources, indexed by table name),
 * * styles (SLD layer_styles XML strings, indexed by layer name),
 * * table status (indexed by table name) which is an object with 3 properties:
 * * (integer) `statusCode`: error code
 * * (string) `statusMsg`: error message
 * * (integer) `origSrsId`: original geopackage table SRS
 * @throws {Error} If unable to extract feature tables from OGC GeoPackage file
 * @throws {Error} If ol/proj is missing required projection for a data table
 * @throws {Error} Failed GeoPackage table load
 */
function processGpkgData(loadedGpkgFile, gpkgByteArray, sqlWasm,
    displayProjection, options) {
    let db = null;
    let stmt;
    const featureTableNames = [];

    // Data and associated SLD styles loaded both from GPKG
    const dataFromGpkg = {};
    const sldsFromGpkg = {};

    /**
     * @type {gpkgTableStatusObj}
     * Table data extraction status
     */
    const gpkgTableStatus = {};

    // DEBUG: measure GPKG processing time
    //let startProcessing = Date.now();

    try {
        db = new sqlWasm.Database(gpkgByteArray);

        // Extract all feature table names, SRS IDs and their geometry types
        // Note the following fields are not extracted:
        //   gpkg_contents.identifier - title (QGIS: same as table_name)
        //   gpkg_contents.description - human readable (QGIS: blank)
        //   gpkg_geometry_columns.geometry_type_name
        //     - e.g. LINESTRING (but info also embedded in each feature)
        stmt = db.prepare(`
            SELECT gpkg_contents.table_name, gpkg_contents.srs_id,
                gpkg_geometry_columns.column_name
            FROM gpkg_contents JOIN gpkg_geometry_columns
            WHERE gpkg_contents.data_type='features' AND
                gpkg_contents.table_name=gpkg_geometry_columns.table_name;
        `);
        while (stmt.step()) {
            const row = stmt.get();
            featureTableNames.push({
                'table_name': row[0],
                'srs_id': row[1].toString(),
                'geometry_column_name': row[2]
            });
        }
        stmt.free();
    }
    catch (err) {
        if (db) {
            db.close();
        }
        throw new Error('Unable to extract feature table names and types ' +
            'from OGC GeoPackage file.\n' + err);
    }

    // Extract SLD styles for each layer (if styles included in the gpkg)
    stmt = db.prepare(`
        SELECT gpkg_contents.table_name
        FROM gpkg_contents
        WHERE gpkg_contents.table_name='layer_styles'
    `);
    if (stmt.step()) {
        stmt = db.prepare('SELECT f_table_name,styleSLD FROM layer_styles');
        while (stmt.step()) {
            const row = stmt.get();
            sldsFromGpkg[row[0]] = row[1];
        }
    }
    stmt.free();

    // For each table, extract geometry and other properties
    // (Note: becomes OpenLayers-specific from here)
    const formatWKB = new ol_format_WKB();
    for (const table of featureTableNames) {
        const table_name = table.table_name;
        const tableDataProjection = 'EPSG:' + table.srs_id;
        let noReProject = false;
        let featureCount = 0;

        // Check if we have a definition for the data projection (SRS)
        if (!ol_proj_get(tableDataProjection)) {
            if (options.missingDataSrsAction === 'discard') {
                // discard: Skip processing of data; put error and
                // missing data SRS ID in table status
                console.warn(`Discarding table "${table_name}" from gpkg ` +
                    `"${loadedGpkgFile}" as ol/proj missing table SRS ` +
                    `${tableDataProjection}`);
                gpkgTableStatus[table_name] = {
                    statusCode: 2,
                    statusMsg: 'Discarded as ol/proj missing table SRS',
                    origSrsId: table.srs_id
                };
                continue;

            } else if (options.missingDataSrsAction === 'noProject') {
                // noProject: Keep data but do not reproject;
                // put error and missing data SRC in table status
                console.warn(`Not reprojecting table "${table_name}" from ` +
                    `gpkg "${loadedGpkgFile}" as ol/proj missing table SRS ` +
                    `${tableDataProjection}`);
                gpkgTableStatus[table_name] = {
                    statusCode: 1,
                    statusMsg: 'Not reprojected as ol/proj missing table SRS',
                    origSrsId: table.srs_id
                };                                        
                noReProject = true;

            } else {
                // stop (default): Throw error, stop processing, discard all tables
                throw new Error('Missing data projection [' +
                    tableDataProjection + '] for table "' + table_name +
                    '" - can be added beforehand with ol/proj/proj4');
            }
        }

        // For each feature in the table, extract geometry + other properties
        // and add these to a new OpenLayers Vector Source for the table.
        //console.log(`Extracting table "${table_name}" (SRS: ${tableDataProjection})`);
        const vectorSource = new ol_source_Vector();
        const geometry_column_name = table.geometry_column_name;
        try {
            stmt = db.prepare("SELECT * FROM `" + table_name + "`");
            while (stmt.step()) {
                // Extract properties & geometry for a single feature
                const properties = stmt.getAsObject();
                const geomProp = properties[geometry_column_name];
                if (geomProp == null) {
                    //console.log(`Discarding feature ${featureCount + 1} with null geom in table: '${table_name}'`);
                    continue;
                }
                delete properties[geometry_column_name];
                const featureWkb = parseGpkgGeom(geomProp);
    /*
                // DEBUG: show endianness of WKB data (can differ from header)
                if (!vectorSource.getFeatures().length) {
                    console.log('WKB Geometry: ' +
                        (featureWkb[0] ? 'NDR (Little' : 'XDR (Big') + ' Endian)');
                }
    */
                // Put the feature into the vector source for the current table
                // Reproject unless ol/proj is missing SRS of source data table
                const features = formatWKB.readFeatures(featureWkb, {
                    dataProjection: tableDataProjection,
                    featureProjection: noReProject ? undefined : displayProjection
                });
                features[0].setProperties(properties);
                vectorSource.addFeatures(features);
                featureCount++;
            }
            stmt.free();
        } catch (error) {
            if (options.failedTableLoadAction === 'discard') {
                 // discard: Skip processing of data; put error and data SRS ID in table status
                console.warn(`Discarding table "${table_name}" from gpkg ` +
                    `"${loadedGpkgFile}" as table load failed:\n${error}`);
                gpkgTableStatus[table_name] = {
                    statusCode: 4,
                    statusMsg: 'Failed GeoPackage table load: ' + error,
                    origSrsId: table.srs_id
                };                                        
                stmt.free();
                continue;
            } else {
                // stop (default): Throw error, stop processing, discard all tables
                db.close();
                throw error;
            }
        }

        if (featureCount === 0) {
            console.warn('Discarding table with no (or only null geom) features: ' + table_name);
            gpkgTableStatus[table_name] = {
                statusCode: 3,
                statusMsg: 'Discarded as no (or only null geom) features',
                origSrsId: table.srs_id
            };                                        
            continue;
        }
        // For information only, save details of original projection (SRS)
        // DEPRECATED (as now included in gpkgTableStatus). TBD: remove this soon!
        vectorSource.setProperties({'origProjection': tableDataProjection});

        dataFromGpkg[table_name] = vectorSource;
        if (!noReProject) {
            gpkgTableStatus[table_name] = {
                statusCode: 0,
                statusMsg: 'OK',
                origSrsId: table.srs_id
            };                                        
        }
    }

    // Close database (gpkg) to trigger garbage collection
    db.close();
/*
    // DEBUG: measure OGC GeoPackage processing time
    let processingSecs = (Date.now() - startProcessing) / 1000;
    console.log('INFO: OGC GeoPackage file ("' + loadedGpkgFile +
        '") processing time = ' + processingSecs + ' s');
*/
    return [dataFromGpkg, sldsFromGpkg, gpkgTableStatus];
}

/**
 * Extract (SRS ID &) WKB from an OGC GeoPackage feature
 * (i.e. strip off the variable length header)
 * @param {Uint8Array} gpkgBinGeom - feature geometry property (includes header)
 * @returns {Uint8Array} feature geometry in WKB (Well Known Binary) format
 * @throws {Error} If invalid geometry envelope size flag in GeoPackage
 */
function parseGpkgGeom(gpkgBinGeom) {
    const flags = gpkgBinGeom[3];
    const eFlags = (flags >> 1) & 7;
    let envelopeSize;
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
            throw new Error('Invalid geometry envelope size flag in GeoPackage');
    }
/*
    // Extract SRS (EPSG code)
    // (not required as given for whole table in gpkg_contents table)
    const littleEndian = flags & 1;
    const srs = gpkgBinGeom.subarray(4,8);
    let srsId;
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
    console.log('gpkgBinGeom Magic: 0x${gpkgBinGeom[0].toString(16)}${gpkgBinGeom[1].toString(16)}');
    console.log('gpkgBinGeom Version:', gpkgBinGeom[2]);
    console.log('gpkgBinGeom Flags:', flags);
    console.log('gpkgBinGeom srs_id:', srsId);
    console.log('gpkgBinGeom envelope size (bytes):', envelopeSize);
*/
    // Extract WKB which starts after variable-size "envelope" field
    const wkbOffset = envelopeSize + 8;
    return gpkgBinGeom.subarray(wkbOffset);
}
