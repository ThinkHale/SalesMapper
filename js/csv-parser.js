/**
 * CSV Parser
 * Handles CSV file upload and parsing with support for various data formats
 */

class CSVParser {
    constructor() {
        this.supportedColumns = {
            // Geometry columns
            wkt: ['wkt', 'geometry', 'shape', 'geom', 'polygon', 'the_geom'],
            // Removed 'y' and 'x' to prevent false matches with "Account Type" etc.
            latitude: ['latitude', 'lat', 'latitude_decimal'],
            longitude: ['longitude', 'lon', 'lng', 'longitude_decimal'],

            // Common attribute columns
            name: ['name', 'title', 'label', 'account_name', 'business_name'],
            description: ['description', 'desc', 'notes', 'comments'],

            // Sales-specific columns
            zipCode: ['zip', 'zipcode', 'zip_code', 'postal_code'],
            county: ['county', 'county_name'],
            state: ['state', 'state_name'],
            territory: ['territory', 'sales_territory', 'region'],
            bdm: ['bdm', 'manager', 'sales_rep', 'account_manager'],
            tier: ['tier', 'sales_tier', 'potential_tier', 'priority'],
            revenue: ['revenue', 'sales', 'annual_revenue']
        };
    }

    /**
     * Parse file (CSV or Excel)
     * @param {File} file - CSV or Excel file
     * @returns {Promise<Object>} Parsed data with features and metadata
     */
    async parseFile(file) {
        // Detect file type
        const fileExtension = file.name.split('.').pop().toLowerCase();

        if (fileExtension === 'xlsx' || fileExtension === 'xls') {
            return this.parseExcelFile(file);
        } else {
            return this.parseCSVFile(file);
        }
    }

    /**
     * Parse CSV file
     * @param {File} file - CSV file
     * @returns {Promise<Object>} Parsed data with features and metadata
     */
    async parseCSVFile(file) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
                complete: (results) => {
                    try {
                        const parsed = this.processData(results.data, results.meta.fields);
                        resolve(parsed);
                    } catch (error) {
                        reject(error);
                    }
                },
                error: (error) => {
                    reject(error);
                }
            });
        });
    }

    /**
     * Parse Excel file
     * @param {File} file - Excel file
     * @returns {Promise<Object>} Parsed data with features and metadata
     */
    async parseExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // Get first sheet
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];

                    // Convert to JSON (array of objects)
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                        defval: null,
                        raw: false
                    });

                    // Get column names
                    const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

                    console.log(`Parsed Excel file: ${jsonData.length} rows, ${columns.length} columns`);

                    const parsed = this.processData(jsonData, columns);
                    resolve(parsed);
                } catch (error) {
                    console.error('Error parsing Excel file:', error);
                    reject(error);
                }
            };

            reader.onerror = (error) => {
                reject(error);
            };

            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Process parsed CSV data
     * @param {Array} data - Parsed CSV rows
     * @param {Array} columns - Column names
     * @returns {Object} Processed data with features and metadata
     */
    processData(data, columns) {
        // Detect column mappings
        const columnMap = this.detectColumnMappings(columns);
        console.log('CSV column mappings detected:', columnMap);

        // Detect data type (polygon vs point vs address)
        const dataType = this.detectDataType(columnMap, columns);
        console.log('CSV data type detected:', dataType);

        // If address type, return raw data for geocoding
        if (dataType === 'address') {
            console.log('Returning address data for geocoding');
            return {
                features: null,
                type: dataType,
                columnMap: columnMap,
                originalColumns: columns,
                rowCount: data.length,
                rawData: data,
                needsGeocoding: true
            };
        }

        // Process features
        const features = this.extractFeatures(data, columnMap, dataType);
        console.log(`Extracted ${features.length} features of type ${dataType}`);

        return {
            features: features,
            type: dataType,
            columnMap: columnMap,
            originalColumns: columns,
            rowCount: data.length,
            rawData: data, // Include raw data for validation
            needsGeocoding: false
        };
    }

    /**
     * Detect column mappings from CSV headers
     * @param {Array} columns - Column names
     * @returns {Object} Column mappings
     */
    detectColumnMappings(columns) {
        const mappings = {};

        // Filter out empty column names
        const validColumns = columns.filter(col => col && col.trim() !== '');

        // Normalize column names for comparison
        const normalizedColumns = validColumns.map(col =>
            col.toLowerCase().trim().replace(/[^a-z0-9]/g, '_')
        );

        // Map each supported column type
        for (let [type, possibleNames] of Object.entries(this.supportedColumns)) {
            const match = normalizedColumns.findIndex(col =>
                possibleNames.some(name => col.includes(name.replace(/[^a-z0-9]/g, '_')))
            );

            if (match !== -1) {
                mappings[type] = validColumns[match];
            }
        }

        return mappings;
    }

    /**
     * Detect data type (polygon, point, or address) based on available columns
     * @param {Object} columnMap - Column mappings
     * @param {Array} columns - Original column names
     * @returns {string} Data type ('polygon', 'point', or 'address')
     */
    detectDataType(columnMap, columns) {
        // Filter out empty column names
        const validColumns = columns.filter(col => col && col.trim() !== '');

        console.log('Detecting data type from columns:', validColumns);
        console.log('Column mappings found:', columnMap);

        if (columnMap.wkt) {
            return 'polygon';
        } else if (columnMap.latitude && columnMap.longitude) {
            return 'point';
        } else {
            // Check for address columns
            const normalizedColumns = validColumns.map(col =>
                col.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
            );

            // Address column patterns
            const addressPatterns = ['street', 'address', 'addr', 'city', 'zip', 'zipcode', 'postal'];
            const hasAddressColumns = normalizedColumns.some(col =>
                addressPatterns.some(pattern => col.includes(pattern))
            );

            console.log('Has address columns:', hasAddressColumns);

            if (hasAddressColumns) {
                return 'address';
            }

            // Provide detailed error message
            const columnList = validColumns.length > 0
                ? validColumns.slice(0, 10).join(', ') + (validColumns.length > 10 ? '...' : '')
                : 'No valid columns found';

            throw new Error(`No valid geometry columns found. CSV must contain either:\n` +
                          `- WKT column (for polygons/zones)\n` +
                          `- Latitude & Longitude columns (for points)\n` +
                          `- Address columns (Street, City, Zip, etc.)\n\n` +
                          `Your CSV columns: ${columnList}`);
        }
    }

    /**
     * Extract features from CSV data
     * @param {Array} data - CSV rows
     * @param {Object} columnMap - Column mappings
     * @param {string} dataType - Data type
     * @returns {Array} Features array
     */
    extractFeatures(data, columnMap, dataType) {
        return data.map((row, index) => {
            const feature = {
                id: this.generateFeatureId(row, index)
            };

            // Add geometry data
            if (dataType === 'polygon' && columnMap.wkt) {
                feature.wkt = row[columnMap.wkt];
            } else if (dataType === 'point') {
                feature.latitude = row[columnMap.latitude];
                feature.longitude = row[columnMap.longitude];
            }

            // Add all other columns as properties
            for (let [key, value] of Object.entries(row)) {
                // Skip if it's already added or empty
                if (value !== null && value !== undefined && value !== '') {
                    // Convert key to camelCase using Utils
                    const camelKey = Utils.toCamelCase(key);
                    feature[camelKey] = value;
                }
            }

            return feature;
        }).filter(feature => {
            // Filter out features without valid geometry
            if (dataType === 'polygon') {
                return feature.wkt;
            } else {
                return feature.latitude && feature.longitude;
            }
        });
    }

    /**
     * Generate unique feature ID
     * @param {Object} row - CSV row
     * @param {number} index - Row index
     * @returns {string} Feature ID
     */
    generateFeatureId(row, index) {
        // Try to use a meaningful ID from the row
        const possibleIdColumns = ['id', 'account_id', 'location_id', 'zip', 'zipcode'];

        for (let col of possibleIdColumns) {
            const value = row[col] || row[col.toUpperCase()];
            if (value) {
                return Utils.toSafeId(`${col}_${value}`);
            }
        }

        // Fall back to Utils.generateId
        return Utils.generateId('feature');
    }

    /**
     * Validate WKT string
     * @param {string} wkt - WKT string
     * @returns {boolean} Is valid
     */
    validateWKT(wkt) {
        if (!wkt || typeof wkt !== 'string') return false;

        const wktTypes = [
            'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT',
            'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION'
        ];

        return wktTypes.some(type => wkt.trim().toUpperCase().startsWith(type));
    }

    /**
     * Validate coordinates
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @returns {boolean} Are valid
     */
    validateCoordinates(lat, lon) {
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lon);

        return !isNaN(latitude) && !isNaN(longitude) &&
               latitude >= -90 && latitude <= 90 &&
               longitude >= -180 && longitude <= 180;
    }

    /**
     * Get sample data preview
     * @param {File} file - CSV file
     * @param {number} rows - Number of rows to preview
     * @returns {Promise<Object>} Sample data
     */
    async getPreview(file, rows = 5) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                preview: rows,
                skipEmptyLines: true,
                complete: (results) => {
                    resolve({
                        columns: results.meta.fields,
                        sample: results.data
                    });
                },
                error: (error) => {
                    reject(error);
                }
            });
        });
    }

    /**
     * Export features to CSV
     * @param {Array} features - Features to export
     * @param {string} filename - Output filename
     */
    exportToCSV(features, filename = 'export.csv') {
        if (features.length === 0) {
            console.warn('No features to export');
            return;
        }

        // Convert features to CSV format
        const csv = Papa.unparse(features);

        // Create download link
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Detect delimiter in CSV content
     * @param {string} content - CSV content
     * @returns {string} Detected delimiter
     */
    detectDelimiter(content) {
        const delimiters = [',', ';', '\t', '|'];
        const sample = content.split('\n').slice(0, 5).join('\n');

        let maxCount = 0;
        let detectedDelimiter = ',';

        for (let delimiter of delimiters) {
            const count = (sample.match(new RegExp('\\' + delimiter, 'g')) || []).length;
            if (count > maxCount) {
                maxCount = count;
                detectedDelimiter = delimiter;
            }
        }

        return detectedDelimiter;
    }

    /**
     * Get summary statistics for features
     * @param {Array} features - Features array
     * @returns {Object} Statistics
     */
    getStatistics(features) {
        if (features.length === 0) {
            return { count: 0 };
        }

        const stats = {
            count: features.length,
            columns: {}
        };

        // Get all unique keys
        const keys = new Set();
        features.forEach(f => Object.keys(f).forEach(k => keys.add(k)));

        // Calculate statistics for each column
        keys.forEach(key => {
            const values = features.map(f => f[key]).filter(v => v !== null && v !== undefined);

            stats.columns[key] = {
                populated: values.length,
                unique: new Set(values).size,
                type: typeof values[0]
            };
        });

        return stats;
    }

    /**
     * Validate data rows and return validation results
     * @param {Array} data - Raw data rows
     * @param {Object} columnMap - Column mappings
     * @param {string} dataType - Data type (polygon, point, address)
     * @returns {Object} Validation results with valid/invalid rows and errors
     */
    validateData(data, columnMap, dataType) {
        const validRows = [];
        const invalidRows = [];
        const errors = [];

        data.forEach((row, index) => {
            const rowErrors = [];
            const rowNum = index + 1; // 1-based for user display

            // Validate based on data type
            if (dataType === 'polygon') {
                // Check for WKT column
                if (!columnMap.wkt || !row[columnMap.wkt]) {
                    rowErrors.push({
                        type: 'missing_data',
                        message: 'Missing WKT geometry data',
                        field: columnMap.wkt || 'WKT'
                    });
                } else {
                    // Validate WKT format
                    if (!this.validateWKT(row[columnMap.wkt])) {
                        rowErrors.push({
                            type: 'invalid_format',
                            message: 'Invalid WKT format',
                            field: columnMap.wkt,
                            value: row[columnMap.wkt]
                        });
                    }
                }
            } else if (dataType === 'point') {
                // Check for latitude
                if (!columnMap.latitude || row[columnMap.latitude] === null || row[columnMap.latitude] === undefined || row[columnMap.latitude] === '') {
                    rowErrors.push({
                        type: 'missing_data',
                        message: 'Missing latitude data',
                        field: columnMap.latitude || 'Latitude'
                    });
                } else {
                    const lat = parseFloat(row[columnMap.latitude]);
                    if (isNaN(lat) || lat < -90 || lat > 90) {
                        rowErrors.push({
                            type: 'invalid_format',
                            message: 'Invalid latitude (must be between -90 and 90)',
                            field: columnMap.latitude,
                            value: row[columnMap.latitude]
                        });
                    }
                }

                // Check for longitude
                if (!columnMap.longitude || row[columnMap.longitude] === null || row[columnMap.longitude] === undefined || row[columnMap.longitude] === '') {
                    rowErrors.push({
                        type: 'missing_data',
                        message: 'Missing longitude data',
                        field: columnMap.longitude || 'Longitude'
                    });
                } else {
                    const lon = parseFloat(row[columnMap.longitude]);
                    if (isNaN(lon) || lon < -180 || lon > 180) {
                        rowErrors.push({
                            type: 'invalid_format',
                            message: 'Invalid longitude (must be between -180 and 180)',
                            field: columnMap.longitude,
                            value: row[columnMap.longitude]
                        });
                    }
                }
            } else if (dataType === 'address') {
                // For address data, validation happens during geocoding
                // Just check that we have at least some address components
                let hasAddressData = false;
                const addressFields = ['street', 'city', 'zip', 'state'];

                for (let field of addressFields) {
                    if (columnMap[field] && row[columnMap[field]] && row[columnMap[field]].toString().trim() !== '') {
                        hasAddressData = true;
                        break;
                    }
                }

                if (!hasAddressData) {
                    rowErrors.push({
                        type: 'missing_data',
                        message: 'No address data found in row',
                        field: 'Address'
                    });
                }
            }

            // Check for completely empty rows
            const hasAnyData = Object.values(row).some(val =>
                val !== null && val !== undefined && val !== ''
            );

            if (!hasAnyData) {
                rowErrors.push({
                    type: 'empty_row',
                    message: 'Row is completely empty',
                    field: 'All'
                });
            }

            // Categorize row
            if (rowErrors.length > 0) {
                invalidRows.push({ rowNum, data: row, errors: rowErrors });
                errors.push(...rowErrors.map(err => ({
                    rowNum,
                    ...err,
                    data: row
                })));
            } else {
                validRows.push(row);
            }
        });

        return {
            totalRows: data.length,
            validRows: validRows,
            invalidRows: invalidRows,
            validCount: validRows.length,
            invalidCount: invalidRows.length,
            errors: errors,
            dataType: dataType,
            columnMap: columnMap
        };
    }
}
