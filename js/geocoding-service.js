/**
 * Geocoding Service
 * Handles address geocoding using Google Maps Geocoding API
 * Integrated with AppConfig and Utils
 */

class GeocodingService {
    constructor(apiKey = AppConfig.googleMapsApiKey) {
        this.apiKey = apiKey;
        this.geocodingUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
        this.delayMs = AppConfig.geocoding.delayMs;
        this.confidenceScores = AppConfig.geocoding.confidenceScores;
    }

    /**
     * Geocode a single address
     * @param {string} address - Full address string
     * @returns {Promise<Object>} Geocoded result
     */
    async geocodeAddress(address) {
        if (!address || typeof address !== 'string') {
            return {
                success: false,
                error: 'Invalid address',
                latitude: null,
                longitude: null,
                confidence: null
            };
        }

        const params = new URLSearchParams({
            'key': this.apiKey,
            'address': address
        });

        try {
            const response = await fetch(`${this.geocodingUrl}?${params}`, {
                method: 'GET'
            });

            if (!response.ok) {
                return {
                    success: false,
                    error: `HTTP ${response.status}`,
                    latitude: null,
                    longitude: null,
                    confidence: null
                };
            }

            const data = await response.json();

            if (data.status === 'OK' && data.results && data.results.length > 0) {
                const result = data.results[0];
                const location = result.geometry.location;

                // Calculate confidence score from config based on location_type
                const locationType = result.geometry.location_type;
                const confidence = this.confidenceScores[locationType] || this.confidenceScores.default;

                return {
                    success: true,
                    latitude: location.lat,
                    longitude: location.lng,
                    confidence: confidence,
                    formattedAddress: result.formatted_address || address,
                    locationType: locationType
                };
            }

            return {
                success: false,
                error: data.status === 'ZERO_RESULTS' ? 'No results found' : `Geocoding failed: ${data.status}`,
                latitude: null,
                longitude: null,
                confidence: null
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                latitude: null,
                longitude: null,
                confidence: null
            };
        }
    }

    /**
     * Build address string from components
     * @param {Object} components - Address components
     * @returns {string} Full address string
     */
    buildAddress(components) {
        const parts = [];

        if (components.street1) parts.push(components.street1);
        if (components.street2) parts.push(components.street2);
        if (components.city) parts.push(components.city);
        if (components.state) parts.push(components.state);
        if (components.zip) parts.push(components.zip);

        return parts.filter(p => p).join(', ');
    }

    /**
     * Geocode multiple addresses with progress tracking
     * @param {Array} rows - Array of row objects with address components
     * @param {Object} columnMapping - Column mapping for address components
     * @param {Function} progressCallback - Callback for progress updates
     * @returns {Promise<Array>} Array of geocoded features
     */
    async geocodeBatch(rows, columnMapping, progressCallback) {
        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            // Build address from row data
            const addressComponents = {
                street1: row[columnMapping.street1] || '',
                street2: row[columnMapping.street2] || '',
                city: row[columnMapping.city] || '',
                state: row[columnMapping.state] || '',
                zip: row[columnMapping.zip] || ''
            };

            const address = this.buildAddress(addressComponents);

            // Geocode address
            const geocoded = await this.geocodeAddress(address);

            // Create feature object
            const feature = {
                id: Utils.generateId('feature'),
                ...row, // Include all original columns
                originalAddress: address,
                latitude: geocoded.latitude,
                longitude: geocoded.longitude,
                geocodeConfidence: geocoded.confidence,
                geocodeLocationType: geocoded.locationType,
                geocodeStatus: geocoded.success ? 'Success' : geocoded.error
            };

            results.push(feature);

            // Update counters
            if (geocoded.success) {
                successCount++;
            } else {
                errorCount++;
            }

            // Call progress callback
            if (progressCallback) {
                progressCallback({
                    current: i + 1,
                    total: rows.length,
                    percentage: ((i + 1) / rows.length) * 100,
                    successCount: successCount,
                    errorCount: errorCount,
                    currentAddress: address
                });
            }

            // Delay between requests (except for last one)
            if (i < rows.length - 1) {
                await this.delay(this.delayMs);
            }
        }

        return results;
    }

    /**
     * Search for an address and return location
     * @param {string} searchQuery - Search query
     * @returns {Promise<Object>} Search result
     */
    async searchAddress(searchQuery) {
        const result = await this.geocodeAddress(searchQuery);

        if (result.success) {
            return {
                success: true,
                latitude: result.latitude,
                longitude: result.longitude,
                address: result.formattedAddress
            };
        }

        return {
            success: false,
            error: result.error
        };
    }

    /**
     * Detect address columns in CSV headers
     * @param {Array} columns - CSV column names
     * @returns {Object} Detected column mapping
     */
    detectAddressColumns(columns) {
        const mapping = {};

        // Filter out empty column names and normalize
        const normalizedColumns = columns
            .filter(col => col && col.trim() !== '')
            .map((col, idx) => ({
                original: col,
                normalized: col.toLowerCase().trim().replace(/[^a-z0-9]/g, ''),
                index: idx
            }));

        console.log('Detecting address columns from:', normalizedColumns.map(c => c.original));

        // Street 1 patterns
        const street1Patterns = ['street1', 'street', 'address', 'address1', 'addr1', 'addr'];
        const street1Match = normalizedColumns.find(col =>
            street1Patterns.some(pattern => col.normalized.includes(pattern))
        );
        if (street1Match) mapping.street1 = street1Match.original;

        // Street 2 patterns
        const street2Patterns = ['street2', 'address2', 'addr2', 'addressline2'];
        const street2Match = normalizedColumns.find(col =>
            street2Patterns.some(pattern => col.normalized.includes(pattern))
        );
        if (street2Match) mapping.street2 = street2Match.original;

        // City patterns
        const cityPatterns = ['city', 'town', 'municipality'];
        const cityMatch = normalizedColumns.find(col =>
            cityPatterns.some(pattern => col.normalized === pattern || col.normalized.includes(pattern))
        );
        if (cityMatch) mapping.city = cityMatch.original;

        // State patterns
        const statePatterns = ['state', 'province', 'region'];
        const stateMatch = normalizedColumns.find(col =>
            statePatterns.some(pattern => col.normalized === pattern)
        );
        if (stateMatch) mapping.state = stateMatch.original;

        // Zip patterns
        const zipPatterns = ['zip', 'zipcode', 'postalcode', 'postal'];
        const zipMatch = normalizedColumns.find(col =>
            zipPatterns.some(pattern => col.normalized.includes(pattern))
        );
        if (zipMatch) mapping.zip = zipMatch.original;

        return mapping;
    }

    /**
     * Check if CSV has address columns (but no WKT or lat/long)
     * @param {Array} columns - CSV column names
     * @returns {boolean}
     */
    hasAddressColumns(columns) {
        const mapping = this.detectAddressColumns(columns);
        // Require at least street1/address AND (city OR zip)
        return (mapping.street1 && (mapping.city || mapping.zip));
    }

    /**
     * Utility: Delay function
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get geocoding statistics
     * @param {Array} features - Geocoded features
     * @returns {Object} Statistics
     */
    getStatistics(features) {
        const stats = {
            total: features.length,
            successful: 0,
            failed: 0,
            avgConfidence: 0
        };

        let totalConfidence = 0;

        features.forEach(feature => {
            if (feature.latitude && feature.longitude) {
                stats.successful++;
                if (feature.geocodeConfidence) {
                    totalConfidence += feature.geocodeConfidence;
                }
            } else {
                stats.failed++;
            }
        });

        if (stats.successful > 0) {
            stats.avgConfidence = (totalConfidence / stats.successful).toFixed(1);
        }

        return stats;
    }
}
