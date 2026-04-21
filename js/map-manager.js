/**
 * Google Maps Manager
 * Handles all Google Maps operations including initialization, rendering, and interactions
 * Integrated with AppConfig and EventBus
 */

class MapManager {
    constructor(containerId, apiKey = AppConfig.googleMapsApiKey) {
        this.containerId = containerId;
        this.apiKey = apiKey;
        this.map = null;
        this.dataSources = new Map(); // Store data layers by layer ID
        this.layers = new Map(); // Store map layers by layer ID
        this.markers = new Map(); // Store markers by layer ID
        this.selectedFeature = null;
        this.onFeatureClick = null;
        this.drawingManager = null;
        this.isDrawing = false;
        this.ignoreFeatureClicks = false; // Flag to ignore feature clicks (e.g., when measure tool is active)
        this.onDrawComplete = null;
        this.colorPalette = AppConfig.colors.primary; // Use AppConfig colors
        this.colorIndex = 0;
        this.infoWindow = null;
        this.searchMarker = null;
        this.clusterManager = null; // v3.0: Enhanced clustering
    }

    /**
     * Initialize the Google Map
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            try {
                const mapElement = document.getElementById(this.containerId);
                if (!mapElement) {
                    reject(new Error(`Map container '${this.containerId}' not found`));
                    return;
                }

                this.map = new google.maps.Map(mapElement, {
                    center: AppConfig.map.defaultCenter,
                    zoom: AppConfig.map.defaultZoom,
                    mapTypeControl: AppConfig.map.mapTypeControl,
                    mapTypeControlOptions: {
                        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                        position: google.maps.ControlPosition.TOP_LEFT,
                        mapTypeIds: ['roadmap', 'satellite', 'hybrid', 'terrain']
                    },
                    streetViewControl: AppConfig.map.streetViewControl,
                    fullscreenControl: AppConfig.map.fullscreenControl,
                    zoomControl: AppConfig.map.zoomControl,
                    zoomControlOptions: {
                        position: google.maps.ControlPosition.RIGHT_TOP
                    }
                });

                // Initialize info window
                this.infoWindow = new google.maps.InfoWindow();

                // Setup drawing tools
                this.setupDrawingTools();

                // v3.0: Initialize enhanced cluster manager
                if (typeof ClusterManager !== 'undefined') {
                    this.clusterManager = new ClusterManager(this.map);
                    console.log('Enhanced ClusterManager initialized (v3.0)');
                } else {
                    console.warn('ClusterManager not loaded, falling back to default clustering');
                }

                console.log('Google Map initialized successfully');
                eventBus.emit('map.initialized', { center: this.map.getCenter(), zoom: this.map.getZoom() });
                resolve();
            } catch (error) {
                console.error('Error initializing map:', error);
                eventBus.emit('map.error', { operation: 'initialize', error });
                reject(error);
            }
        });
    }

    /**
     * Setup drawing tools
     * Note: Drawing library is deprecated. Using simplified custom implementation.
     */
    setupDrawingTools() {
        // Drawing library is deprecated as of August 2025
        // Using custom implementation with event handlers
        this.drawingMode = null;
        this.currentDrawing = null;
        this.drawnShapes = [];
        this.polygonPath = [];
        this.tempMarkers = [];

        // Add map click listener for drawing
        this.mapClickListener = null;

        console.log('Drawing tools initialized (custom implementation)');
    }

    /**
     * Enable drawing mode
     * @param {string} mode - Drawing mode ('draw-point', 'draw-polygon', etc.)
     */
    startDrawing(mode) {
        this.drawingMode = mode;
        this.isDrawing = true;

        // Disable feature interactivity while drawing to prevent selections under the cursor
        this.updateLayerClickability(false);

        // Remove existing click listener if any
        if (this.mapClickListener) {
            google.maps.event.removeListener(this.mapClickListener);
        }

        // Add appropriate click listener based on mode
        if (mode === 'draw-point') {
            this.mapClickListener = this.map.addListener('click', (e) => {
                this.handlePointClick(e.latLng);
            });
            console.log('Point drawing mode enabled - Click on map to add point');
        } else if (mode === 'draw-polygon') {
            this.polygonPath = [];
            this.tempMarkers = [];
            this.mapClickListener = this.map.addListener('click', (e) => {
                this.handlePolygonClick(e.latLng);
            });
            console.log('Polygon drawing mode enabled - Click to add vertices, double-click to finish');
        }
    }

    /**
     * Handle point drawing click
     */
    handlePointClick(latLng) {
        // Create a marker at the clicked location
        const marker = new google.maps.Marker({
            position: latLng,
            map: this.map,
            draggable: true,
            title: 'New Point'
        });

        this.currentDrawing = marker;
        this.drawnShapes.push(marker);

        // Trigger draw complete callback
        if (this.onDrawComplete) {
            this.onDrawComplete({
                type: 'Point',
                coordinates: [latLng.lng(), latLng.lat()],
                shape: marker
            });
        }

        // Stop drawing mode after adding point
        this.stopDrawing();
    }

    /**
     * Handle polygon drawing click
     */
    handlePolygonClick(latLng) {
        // Add vertex to path
        this.polygonPath.push(latLng);

        // Add temporary marker for vertex
        const vertexMarker = new google.maps.Marker({
            position: latLng,
            map: this.map,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 4,
                fillColor: AppConfig.colors.error,
                fillOpacity: 0.8,
                strokeColor: '#FFFFFF',
                strokeWeight: 2
            }
        });
        this.tempMarkers.push(vertexMarker);

        // If we have at least 2 points, draw/update the polygon
        if (this.polygonPath.length >= 2) {
            // Remove old polygon if exists
            if (this.currentDrawing && this.currentDrawing instanceof google.maps.Polygon) {
                this.currentDrawing.setMap(null);
            }

            // Create new polygon
            this.currentDrawing = new google.maps.Polygon({
                paths: this.polygonPath,
                strokeColor: AppConfig.colors.primary[0],
                strokeOpacity: 0.8,
                strokeWeight: AppConfig.polygon.strokeWeight,
                fillColor: AppConfig.colors.primary[0],
                fillOpacity: AppConfig.polygon.fillOpacity,
                editable: true,
                draggable: true,
                map: this.map
            });

            // Add double-click listener to finish drawing
            google.maps.event.addListenerOnce(this.currentDrawing, 'dblclick', () => {
                this.finishPolygonDrawing();
            });
        }
    }

    /**
     * Finish polygon drawing
     */
    finishPolygonDrawing() {
        if (this.currentDrawing && this.polygonPath.length >= 3) {
            // Remove temporary vertex markers
            this.tempMarkers.forEach(marker => marker.setMap(null));
            this.tempMarkers = [];

            // Make polygon non-editable
            this.currentDrawing.setOptions({
                editable: false,
                draggable: false
            });

            this.drawnShapes.push(this.currentDrawing);

            // Convert path to coordinates array
            const coordinates = this.polygonPath.map(latLng => [latLng.lng(), latLng.lat()]);
            coordinates.push(coordinates[0]); // Close the polygon

            // Trigger draw complete callback
            if (this.onDrawComplete) {
                this.onDrawComplete({
                    type: 'Polygon',
                    coordinates: [coordinates],
                    shape: this.currentDrawing
                });
            }

            // Stop drawing mode
            this.stopDrawing();
        }
    }

    /**
     * Stop drawing mode
     */
    stopDrawing() {
        this.drawingMode = null;
        this.isDrawing = false;
        this.polygonPath = [];

        // Re-enable feature interactivity now that drawing has stopped
        this.updateLayerClickability(true);

        // Remove map click listener
        if (this.mapClickListener) {
            google.maps.event.removeListener(this.mapClickListener);
            this.mapClickListener = null;
        }

        // Clean up temporary markers
        if (this.tempMarkers) {
            this.tempMarkers.forEach(marker => marker.setMap(null));
            this.tempMarkers = [];
        }

        console.log('Drawing mode disabled');
    }

    /**
     * Delete selected drawing
     */
    deleteSelectedDrawing() {
        if (this.currentDrawing) {
            this.currentDrawing.setMap(null);
            this.drawnShapes = this.drawnShapes.filter(s => s !== this.currentDrawing);
            this.currentDrawing = null;
            return true;
        }
        return false;
    }

    /**
     * Get all drawn shapes
     * @returns {Array} Array of shapes
     */
    getDrawnShapes() {
        return this.drawnShapes;
    }

    /**
     * Clear all drawings
     */
    clearDrawings() {
        this.drawnShapes.forEach(shape => shape.setMap(null));
        this.drawnShapes = [];
        this.currentDrawing = null;
    }

    /**
     * Set callback for draw complete
     * @param {Function} callback - Callback function
     */
    setOnDrawComplete(callback) {
        this.onDrawComplete = callback;
    }

    /**
     * Search for address and navigate to it
     * @param {string} query - Search query
     * @returns {Promise<Object>} Search result
     */
    async searchAddress(query) {
        const geocoder = new google.maps.Geocoder();

        return new Promise((resolve) => {
            geocoder.geocode({ address: query }, (results, status) => {
                if (status === 'OK' && results.length > 0) {
                    const result = results[0];
                    const location = result.geometry.location;

                    // Navigate to location
                    this.map.setCenter(location);
                    this.map.setZoom(15);

                    // Add marker
                    this.addSearchMarker(location.lat(), location.lng(), result.formatted_address);

                    resolve({
                        success: true,
                        latitude: location.lat(),
                        longitude: location.lng(),
                        address: result.formatted_address
                    });
                } else {
                    resolve({
                        success: false,
                        error: 'No results found'
                    });
                }
            });
        });
    }

    /**
     * Add search result marker
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {string} address - Address text
     */
    addSearchMarker(lat, lng, address) {
        // Remove existing search marker if any
        if (this.searchMarker) {
            this.searchMarker.setMap(null);
        }

        // Create new marker
        this.searchMarker = new google.maps.Marker({
            position: { lat, lng },
            map: this.map,
            title: 'Search Result',
            animation: google.maps.Animation.DROP
        });

        // Add info window
        const infoWindow = new google.maps.InfoWindow({
            content: `<div><strong>Search Result</strong><br>${address}</div>`
        });

        this.searchMarker.addListener('click', () => {
            infoWindow.open(this.map, this.searchMarker);
        });
    }

    /**
     * Create a data source for a layer
     * @param {string} layerId - Layer ID
     * @returns {google.maps.Data}
     */
    createDataSource(layerId, enableClustering = false, initiallyVisible = true) {
        console.log(`📦 createDataSource: layerId=${layerId}, clustering=${enableClustering}, initiallyVisible=${initiallyVisible}`);
        const dataLayer = new google.maps.Data();
        // Only add to map if layer should be initially visible
        if (initiallyVisible) {
            console.log(`  ✅ Setting dataLayer.setMap(this.map) - layer WILL be visible`);
            dataLayer.setMap(this.map);
        } else {
            console.log(`  ⏭️ NOT setting map - layer will be hidden`);
        }
        this.dataSources.set(layerId, { dataLayer, enableClustering });
        return dataLayer;
    }

    /**
     * Add polygon layer to the map
     * @param {string} layerId - Layer ID
     * @param {string} color - Polygon color
     * @param {boolean} initiallyVisible - Whether layer should be visible initially
     * @param {Object} options - Additional layer options
     */
    addPolygonLayer(layerId, color, initiallyVisible = true, options = {}) {
        const dataSource = this.dataSources.get(layerId);
        if (!dataSource || !dataSource.dataLayer) {
            console.error(`Data source for layer ${layerId} not found`);
            return;
        }

        const dataLayer = dataSource.dataLayer;

        // Set style for polygons - support per-feature color overrides
        dataLayer.setStyle((feature) => {
            // Check if feature has a custom color (individual override)
            const featureColor = feature.getProperty('color');
            const colorToUse = featureColor || color; // Use feature color if available, otherwise layer color
            return this.buildPolygonStyle(colorToUse);
        });

        // Store layer reference
        // For mixed layers, merge with existing point layer config
        const existingLayerConfig = this.layers.get(layerId);

        // Determine layer type: preserve 'mixed', upgrade point->mixed, otherwise polygon
        let layerType = 'polygon';
        if (existingLayerConfig?.type === 'mixed') {
            layerType = 'mixed'; // Already mixed, keep it
        } else if (existingLayerConfig?.type === 'point') {
            layerType = 'mixed'; // Upgrade point to mixed
        }

        this.layers.set(layerId, {
            ...(existingLayerConfig || {}), // Preserve existing config (e.g., markers, clusterer)
            dataLayer: dataLayer,
            type: layerType,
            color: color
        });

        // Add click event (only if not already added)
        if (!existingLayerConfig) {
            dataLayer.addListener('click', (event) => {
                this.handleFeatureClick(event, layerId);
            });
        }
    }

    /**
     * Build polygon style based on color and current drawing state
     * @param {string} color - Polygon color
     * @returns {Object} Style options
     */
    buildPolygonStyle(color) {
        return {
            fillColor: color,
            fillOpacity: 0.5,
            strokeColor: color,
            strokeWeight: 2,
            clickable: !this.isDrawing
        };
    }

    /**
     * Enable or disable interactivity on all polygon layers
     * @param {boolean} enabled - Whether features should be clickable
     */
    updateLayerClickability(enabled) {
        // Set flag to ignore feature clicks when disabled
        this.ignoreFeatureClicks = !enabled;

        this.layers.forEach(layer => {
            if ((layer.type === 'polygon' || layer.type === 'mixed') && layer.dataLayer) {
                // Get the current style (could be a function for data-driven styling)
                const currentStyle = layer.dataLayer.getStyle();

                if (typeof currentStyle === 'function') {
                    // Preserve data-driven styling, just update clickability
                    layer.dataLayer.setStyle((feature) => {
                        const featureStyle = currentStyle(feature) || {};
                        return {
                            ...featureStyle,
                            clickable: enabled
                        };
                    });
                } else {
                    // Simple style object - update clickable property
                    layer.dataLayer.setStyle({
                        ...(currentStyle || this.buildPolygonStyle(layer.color)),
                        clickable: enabled
                    });
                }
            }

            if (layer.markers) {
                layer.markers.forEach(marker => marker.setClickable(enabled));
            }
        });
    }

    /**
     * Create a custom marker pin element with color
     * @param {string} color - Hex color
     * @returns {Element} Pin element
     */
    createColoredPin(color) {
        const pin = document.createElement('div');
        pin.style.width = '16px';
        pin.style.height = '16px';
        pin.style.borderRadius = '50%';
        pin.style.backgroundColor = color;
        pin.style.border = '2px solid white';
        pin.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        return pin;
    }

    /**
     * Add point layer to the map with clustering
     * @param {string} layerId - Layer ID
     * @param {string} color - Point color
     * @param {boolean} initiallyVisible - Whether layer should be visible initially
     * @param {Object} options - Additional layer options
     */
    addPointLayer(layerId, color, initiallyVisible = true, options = {}) {
        const dataSource = this.dataSources.get(layerId);
        if (!dataSource) {
            console.error(`Data source for layer ${layerId} not found`);
            return;
        }

        // Clear any existing markers/clusterers for this layer to prevent duplicates
        const existingLayer = this.layers.get(layerId);
        if (existingLayer) {
            if (existingLayer.clusterer) {
                existingLayer.clusterer.clearMarkers();
                existingLayer.clusterer.setMap(null);
            }
            if (existingLayer.markers) {
                existingLayer.markers.forEach(marker => marker.setMap(null));
            }
        }

        // Clear old markers from storage to prevent memory leak
        this.markers.delete(layerId);

        const markers = [];
        const dataLayer = dataSource.dataLayer;

        // For mixed layers, only hide point features (keep polygons visible)
        // For pure point layers, hide all features since we'll show markers instead
        const existingType = existingLayer?.type;
        if (existingType === 'polygon' || existingType === 'mixed') {
            // Mixed layer: use style function to hide points but show polygons
            const existingStyle = dataLayer.getStyle();
            dataLayer.setStyle((feature) => {
                const geometry = feature.getGeometry();
                if (geometry.getType() === 'Point') {
                    // Hide points - they'll be shown as markers
                    return { visible: false };
                } else {
                    // Keep polygons visible with their existing style
                    if (typeof existingStyle === 'function') {
                        return existingStyle(feature);
                    }
                    return existingStyle || this.buildPolygonStyle(color);
                }
            });
        } else {
            // Pure point layer: hide all data layer features
            dataLayer.setStyle({ visible: false });
        }

        // Use marker configuration from AppConfig
        const pinPath = AppConfig.marker.pinPath;

        // Get all features from data layer
        let markerCount = 0;
        let sampleMarkerMap = null;
        dataLayer.forEach((feature) => {
            const geometry = feature.getGeometry();
            if (geometry.getType() === 'Point') {
                const position = geometry.get();

                // Create marker with teardrop icon
                // Don't set map yet if clustering - let clusterer handle it
                // Also respect initiallyVisible parameter
                const markerMap = (dataSource.enableClustering || !initiallyVisible) ? null : this.map;
                if (markerCount === 0) sampleMarkerMap = markerMap; // Capture first marker's map for logging

                const marker = new google.maps.Marker({
                    position: { lat: position.lat(), lng: position.lng() },
                    map: markerMap,
                    title: feature.getProperty('name') || '',
                    icon: {
                        path: pinPath,
                        fillColor: color,
                        fillOpacity: 0.9,
                        strokeColor: AppConfig.marker.strokeColor,
                        strokeWeight: AppConfig.marker.strokeWeight,
                        scale: AppConfig.marker.scale,
                        anchor: new google.maps.Point(0, 0), // Anchor at bottom point of pin
                        labelOrigin: new google.maps.Point(0, -30)
                    }
                });

                // Store feature reference in marker
                marker.feature = feature;
                marker.layerId = layerId;

                // Add click listener
                marker.addListener('click', () => {
                    this.handleMarkerClick(marker, layerId);
                });

                markers.push(marker);
                markerCount++;
            }
        });

        // Log summary instead of logging each marker
        console.log(`   📌 Created ${markerCount} markers: clustering=${dataSource.enableClustering}, initiallyVisible=${initiallyVisible}, map=${sampleMarkerMap ? 'this.map' : 'null'}`);

        // Store markers for later reference
        this.markers.set(layerId, markers);

        // v3.0: Setup clustering with enhanced ClusterManager
        let clusterer = null;
        if (dataSource.enableClustering && markers.length > 0) {
            if (this.clusterManager) {
                // Use enhanced cluster manager with visibility parameter
                clusterer = this.clusterManager.initializeForLayer(layerId, markers, color, initiallyVisible);
                console.log(`Enhanced clustering initialized for ${layerId} with ${markers.length} markers`);
            } else if (typeof markerClusterer !== 'undefined' && markerClusterer.MarkerClusterer) {
                // Fallback to default MarkerClusterer
                clusterer = new markerClusterer.MarkerClusterer({
                    map: initiallyVisible ? this.map : null,
                    markers: markers
                });
                console.log(`Default MarkerClusterer initialized for ${layerId} with ${markers.length} markers`);
            } else {
                console.warn(`Clustering requested for ${layerId} but no clustering library available`);
                // Fallback: add markers to map manually (only if initially visible)
                if (initiallyVisible) {
                    markers.forEach(m => m.setMap(this.map));
                }
            }
        } else if (markers.length > 0 && initiallyVisible) {
            // No clustering - add markers directly to map (only if initially visible)
            markers.forEach(m => m.setMap(this.map));
        }

        // Store layer reference
        // For mixed layers, merge with existing polygon layer config
        const existingLayerConfig = this.layers.get(layerId);

        // Determine layer type: preserve 'mixed', upgrade polygon->mixed, otherwise point
        let layerType = 'point';
        if (existingLayerConfig?.type === 'mixed') {
            layerType = 'mixed'; // Already mixed, keep it
        } else if (existingLayerConfig?.type === 'polygon') {
            layerType = 'mixed'; // Upgrade polygon to mixed
        }

        this.layers.set(layerId, {
            ...(existingLayerConfig || {}), // Preserve existing config (e.g., polygon setup)
            dataLayer: dataLayer,
            markers: markers,
            clusterer: clusterer,
            type: layerType,
            color: color
        });
    }

    /**
     * Handle marker click
     * @param {google.maps.Marker} marker - Clicked marker
     * @param {string} layerId - Layer ID
     */
    handleMarkerClick(marker, layerId) {
        const feature = marker.feature;

        // Handle both plain objects (from CSV) and Google Maps Features
        const properties = this.featurePropertiesToObject(feature);
        const featureId = feature.id || properties.id || `marker_${Date.now()}`;

        this.selectedFeature = {
            feature: feature,
            layerId: layerId,
            id: featureId,
            properties: properties
        };

        // Call callback if provided
        if (this.onFeatureClick) {
            this.onFeatureClick(this.selectedFeature);
        }
    }

    /**
     * Convert feature properties to plain object
     * Handles both Google Maps Data.Feature objects and plain JavaScript objects
     * @param {google.maps.Data.Feature|Object} feature - Feature or plain object
     * @returns {Object} Properties object
     */
    featurePropertiesToObject(feature) {
        // If it's a Google Maps Feature with forEachProperty method
        if (feature && typeof feature.forEachProperty === 'function') {
            const properties = {};
            feature.forEachProperty((value, key) => {
                properties[key] = value;
            });
            return properties;
        }

        // If it's already a plain object, return a copy of it
        // Exclude internal properties like 'wkt' for cleaner display
        if (feature && typeof feature === 'object') {
            const properties = {};
            for (const [key, value] of Object.entries(feature)) {
                // Skip internal/geometry properties
                if (key !== 'wkt' && key !== 'geometry' && key !== 'layerId') {
                    properties[key] = value;
                }
            }
            return properties;
        }

        return {};
    }

    /**
     * Add features to a layer from CSV data
     * @param {string} layerId - Layer ID
     * @param {Array} features - Array of features
     * @param {string} type - Feature type ('polygon' or 'point')
     * @param {string} preferredColor - Preferred color for the layer (optional)
     * @param {boolean} initiallyVisible - Whether the layer should be visible initially (default: true)
     */
    addFeaturesToLayer(layerId, features, type, preferredColor = null, initiallyVisible = true) {
        let dataSource = this.dataSources.get(layerId);

        // For mixed layers, determine if we need clustering based on whether any points exist
        const hasMixedOrPoints = (type === 'point' || type === 'mixed');

        // Create data source if it doesn't exist
        if (!dataSource) {
            const enableClustering = hasMixedOrPoints;
            const dataLayer = this.createDataSource(layerId, enableClustering, initiallyVisible);
            dataSource = this.dataSources.get(layerId);
        }

        // Reuse an existing color when provided or already assigned to the layer
        // to avoid palette drift when re-rendering or importing layers.
        const existingLayer = this.layers.get(layerId);
        const color = preferredColor || existingLayer?.color || this.getNextColor();

        // Convert features to GeoJSON and add to data layer
        // For mixed types, detect feature type from the feature itself
        const geoJsonFeatures = features.map((feature, index) => {
            let geometry;
            let featureType = type;

            // Detect feature type if layer is mixed
            if (type === 'mixed') {
                if (feature.wkt) {
                    featureType = 'polygon';
                } else if (feature.latitude !== undefined && feature.longitude !== undefined) {
                    featureType = 'point';
                }
            }

            if (featureType === 'polygon' && feature.wkt) {
                // Parse WKT to GeoJSON
                geometry = this.parseWKT(feature.wkt);
            } else if (featureType === 'point' && feature.latitude && feature.longitude) {
                // Create point geometry
                geometry = {
                    type: 'Point',
                    coordinates: [parseFloat(feature.longitude), parseFloat(feature.latitude)]
                };
            } else {
                console.warn('Invalid feature data:', feature);
                return null;
            }

            return {
                type: 'Feature',
                id: feature.id || `${layerId}-${index}`,
                geometry: geometry,
                properties: { ...feature, layerId: layerId }
            };
        }).filter(f => f !== null);

        // Add features to data layer
        const dataLayer = dataSource.dataLayer;
        geoJsonFeatures.forEach(geoJsonFeature => {
            dataLayer.addGeoJson(geoJsonFeature);
        });

        // Add appropriate layer types (for mixed, add both)
        // Pass initiallyVisible to ensure layers are created in the correct state
        if (type === 'polygon') {
            this.addPolygonLayer(layerId, color, initiallyVisible);
        } else if (type === 'point') {
            this.addPointLayer(layerId, color, initiallyVisible);
        } else if (type === 'mixed') {
            // Add both polygon and point layers for mixed type
            this.addPolygonLayer(layerId, color, initiallyVisible);
            this.addPointLayer(layerId, color, initiallyVisible);
        }

        // Fit map to show all features (only if visible)
        if (initiallyVisible) {
            this.fitMapToDataSource(dataLayer);
        }

        return color;
    }

    /**
     * Parse WKT string to GeoJSON geometry
     * @param {string} wkt - WKT string
     * @returns {Object} GeoJSON geometry
     */
    parseWKT(wkt) {
        try {
            // Use wellknown library to parse WKT
            const geoJson = wellknown.parse(wkt);
            return geoJson;
        } catch (error) {
            console.error('Error parsing WKT:', error);
            return null;
        }
    }

    /**
     * Handle feature click
     * @param {google.maps.Data.MouseEvent} event - Event object
     * @param {string} layerId - Layer ID
     */
    handleFeatureClick(event, layerId) {
        if (this.isDrawing) {
            return; // Ignore feature clicks while drawing
        }

        if (this.ignoreFeatureClicks) {
            return; // Ignore feature clicks when flag is set (e.g., measure tool is active)
        }

        const feature = event.feature;
        this.selectedFeature = {
            feature: feature,
            layerId: layerId,
            properties: this.featurePropertiesToObject(feature)
        };

        // Call callback if provided
        if (this.onFeatureClick) {
            this.onFeatureClick(this.selectedFeature);
        }
    }

    /**
     * Toggle layer visibility
     * @param {string} layerId - Layer ID
     * @param {boolean} visible - Visibility state
     */
    toggleLayerVisibility(layerId, visible) {
        console.log(`    🗺️ mapManager.toggleLayerVisibility: layerId=${layerId}, visible=${visible}`);

        const layer = this.layers.get(layerId);
        if (!layer) {
            console.log(`    ❌ Layer not found in mapManager: ${layerId}`);
            return;
        }

        console.log(`    📊 Layer info: type=${layer.type}, hasDataLayer=${!!layer.dataLayer}, hasClusterer=${!!layer.clusterer}, markerCount=${layer.markers?.length || 0}`);

        // Toggle data layer visibility (polygons and mixed layers use this)
        if (layer.dataLayer && (layer.type === 'polygon' || layer.type === 'mixed')) {
            const mapBefore = layer.dataLayer.getMap();
            layer.dataLayer.setMap(visible ? this.map : null);
            const mapAfter = layer.dataLayer.getMap();
            console.log(`    🔷 DataLayer: setMap from ${mapBefore ? 'map' : 'null'} to ${mapAfter ? 'map' : 'null'}`);
        }

        // Toggle clusterer visibility
        if (layer.clusterer) {
            const mapBefore = layer.clusterer.getMap();
            layer.clusterer.setMap(visible ? this.map : null);
            const mapAfter = layer.clusterer.getMap();
            const markerCount = layer.clusterer.getMarkers ? layer.clusterer.getMarkers().length : 'unknown';
            console.log(`    🔵 Clusterer: setMap from ${mapBefore ? 'map' : 'null'} to ${mapAfter ? 'map' : 'null'}, markers=${markerCount}`);

            // Additional debugging for clusterer
            if (layer.clusterer.getMarkers) {
                const markers = layer.clusterer.getMarkers();
                console.log(`    🔍 Clusterer has ${markers.length} markers`);
                if (markers.length > 0) {
                    const sampleMarker = markers[0];
                    console.log(`    🔍 Sample marker map: ${sampleMarker.getMap() ? 'has map' : 'no map'}`);
                }
            }
        } else if (layer.markers) {
            // Toggle markers visibility (only if not using clusterer)
            console.log(`    📍 Toggling ${layer.markers.length} individual markers`);
            layer.markers.forEach((marker, idx) => {
                const before = marker.getMap();
                marker.setMap(visible ? this.map : null);
                const after = marker.getMap();
                if (idx < 3) { // Log first 3 markers
                    console.log(`      Marker ${idx}: ${before ? 'map' : 'null'} → ${after ? 'map' : 'null'}`);
                }
            });
        } else {
            console.log(`    ⚠️ Layer has no clusterer or markers array`);
        }

        console.log(`    ✅ mapManager.toggleLayerVisibility complete for ${layerId}`);
    }

    /**
     * Remove layer from map
     * @param {string} layerId - Layer ID
     */
    removeLayer(layerId) {
        const layer = this.layers.get(layerId);
        const dataSource = this.dataSources.get(layerId);

        // Remove data layer
        if (layer && layer.dataLayer) {
            layer.dataLayer.setMap(null);
        }

        // Clear clusterer if exists
        if (layer && layer.clusterer) {
            layer.clusterer.clearMarkers();
            layer.clusterer.setMap(null);
        }

        // Remove markers
        if (layer && layer.markers) {
            layer.markers.forEach(marker => marker.setMap(null));
        }

        // Remove polygon labels
        if (this.polygonLabels && this.polygonLabels.has(layerId)) {
            const labels = this.polygonLabels.get(layerId);
            labels.forEach(label => label.setMap(null));
            this.polygonLabels.delete(layerId);
        }

        // Remove from storage
        this.layers.delete(layerId);
        this.dataSources.delete(layerId);
        this.markers.delete(layerId);
    }

    /**
     * Clear all layers from map
     */
    clearMap() {
        // Get all layer IDs
        const layerIds = Array.from(this.layers.keys());

        // Remove each layer
        layerIds.forEach(layerId => {
            this.removeLayer(layerId);
        });

        // Ensure all polygon labels are cleared (defensive)
        if (this.polygonLabels) {
            this.polygonLabels.forEach((labels, layerId) => {
                labels.forEach(label => label.setMap(null));
            });
            this.polygonLabels.clear();
        }

        // Clear selected feature
        this.clearSelectedFeature();

        console.log('Map cleared');
    }

    /**
     * Update feature properties
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     * @param {Object} newProperties - Updated properties
     */
    updateFeatureProperties(layerId, featureId, newProperties) {
        const dataSource = this.dataSources.get(layerId);
        if (!dataSource || !dataSource.dataLayer) return;

        const dataLayer = dataSource.dataLayer;
        let targetFeature = null;

        dataLayer.forEach((feature) => {
            if (feature.getId() === featureId) {
                targetFeature = feature;
            }
        });

        if (targetFeature) {
            Object.keys(newProperties).forEach(key => {
                targetFeature.setProperty(key, newProperties[key]);
            });
        }
    }

    /**
     * Set individual feature color (only works when layer has no property-based styling)
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     * @param {string} color - Hex color code
     */
    setFeatureColor(layerId, featureId, color) {
        const dataSource = this.dataSources.get(layerId);
        if (!dataSource || !dataSource.dataLayer) return;

        const dataLayer = dataSource.dataLayer;
        const layer = this.layers.get(layerId);
        let targetFeature = null;

        dataLayer.forEach((feature) => {
            if (feature.getId() === featureId) {
                targetFeature = feature;
            }
        });

        if (targetFeature) {
            console.log(`Setting color for feature ${featureId} to ${color}`);

            // Set color property on the feature
            targetFeature.setProperty('color', color);

            // For polygon layers, use overrideStyle to apply the color immediately
            if (layer && layer.type === 'polygon') {
                const style = this.buildPolygonStyle(color);
                dataLayer.overrideStyle(targetFeature, style);
            }

            // For markers, we need to update the marker icon color
            if (layer && layer.markers) {
                const marker = layer.markers.find(m => {
                    const markerFeatureId = m.feature?.getId();
                    console.log(`Checking marker with feature ID: ${markerFeatureId} against ${featureId}`);
                    return markerFeatureId === featureId;
                });
                if (marker) {
                    console.log(`Found matching marker, updating color`);
                    const currentIcon = marker.getIcon();
                    marker.setIcon({
                        ...currentIcon,
                        fillColor: color
                    });
                } else {
                    console.log(`No matching marker found for feature ${featureId}`);
                }
            }

            // For clustered markers
            if (layer && layer.clusterer) {
                // Clusterers need to be recreated to show new colors
                // This will be handled by the cluster refresh mechanism
                console.log('Note: Clustered marker colors will update on next cluster refresh');
            }
        } else {
            console.log(`Feature ${featureId} not found in layer ${layerId}`);
        }
    }

    /**
     * Clear individual feature color override, reverting to layer default
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     */
    clearFeatureColor(layerId, featureId) {
        const dataSource = this.dataSources.get(layerId);
        if (!dataSource || !dataSource.dataLayer) return;

        const dataLayer = dataSource.dataLayer;
        const layer = this.layers.get(layerId);
        let targetFeature = null;

        dataLayer.forEach((feature) => {
            if (feature.getId() === featureId) {
                targetFeature = feature;
            }
        });

        if (targetFeature) {
            // Remove color property
            targetFeature.setProperty('color', null);

            // For polygon layers, revert to default style
            if (layer && layer.type === 'polygon') {
                dataLayer.revertStyle(targetFeature);
            }

            // For markers, restore default layer color
            if (layer && layer.markers) {
                const marker = layer.markers.find(m => m.feature?.getId() === featureId);
                if (marker) {
                    const currentIcon = marker.getIcon();
                    marker.setIcon({
                        ...currentIcon,
                        fillColor: layer.color
                    });
                }
            }
        }
    }

    /**
     * Remove feature from layer
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     */
    removeFeature(layerId, featureId) {
        const dataSource = this.dataSources.get(layerId);
        if (!dataSource || !dataSource.dataLayer) return;

        const dataLayer = dataSource.dataLayer;
        let targetFeature = null;

        dataLayer.forEach((feature) => {
            if (feature.getId() === featureId) {
                targetFeature = feature;
            }
        });

        if (targetFeature) {
            dataLayer.remove(targetFeature);
        }
    }

    /**
     * Fit map to show all features in a data layer
     * @param {google.maps.Data} dataLayer - Data layer
     */
    fitMapToDataSource(dataLayer) {
        const bounds = new google.maps.LatLngBounds();
        let hasFeatures = false;

        dataLayer.forEach((feature) => {
            hasFeatures = true;
            const geometry = feature.getGeometry();

            if (geometry) {
                geometry.forEachLatLng((latLng) => {
                    bounds.extend(latLng);
                });
            }
        });

        if (hasFeatures) {
            this.map.fitBounds(bounds, 50); // 50px padding
        }
    }

    /**
     * Reorder layers on the map to respect the provided ordering
     * (last item appears on top). Uses Google Maps primitives instead of the
     * removed Azure Maps layer APIs.
     * @param {Array<string>} orderedLayerIds - Layer IDs in back-to-front order
     */
    reorderLayers(orderedLayerIds) {
        if (!Array.isArray(orderedLayerIds)) return;

        orderedLayerIds.forEach((layerId, index) => {
            const layer = this.layers.get(layerId);
            if (!layer) return;

            // Get layer visibility state from layerManager
            const layerData = layerManager?.layers.get(layerId);
            const shouldBeVisible = layerData?.visible !== false;

            // Bring polygon data layers to the front by detaching and reattaching
            if (layer.dataLayer && (layer.type === 'polygon' || layer.type === 'mixed')) {
                console.log(`🔧 syncLayerZOrder: ${layerId} dataLayer - visible=${shouldBeVisible}`);
                layer.dataLayer.setMap(null);
                layer.dataLayer.setMap(shouldBeVisible ? this.map : null);

                // Ensure a consistent z-index for polygon styles without overriding
                // any existing data-driven styling callbacks.
                const currentStyle = layer.dataLayer.getStyle() || {};
                const zIndex = index + 1;
                if (typeof currentStyle === 'function') {
                    layer.dataLayer.setStyle((feature) => ({
                        ...(currentStyle(feature) || {}),
                        zIndex
                    }));
                } else {
                    layer.dataLayer.setStyle({ ...(currentStyle || {}), zIndex });
                }
            }

            // For point layers, update markers/clusterers to respect order
            if (layer.markers) {
                const zIndex = index + 1;
                console.log(`🔧 syncLayerZOrder: ${layerId} markers - visible=${shouldBeVisible}`);
                layer.markers.forEach(marker => {
                    marker.setZIndex(zIndex);
                    marker.setMap(null);
                    marker.setMap(shouldBeVisible ? this.map : null);
                });
            }

            if (layer.clusterer) {
                console.log(`🔧 syncLayerZOrder: ${layerId} clusterer - visible=${shouldBeVisible}`);
                // Reattach clusterer to force redraw ordering, respecting visibility
                layer.clusterer.setMap(null);
                layer.clusterer.setMap(shouldBeVisible ? this.map : null);
            }
        });
    }

    /**
     * Get next color from palette
     * @returns {string} Color hex code
     */
    getNextColor() {
        const color = this.colorPalette[this.colorIndex];
        this.colorIndex = (this.colorIndex + 1) % this.colorPalette.length;
        return color;
    }

    /**
     * Reset map view to default center and zoom
     */
    resetView() {
        this.map.setCenter(AppConfig.map.defaultCenter);
        this.map.setZoom(AppConfig.map.defaultZoom);
        eventBus.emit('map.reset', { center: AppConfig.map.defaultCenter, zoom: AppConfig.map.defaultZoom });
    }

    /**
     * Zoom in
     */
    zoomIn() {
        const currentZoom = this.map.getZoom();
        this.map.setZoom(currentZoom + 1);
    }

    /**
     * Zoom out
     */
    zoomOut() {
        const currentZoom = this.map.getZoom();
        this.map.setZoom(currentZoom - 1);
    }

    /**
     * Get selected feature
     * @returns {Object} Selected feature
     */
    getSelectedFeature() {
        return this.selectedFeature;
    }

    /**
     * Clear selected feature
     */
    clearSelectedFeature() {
        this.selectedFeature = null;
        if (this.infoWindow) {
            this.infoWindow.close();
        }
    }

    /**
     * Set feature click callback
     * @param {Function} callback - Callback function
     */
    setOnFeatureClick(callback) {
        this.onFeatureClick = callback;
    }

    /**
     * Close popup/info window
     */
    closePopup() {
        if (this.infoWindow) {
            this.infoWindow.close();
        }
    }

    /**
     * Start editing a polygon shape
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     * @param {string} wkt - WKT string of the polygon
     * @param {Function} onSave - Callback when edit is saved
     * @param {Function} onCancel - Callback when edit is cancelled
     */
    startPolygonEdit(layerId, featureId, wkt, onSave, onCancel) {
        // Store original WKT for cancel operation
        this.editingPolygon = {
            layerId,
            featureId,
            originalWkt: wkt,
            onSave,
            onCancel
        };

        // Parse WKT to GeoJSON to get coordinates
        const geoJson = this.parseWKT(wkt);
        if (!geoJson || geoJson.type !== 'Polygon') {
            console.error('Invalid polygon WKT');
            return false;
        }

        // Convert GeoJSON coordinates to Google Maps LatLng
        const coordinates = geoJson.coordinates[0]; // First ring (outer boundary)
        const path = coordinates.map(coord => ({
            lat: coord[1],
            lng: coord[0]
        }));

        // Get the layer to determine color
        const layer = this.layers.get(layerId);
        const color = layer?.color || AppConfig.colors.primary[0];

        // Hide the original feature
        this.hideFeature(layerId, featureId);

        // Create editable polygon
        this.editablePolygon = new google.maps.Polygon({
            paths: path,
            strokeColor: color,
            strokeOpacity: 1,
            strokeWeight: 3,
            fillColor: color,
            fillOpacity: 0.35,
            editable: true,
            draggable: true,
            map: this.map
        });

        // Fit map to the polygon being edited
        const bounds = new google.maps.LatLngBounds();
        path.forEach(point => bounds.extend(point));
        this.map.fitBounds(bounds, 50);

        return true;
    }

    /**
     * Save the edited polygon
     * @returns {string} New WKT string
     */
    savePolygonEdit() {
        if (!this.editablePolygon || !this.editingPolygon) {
            return null;
        }

        // Get the edited path
        const path = this.editablePolygon.getPath();
        const coordinates = [];

        path.forEach((latLng) => {
            coordinates.push([latLng.lng(), latLng.lat()]);
        });

        // Close the polygon (first point = last point)
        if (coordinates.length > 0) {
            const first = coordinates[0];
            const last = coordinates[coordinates.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
                coordinates.push([first[0], first[1]]);
            }
        }

        // Convert to WKT
        const coordString = coordinates.map(c => `${c[0]} ${c[1]}`).join(', ');
        const newWkt = `POLYGON((${coordString}))`;

        // Clean up
        const { layerId, featureId, onSave } = this.editingPolygon;
        this.editablePolygon.setMap(null);
        this.editablePolygon = null;

        // Show the original feature again (it will be updated with new WKT)
        this.showFeature(layerId, featureId);

        // Call the save callback
        if (onSave) {
            onSave(newWkt);
        }

        this.editingPolygon = null;
        return newWkt;
    }

    /**
     * Cancel polygon editing
     */
    cancelPolygonEdit() {
        if (!this.editablePolygon || !this.editingPolygon) {
            return;
        }

        const { layerId, featureId, onCancel } = this.editingPolygon;

        // Remove editable polygon
        this.editablePolygon.setMap(null);
        this.editablePolygon = null;

        // Show the original feature again
        this.showFeature(layerId, featureId);

        // Call the cancel callback
        if (onCancel) {
            onCancel();
        }

        this.editingPolygon = null;
    }

    /**
     * Check if currently editing a polygon
     * @returns {boolean}
     */
    isEditingPolygon() {
        return this.editablePolygon !== null && this.editablePolygon !== undefined;
    }

    /**
     * Hide a specific feature
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     */
    hideFeature(layerId, featureId) {
        const dataSource = this.dataSources.get(layerId);
        if (!dataSource || !dataSource.dataLayer) return;

        const dataLayer = dataSource.dataLayer;
        const layerInfo = this.layers.get(layerId);

        // For polygon layers (data layer features)
        dataLayer.forEach((feature) => {
            if (feature.getId() === featureId) {
                // Store original style and hide
                this.hiddenFeatureStyle = dataLayer.getStyle();
                dataLayer.overrideStyle(feature, { visible: false });
            }
        });

        // For point layers (markers)
        if (layerInfo && layerInfo.markers) {
            const marker = layerInfo.markers.find(m => m.feature?.getId() === featureId);
            if (marker) {
                marker.setMap(null);
            }
        }

        // For clustered markers
        if (layerInfo && layerInfo.clusterer) {
            // Need to remove marker from clusterer and refresh
            const markers = layerInfo.markers || [];
            const marker = markers.find(m => m.feature?.getId() === featureId);
            if (marker) {
                marker.setMap(null);
                // Refresh clusterer
                if (this.clusterManager) {
                    this.clusterManager.refreshLayer(layerId);
                }
            }
        }
    }

    /**
     * Show a specific feature
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     */
    showFeature(layerId, featureId) {
        const dataSource = this.dataSources.get(layerId);
        if (!dataSource || !dataSource.dataLayer) return;

        const dataLayer = dataSource.dataLayer;
        const layerInfo = this.layers.get(layerId);

        // For polygon layers (data layer features)
        dataLayer.forEach((feature) => {
            if (feature.getId() === featureId) {
                // Restore visibility
                dataLayer.revertStyle(feature);

                // Re-apply layer style to ensure it matches current layer styling
                // This is important after polygon edits to preserve custom styles
                if (layerInfo && dataLayer.getStyle()) {
                    const currentStyle = dataLayer.getStyle();
                    if (typeof currentStyle === 'function') {
                        // Re-apply the style function to this specific feature
                        const featureStyle = currentStyle(feature);
                        if (featureStyle) {
                            dataLayer.overrideStyle(feature, featureStyle);
                        }
                    }
                }
            }
        });

        // For point layers (markers)
        if (layerInfo && layerInfo.markers) {
            const marker = layerInfo.markers.find(m => m.feature?.getId() === featureId);
            if (marker) {
                // Check if layer is using clustering
                if (layerInfo.clusterer) {
                    // Don't set map directly, let clusterer handle it
                    if (this.clusterManager) {
                        this.clusterManager.refreshLayer(layerId);
                    }
                } else {
                    // No clustering, set map directly
                    marker.setMap(this.map);
                }
            }
        }
    }

    /**
     * Toggle polygon labels for a layer
     * @param {string} layerId - Layer ID
     * @param {boolean} show - Whether to show labels
     * @param {Array} features - Features array with name property
     */
    togglePolygonLabels(layerId, show, features) {
        // Initialize labels map if needed
        if (!this.polygonLabels) {
            this.polygonLabels = new Map();
        }

        // Remove existing labels for this layer
        if (this.polygonLabels.has(layerId)) {
            const labels = this.polygonLabels.get(layerId);
            labels.forEach(label => label.setMap(null));
            this.polygonLabels.delete(layerId);
        }

        if (!show || !features || features.length === 0) {
            return;
        }

        // Check if layer actually exists and is visible
        const layer = this.layers.get(layerId);
        if (!layer) {
            console.warn(`togglePolygonLabels: Layer ${layerId} not found`);
            return;
        }

        // Check if layer's data layer is visible on the map (indicates layer visibility)
        const isLayerVisible = layer.dataLayer && layer.dataLayer.getMap() !== null;
        if (!isLayerVisible) {
            console.log(`togglePolygonLabels: Layer ${layerId} is hidden, not showing labels`);
            return;
        }

        const labels = [];

        features.forEach(feature => {
            if (!feature.wkt || !feature.name) return;

            // Parse WKT to get polygon coordinates
            const geoJson = this.parseWKT(feature.wkt);
            if (!geoJson || geoJson.type !== 'Polygon') return;

            // Calculate centroid of the polygon
            const centroid = this.calculatePolygonCentroid(geoJson.coordinates[0]);
            if (!centroid) return;

            // Create label marker at centroid
            const labelMarker = new google.maps.Marker({
                position: { lat: centroid.lat, lng: centroid.lng },
                map: this.map,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 0,  // Invisible icon
                    fillOpacity: 0,
                    strokeOpacity: 0
                },
                label: {
                    text: feature.name || feature.Name || '',
                    color: '#333333',
                    fontSize: '11px',
                    fontWeight: '600',
                    className: 'polygon-label'
                },
                clickable: false,
                zIndex: 1000
            });

            labels.push(labelMarker);
        });

        this.polygonLabels.set(layerId, labels);
    }

    /**
     * Calculate the centroid of a polygon
     * @param {Array} coordinates - Array of [lng, lat] coordinates
     * @returns {Object} { lat, lng }
     */
    calculatePolygonCentroid(coordinates) {
        if (!coordinates || coordinates.length === 0) return null;

        let sumLat = 0;
        let sumLng = 0;
        const n = coordinates.length;

        // Simple centroid calculation (average of all points)
        coordinates.forEach(coord => {
            sumLng += coord[0];
            sumLat += coord[1];
        });

        return {
            lat: sumLat / n,
            lng: sumLng / n
        };
    }

    /**
     * Check if a layer has labels enabled
     * @param {string} layerId - Layer ID
     * @returns {boolean}
     */
    hasLabelsEnabled(layerId) {
        return this.polygonLabels && this.polygonLabels.has(layerId) && this.polygonLabels.get(layerId).length > 0;
    }
}
