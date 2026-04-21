/**
 * Validation Service
 * Centralized validation logic for data integrity
 */

class ValidationService {
    constructor() {
        this.rules = new Map();
        this.setupDefaultRules();
    }

    /**
     * Setup default validation rules
     */
    setupDefaultRules() {
        // Coordinate validation
        this.addRule('coordinates', (data) => {
            const { latitude, longitude } = data;
            const errors = [];

            if (latitude === null || latitude === undefined) {
                errors.push({
                    field: 'latitude',
                    type: 'missing',
                    message: 'Latitude is required'
                });
            } else {
                const lat = parseFloat(latitude);
                if (isNaN(lat)) {
                    errors.push({
                        field: 'latitude',
                        type: 'invalid',
                        message: 'Latitude must be a number',
                        value: latitude
                    });
                } else if (lat < -90 || lat > 90) {
                    errors.push({
                        field: 'latitude',
                        type: 'out_of_range',
                        message: 'Latitude must be between -90 and 90',
                        value: lat
                    });
                }
            }

            if (longitude === null || longitude === undefined) {
                errors.push({
                    field: 'longitude',
                    type: 'missing',
                    message: 'Longitude is required'
                });
            } else {
                const lon = parseFloat(longitude);
                if (isNaN(lon)) {
                    errors.push({
                        field: 'longitude',
                        type: 'invalid',
                        message: 'Longitude must be a number',
                        value: longitude
                    });
                } else if (lon < -180 || lon > 180) {
                    errors.push({
                        field: 'longitude',
                        type: 'out_of_range',
                        message: 'Longitude must be between -180 and 180',
                        value: lon
                    });
                }
            }

            return errors;
        });

        // WKT validation
        this.addRule('wkt', (data) => {
            const { wkt } = data;
            const errors = [];

            if (!wkt || typeof wkt !== 'string') {
                errors.push({
                    field: 'wkt',
                    type: 'missing',
                    message: 'WKT geometry is required'
                });
            } else {
                const wktTypes = [
                    'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT',
                    'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION'
                ];

                const isValid = wktTypes.some(type =>
                    wkt.trim().toUpperCase().startsWith(type)
                );

                if (!isValid) {
                    errors.push({
                        field: 'wkt',
                        type: 'invalid',
                        message: 'Invalid WKT format',
                        value: wkt
                    });
                }
            }

            return errors;
        });

        // Feature validation
        this.addRule('feature', (feature) => {
            const errors = [];

            if (!feature.id) {
                errors.push({
                    field: 'id',
                    type: 'missing',
                    message: 'Feature ID is required'
                });
            }

            // Validate geometry based on type
            if (feature.wkt) {
                errors.push(...this.validate('wkt', feature));
            } else if (feature.latitude !== undefined || feature.longitude !== undefined) {
                errors.push(...this.validate('coordinates', feature));
            } else {
                errors.push({
                    field: 'geometry',
                    type: 'missing',
                    message: 'Feature must have either WKT or coordinates'
                });
            }

            return errors;
        });

        // Layer validation
        this.addRule('layer', (layer) => {
            const errors = [];

            if (!layer.name || layer.name.trim() === '') {
                errors.push({
                    field: 'name',
                    type: 'missing',
                    message: 'Layer name is required'
                });
            }

            if (!layer.type || !['point', 'polygon'].includes(layer.type)) {
                errors.push({
                    field: 'type',
                    type: 'invalid',
                    message: 'Layer type must be "point" or "polygon"',
                    value: layer.type
                });
            }

            if (layer.features && !Array.isArray(layer.features)) {
                errors.push({
                    field: 'features',
                    type: 'invalid',
                    message: 'Features must be an array',
                    value: typeof layer.features
                });
            }

            return errors;
        });

        // Email validation
        this.addRule('email', (data) => {
            const { email } = data;
            const errors = [];

            if (!email) {
                errors.push({
                    field: 'email',
                    type: 'missing',
                    message: 'Email is required'
                });
            } else {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    errors.push({
                        field: 'email',
                        type: 'invalid',
                        message: 'Invalid email format',
                        value: email
                    });
                }
            }

            return errors;
        });
    }

    /**
     * Add a validation rule
     * @param {string} name - Rule name
     * @param {Function} validator - Validator function
     */
    addRule(name, validator) {
        this.rules.set(name, validator);
    }

    /**
     * Remove a validation rule
     * @param {string} name - Rule name
     */
    removeRule(name) {
        this.rules.delete(name);
    }

    /**
     * Validate data against a rule
     * @param {string} ruleName - Rule name
     * @param {*} data - Data to validate
     * @returns {Array} Array of errors
     */
    validate(ruleName, data) {
        const rule = this.rules.get(ruleName);
        if (!rule) {
            console.warn(`Validation rule "${ruleName}" not found`);
            return [];
        }

        try {
            return rule(data);
        } catch (error) {
            console.error(`Error in validation rule "${ruleName}":`, error);
            return [{
                field: 'unknown',
                type: 'error',
                message: `Validation error: ${error.message}`
            }];
        }
    }

    /**
     * Validate multiple items
     * @param {string} ruleName - Rule name
     * @param {Array} items - Array of items to validate
     * @returns {Object} Validation results
     */
    validateBatch(ruleName, items) {
        const results = {
            valid: [],
            invalid: [],
            validCount: 0,
            invalidCount: 0,
            errors: []
        };

        items.forEach((item, index) => {
            const errors = this.validate(ruleName, item);

            if (errors.length === 0) {
                results.valid.push({ item, index });
                results.validCount++;
            } else {
                results.invalid.push({ item, index, errors });
                results.invalidCount++;
                results.errors.push(...errors.map(err => ({
                    ...err,
                    index,
                    item
                })));
            }
        });

        return results;
    }

    /**
     * Validate CSV data
     * @param {Array} rows - CSV rows
     * @param {Object} columnMap - Column mappings
     * @param {string} dataType - Data type (point, polygon, address)
     * @returns {Object} Validation results
     */
    validateCSVData(rows, columnMap, dataType) {
        const results = {
            validRows: [],
            invalidRows: [],
            validCount: 0,
            invalidCount: 0,
            errors: [],
            warnings: []
        };

        rows.forEach((row, index) => {
            const rowErrors = [];
            const rowWarnings = [];

            // Validate based on data type
            if (dataType === 'point') {
                const coordErrors = this.validate('coordinates', {
                    latitude: row[columnMap.latitude],
                    longitude: row[columnMap.longitude]
                });
                rowErrors.push(...coordErrors);
            } else if (dataType === 'polygon') {
                const wktErrors = this.validate('wkt', {
                    wkt: row[columnMap.wkt]
                });
                rowErrors.push(...wktErrors);
            } else if (dataType === 'address') {
                // Check for at least some address data
                const hasAddressData = ['street1', 'city', 'zip', 'state']
                    .some(field => columnMap[field] && row[columnMap[field]]);

                if (!hasAddressData) {
                    rowErrors.push({
                        type: 'missing',
                        message: 'No address data found',
                        field: 'address'
                    });
                }
            }

            // Check for empty rows
            const hasAnyData = Object.values(row).some(val =>
                val !== null && val !== undefined && val !== ''
            );

            if (!hasAnyData) {
                rowErrors.push({
                    type: 'empty_row',
                    message: 'Row is completely empty',
                    field: 'all'
                });
            }

            // Warnings for missing optional data
            if (!row[columnMap.name] && columnMap.name) {
                rowWarnings.push({
                    type: 'missing_optional',
                    message: 'Name field is empty',
                    field: columnMap.name
                });
            }

            // Categorize row
            if (rowErrors.length > 0) {
                results.invalidRows.push({
                    index,
                    row,
                    errors: rowErrors,
                    warnings: rowWarnings
                });
                results.invalidCount++;
                results.errors.push(...rowErrors.map(err => ({
                    ...err,
                    rowIndex: index,
                    rowData: row
                })));
            } else {
                results.validRows.push({ index, row });
                results.validCount++;
            }

            if (rowWarnings.length > 0) {
                results.warnings.push(...rowWarnings.map(warn => ({
                    ...warn,
                    rowIndex: index
                })));
            }
        });

        return results;
    }

    /**
     * Check if validation passed
     * @param {Object} results - Validation results
     * @returns {boolean} True if all valid
     */
    isValid(results) {
        return results.errors.length === 0 && results.invalidCount === 0;
    }

    /**
     * Get validation summary
     * @param {Object} results - Validation results
     * @returns {string} Summary text
     */
    getSummary(results) {
        const total = results.validCount + results.invalidCount;
        const errorCount = results.errors.length;
        const warningCount = results.warnings ? results.warnings.length : 0;

        return `Validated ${total} items: ${results.validCount} valid, ${results.invalidCount} invalid, ${errorCount} errors, ${warningCount} warnings`;
    }

    /**
     * Format validation errors for display
     * @param {Object} results - Validation results
     * @returns {Array} Formatted errors
     */
    formatErrors(results) {
        return results.errors.map(err => ({
            row: err.rowIndex !== undefined ? err.rowIndex + 1 : 'N/A',
            field: err.field,
            type: err.type,
            message: err.message,
            value: err.value
        }));
    }

    /**
     * Get all validation rules
     * @returns {Array} Rule names
     */
    getRules() {
        return Array.from(this.rules.keys());
    }

    /**
     * Check if rule exists
     * @param {string} name - Rule name
     * @returns {boolean} True if exists
     */
    hasRule(name) {
        return this.rules.has(name);
    }
}

// Create singleton instance
const validationService = new ValidationService();
