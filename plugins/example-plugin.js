/**
 * Example Plugin
 * Demonstrates how to create a plugin for SalesMapper
 *
 * This plugin adds a "Nearby Search" feature that finds locations near a clicked point
 */

const NearbySearchPlugin = {
    // Required: Unique plugin ID
    id: 'nearby-search',

    // Required: Plugin name
    name: 'Nearby Search',

    // Optional: Plugin version
    version: '1.0.0',

    // Optional: Plugin description
    description: 'Search for nearby locations when clicking on the map',

    // Optional: Plugin author
    author: 'SalesMapper Team',

    // Plugin configuration
    config: {
        searchRadius: 10, // km
        maxResults: 10
    },

    // API reference (injected during initialization)
    api: null,

    /**
     * Initialize plugin
     * Called when plugin is registered
     * @param {Object} api - Plugin API interface
     */
    init(api) {
        console.log('[NearbySearchPlugin] Initializing...');
        this.api = api;

        // Subscribe to map click events
        this.api.on('map.clicked', (data) => {
            this.handleMapClick(data);
        });

        // Add UI button (if needed)
        this.addUIButton();

        console.log('[NearbySearchPlugin] Initialized successfully');
    },

    /**
     * Handle map click
     * @param {Object} data - Click data
     */
    async handleMapClick(data) {
        if (!this.enabled) return;

        const { lat, lng } = data;

        this.api.showLoading('Searching nearby locations...');

        try {
            // Get all locations
            const allLocations = await this.api.call('getLocations', {});

            // Calculate distances and filter
            const nearby = allLocations
                .map(location => ({
                    ...location,
                    distance: this.api.utils.calculateDistance(
                        lat, lng,
                        location.latitude, location.longitude
                    )
                }))
                .filter(loc => loc.distance <= this.config.searchRadius)
                .sort((a, b) => a.distance - b.distance)
                .slice(0, this.config.maxResults);

            this.api.hideLoading();

            if (nearby.length > 0) {
                this.showResults(nearby, { lat, lng });
            } else {
                this.api.showToast(
                    `No locations found within ${this.config.searchRadius}km`,
                    'info'
                );
            }
        } catch (error) {
            this.api.hideLoading();
            this.api.showToast('Error searching nearby locations', 'error');
            console.error('[NearbySearchPlugin] Error:', error);
        }
    },

    /**
     * Show search results
     * @param {Array} results - Search results
     * @param {Object} center - Center point
     */
    showResults(results, center) {
        // Create results HTML
        const resultsHTML = results.map((loc, index) => `
            <div class="nearby-result">
                <strong>${index + 1}. ${loc.name}</strong>
                <span>${loc.distance.toFixed(2)}km away</span>
            </div>
        `).join('');

        // Show in a modal or toast
        this.api.showToast(
            `Found ${results.length} nearby location(s)`,
            'success'
        );

        // Emit event for other plugins
        this.api.emit('nearby.results', {
            center,
            results,
            radius: this.config.searchRadius
        });
    },

    /**
     * Add UI button to toggle plugin
     */
    addUIButton() {
        // This would add a button to the UI
        // For now, just log
        console.log('[NearbySearchPlugin] UI button would be added here');
    },

    /**
     * Plugin lifecycle: called when enabled
     */
    onEnable() {
        console.log('[NearbySearchPlugin] Enabled');
        this.api.showToast('Nearby Search enabled', 'success');
    },

    /**
     * Plugin lifecycle: called when disabled
     */
    onDisable() {
        console.log('[NearbySearchPlugin] Disabled');
        this.api.showToast('Nearby Search disabled', 'info');
    },

    /**
     * Plugin lifecycle: called when unregistered
     */
    destroy() {
        console.log('[NearbySearchPlugin] Destroying...');
        // Clean up resources here
    },

    // Plugin hooks - modify data as it flows through the app
    hooks: {
        // Modify features before they're added to a layer
        'before.feature.add': async (feature) => {
            // Example: Add a timestamp
            feature.processedByPlugin = new Date().toISOString();
            return feature;
        },

        // Modify layer data before it's saved
        'before.layer.save': async (layerData) => {
            // Example: Add metadata
            layerData.pluginVersion = 'nearby-search-1.0.0';
            return layerData;
        }
    },

    // Plugin API endpoints - expose functionality to other plugins
    api: {
        // Example: Allow other plugins to trigger a search
        'nearby.search': async (params) => {
            const { lat, lng, radius } = params;
            // Perform search...
            return { results: [] };
        }
    }
};

// Auto-register plugin when loaded
if (typeof pluginManager !== 'undefined') {
    pluginManager.register(NearbySearchPlugin);
}
