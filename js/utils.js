/**
 * Utility Functions
 * Shared helper functions used throughout the application
 */

const Utils = {
    /**
     * Generate unique ID
     * @param {string} prefix - ID prefix
     * @returns {string} Unique ID
     */
    generateId(prefix = 'id') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 9);
        return `${prefix}_${timestamp}_${random}`;
    },

    /**
     * Convert string to camelCase
     * @param {string} str - String to convert
     * @returns {string} camelCase string
     */
    toCamelCase(str) {
        return str
            .toLowerCase()
            .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase());
    },

    /**
     * Convert string to safe ID format
     * @param {string} str - String to convert
     * @returns {string} Safe ID string
     */
    toSafeId(str) {
        return str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    },

    /**
     * Deep clone an object
     * @param {Object} obj - Object to clone
     * @returns {Object} Cloned object
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => Utils.deepClone(item));
        if (obj instanceof Object) {
            const clonedObj = {};
            Object.keys(obj).forEach(key => {
                clonedObj[key] = Utils.deepClone(obj[key]);
            });
            return clonedObj;
        }
    },

    /**
     * Debounce function execution
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function execution
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in milliseconds
     * @returns {Function} Throttled function
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Format date to ISO string
     * @param {Date} date - Date object
     * @returns {string} ISO string
     */
    formatDate(date = new Date()) {
        return date.toISOString();
    },

    /**
     * Parse and validate number
     * @param {*} value - Value to parse
     * @param {number} defaultValue - Default value if parsing fails
     * @returns {number} Parsed number
     */
    parseNumber(value, defaultValue = 0) {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
    },

    /**
     * Check if value is empty
     * @param {*} value - Value to check
     * @returns {boolean} True if empty
     */
    isEmpty(value) {
        return value === null || value === undefined || value === '';
    },

    /**
     * Get nested property from object
     * @param {Object} obj - Object to search
     * @param {string} path - Property path (e.g., 'a.b.c')
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Property value or default
     */
    getNestedProperty(obj, path, defaultValue = null) {
        const keys = path.split('.');
        let result = obj;
        for (const key of keys) {
            if (result === null || result === undefined) {
                return defaultValue;
            }
            result = result[key];
        }
        return result !== undefined ? result : defaultValue;
    },

    /**
     * Set nested property on object
     * @param {Object} obj - Object to modify
     * @param {string} path - Property path (e.g., 'a.b.c')
     * @param {*} value - Value to set
     */
    setNestedProperty(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = obj;

        for (const key of keys) {
            if (!(key in current)) {
                current[key] = {};
            }
            current = current[key];
        }

        current[lastKey] = value;
    },

    /**
     * Group array of objects by key
     * @param {Array} array - Array to group
     * @param {string} key - Key to group by
     * @returns {Object} Grouped object
     */
    groupBy(array, key) {
        return array.reduce((result, item) => {
            const groupKey = item[key];
            if (!result[groupKey]) {
                result[groupKey] = [];
            }
            result[groupKey].push(item);
            return result;
        }, {});
    },

    /**
     * Get unique values from array
     * @param {Array} array - Array to process
     * @param {string} key - Optional key for objects
     * @returns {Array} Unique values
     */
    unique(array, key = null) {
        if (key) {
            return [...new Set(array.map(item => item[key]))];
        }
        return [...new Set(array)];
    },

    /**
     * Sort array by key
     * @param {Array} array - Array to sort
     * @param {string} key - Key to sort by
     * @param {string} direction - 'asc' or 'desc'
     * @returns {Array} Sorted array
     */
    sortBy(array, key, direction = 'asc') {
        return [...array].sort((a, b) => {
            let aVal = a[key];
            let bVal = b[key];

            // Handle numeric values
            if (!isNaN(aVal) && !isNaN(bVal)) {
                aVal = parseFloat(aVal);
                bVal = parseFloat(bVal);
            }

            if (direction === 'asc') {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            } else {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            }
        });
    },

    /**
     * Filter array by search term
     * @param {Array} array - Array to filter
     * @param {string} searchTerm - Search term
     * @param {Array} keys - Keys to search in (for objects)
     * @returns {Array} Filtered array
     */
    filterBySearch(array, searchTerm, keys = []) {
        const term = searchTerm.toLowerCase().trim();
        if (!term) return array;

        return array.filter(item => {
            if (typeof item === 'string') {
                return item.toLowerCase().includes(term);
            }

            if (keys.length === 0) {
                // Search all string properties
                return Object.values(item).some(val =>
                    typeof val === 'string' && val.toLowerCase().includes(term)
                );
            }

            // Search specified keys
            return keys.some(key => {
                const val = item[key];
                return typeof val === 'string' && val.toLowerCase().includes(term);
            });
        });
    },

    /**
     * Calculate percentage
     * @param {number} value - Current value
     * @param {number} total - Total value
     * @param {number} decimals - Number of decimal places
     * @returns {number} Percentage
     */
    percentage(value, total, decimals = 0) {
        if (total === 0) return 0;
        const pct = (value / total) * 100;
        return decimals > 0 ? parseFloat(pct.toFixed(decimals)) : Math.round(pct);
    },

    /**
     * Clamp value between min and max
     * @param {number} value - Value to clamp
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} Clamped value
     */
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },

    /**
     * Wait for specified milliseconds
     * @param {number} ms - Milliseconds to wait
     * @returns {Promise} Promise that resolves after wait
     */
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Retry function with exponential backoff
     * @param {Function} fn - Function to retry
     * @param {number} maxRetries - Maximum number of retries
     * @param {number} initialDelay - Initial delay in milliseconds
     * @returns {Promise} Promise that resolves with function result
     */
    async retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (attempt < maxRetries) {
                    const delay = initialDelay * Math.pow(2, attempt);
                    console.log(`Retry attempt ${attempt + 1} after ${delay}ms`);
                    await Utils.wait(delay);
                }
            }
        }

        throw lastError;
    },

    /**
     * Download data as file
     * @param {string} data - Data to download
     * @param {string} filename - Filename
     * @param {string} mimeType - MIME type
     */
    downloadFile(data, filename, mimeType = 'text/plain') {
        const blob = new Blob([data], { type: mimeType });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    },

    /**
     * Copy text to clipboard
     * @param {string} text - Text to copy
     * @returns {Promise} Promise that resolves when copied
     */
    async copyToClipboard(text) {
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
        } else {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        }
    },

    /**
     * Format file size
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    },

    /**
     * Validate email address
     * @param {string} email - Email address
     * @returns {boolean} True if valid
     */
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    /**
     * Validate coordinates
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @returns {boolean} True if valid
     */
    isValidCoordinates(lat, lon) {
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lon);
        return !isNaN(latitude) && !isNaN(longitude) &&
               latitude >= -90 && latitude <= 90 &&
               longitude >= -180 && longitude <= 180;
    },

    /**
     * Parse boolean value
     * @param {*} value - Value to parse
     * @returns {boolean} Boolean value
     */
    parseBoolean(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true' || value === '1';
        }
        return Boolean(value);
    },

    /**
     * Truncate string
     * @param {string} str - String to truncate
     * @param {number} length - Maximum length
     * @param {string} suffix - Suffix to add
     * @returns {string} Truncated string
     */
    truncate(str, length, suffix = '...') {
        if (!str || str.length <= length) return str;
        return str.substring(0, length) + suffix;
    },

    /**
     * Capitalize first letter
     * @param {string} str - String to capitalize
     * @returns {string} Capitalized string
     */
    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    /**
     * Format number with commas
     * @param {number} num - Number to format
     * @returns {string} Formatted number
     */
    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },

    /**
     * Calculate distance between two points (Haversine formula)
     * @param {number} lat1 - Latitude 1
     * @param {number} lon1 - Longitude 1
     * @param {number} lat2 - Latitude 2
     * @param {number} lon2 - Longitude 2
     * @returns {number} Distance in kilometers
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of Earth in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    /**
     * v3.0: Calculate area of a polygon using Google Maps Geometry library
     * @param {Object} feature - GeoJSON feature with polygon geometry
     * @returns {number} Area in square meters
     */
    calculatePolygonArea(feature) {
        if (!feature || !feature.geometry || !feature.geometry.coordinates) {
            return 0;
        }

        const coordinates = feature.geometry.coordinates;
        if (!coordinates || coordinates.length === 0) {
            return 0;
        }

        // Use Google Maps Geometry library if available
        if (typeof google !== 'undefined' && google.maps && google.maps.geometry) {
            // Convert coordinates to LatLng array
            const path = coordinates[0].map(coord => ({
                lat: coord[1],
                lng: coord[0]
            }));

            // Calculate area using Google Maps computeArea
            return google.maps.geometry.spherical.computeArea(path);
        }

        // Fallback: Simple spherical area calculation
        return this.sphericalPolygonArea(coordinates[0]);
    },

    /**
     * v3.0: Calculate polygon area using spherical geometry (fallback)
     * @param {Array} coords - Array of [lng, lat] coordinates
     * @returns {number} Area in square meters
     */
    sphericalPolygonArea(coords) {
        const EARTH_RADIUS = 6378137; // meters
        let area = 0;

        if (coords.length > 2) {
            for (let i = 0; i < coords.length - 1; i++) {
                const p1 = coords[i];
                const p2 = coords[i + 1];
                area += (p2[0] - p1[0]) * Math.PI / 180 *
                    (2 + Math.sin(p1[1] * Math.PI / 180) + Math.sin(p2[1] * Math.PI / 180));
            }
            area = Math.abs(area * EARTH_RADIUS * EARTH_RADIUS / 2);
        }

        return area;
    },

    /**
     * v3.0: Format area for display
     * @param {number} squareMeters - Area in square meters
     * @param {string} unit - 'metric' or 'imperial'
     * @returns {string} Formatted area string
     */
    formatArea(squareMeters, unit = 'imperial') {
        if (!squareMeters || squareMeters === 0) {
            return '0';
        }

        if (unit === 'imperial') {
            // Convert to square miles
            const squareMiles = squareMeters / 2589988.11;
            if (squareMiles < 0.01) {
                // Show in acres for small areas
                const acres = squareMeters / 4046.86;
                return `${acres.toFixed(2)} acres`;
            }
            return `${squareMiles.toFixed(2)} sq mi`;
        } else {
            // Metric: square kilometers
            const squareKm = squareMeters / 1000000;
            if (squareKm < 0.01) {
                // Show in hectares for small areas
                const hectares = squareMeters / 10000;
                return `${hectares.toFixed(2)} ha`;
            }
            return `${squareKm.toFixed(2)} sq km`;
        }
    },

    /**
     * v3.0: Calculate total area for multiple polygons
     * @param {Array} features - Array of polygon features
     * @returns {number} Total area in square meters
     */
    calculateTotalArea(features) {
        if (!features || features.length === 0) {
            return 0;
        }

        return features.reduce((total, feature) => {
            if (feature.geometry && feature.geometry.type === 'Polygon') {
                return total + this.calculatePolygonArea(feature);
            }
            return total;
        }, 0);
    }
};

// Freeze utilities to prevent modifications
Object.freeze(Utils);
