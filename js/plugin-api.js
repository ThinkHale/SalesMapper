/**
 * Plugin Manager
 * Manages plugins that can extend application functionality
 */

class PluginManager {
    constructor() {
        this.plugins = new Map();
        this.hooks = new Map();
        this.apiEndpoints = new Map();
    }

    /**
     * Register a plugin
     * @param {Object} plugin - Plugin object
     * @returns {boolean} Success
     */
    register(plugin) {
        if (!plugin.id || !plugin.name) {
            console.error('Plugin must have id and name properties');
            return false;
        }

        if (this.plugins.has(plugin.id)) {
            console.warn(`Plugin ${plugin.id} is already registered`);
            return false;
        }

        try {
            // Initialize plugin if it has an init method
            if (typeof plugin.init === 'function') {
                const api = this.getPluginAPI();
                plugin.init(api);
            }

            this.plugins.set(plugin.id, {
                ...plugin,
                enabled: true,
                registeredAt: new Date().toISOString()
            });

            // Register plugin hooks
            if (plugin.hooks) {
                Object.entries(plugin.hooks).forEach(([hookName, handler]) => {
                    this.registerHook(plugin.id, hookName, handler);
                });
            }

            // Register plugin API endpoints
            if (plugin.api) {
                Object.entries(plugin.api).forEach(([endpoint, handler]) => {
                    this.registerApiEndpoint(plugin.id, endpoint, handler);
                });
            }

            console.log(`Plugin registered: ${plugin.name} (${plugin.id})`);
            eventBus.emit('plugin.registered', { pluginId: plugin.id, plugin });

            return true;
        } catch (error) {
            console.error(`Error registering plugin ${plugin.id}:`, error);
            return false;
        }
    }

    /**
     * Unregister a plugin
     * @param {string} pluginId - Plugin ID
     * @returns {boolean} Success
     */
    unregister(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            console.warn(`Plugin ${pluginId} not found`);
            return false;
        }

        try {
            // Call plugin destroy method if it exists
            if (typeof plugin.destroy === 'function') {
                plugin.destroy();
            }

            // Remove plugin hooks
            this.hooks.forEach((handlers, hookName) => {
                this.hooks.set(hookName, handlers.filter(h => h.pluginId !== pluginId));
            });

            // Remove plugin API endpoints
            this.apiEndpoints.forEach((handler, endpoint) => {
                if (handler.pluginId === pluginId) {
                    this.apiEndpoints.delete(endpoint);
                }
            });

            this.plugins.delete(pluginId);

            console.log(`Plugin unregistered: ${pluginId}`);
            eventBus.emit('plugin.unregistered', { pluginId });

            return true;
        } catch (error) {
            console.error(`Error unregistering plugin ${pluginId}:`, error);
            return false;
        }
    }

    /**
     * Enable a plugin
     * @param {string} pluginId - Plugin ID
     */
    enable(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (plugin) {
            plugin.enabled = true;
            if (typeof plugin.onEnable === 'function') {
                plugin.onEnable();
            }
            eventBus.emit('plugin.enabled', { pluginId });
        }
    }

    /**
     * Disable a plugin
     * @param {string} pluginId - Plugin ID
     */
    disable(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (plugin) {
            plugin.enabled = false;
            if (typeof plugin.onDisable === 'function') {
                plugin.onDisable();
            }
            eventBus.emit('plugin.disabled', { pluginId });
        }
    }

    /**
     * Register a hook
     * @param {string} pluginId - Plugin ID
     * @param {string} hookName - Hook name
     * @param {Function} handler - Handler function
     */
    registerHook(pluginId, hookName, handler) {
        if (!this.hooks.has(hookName)) {
            this.hooks.set(hookName, []);
        }

        this.hooks.get(hookName).push({
            pluginId,
            handler
        });
    }

    /**
     * Execute a hook
     * @param {string} hookName - Hook name
     * @param {*} data - Hook data
     * @returns {*} Modified data
     */
    async executeHook(hookName, data) {
        if (!this.hooks.has(hookName)) {
            return data;
        }

        let result = data;
        const handlers = this.hooks.get(hookName);

        for (const { pluginId, handler } of handlers) {
            const plugin = this.plugins.get(pluginId);
            if (plugin && plugin.enabled) {
                try {
                    result = await handler(result);
                } catch (error) {
                    console.error(`Error executing hook ${hookName} in plugin ${pluginId}:`, error);
                }
            }
        }

        return result;
    }

    /**
     * Register API endpoint
     * @param {string} pluginId - Plugin ID
     * @param {string} endpoint - Endpoint name
     * @param {Function} handler - Handler function
     */
    registerApiEndpoint(pluginId, endpoint, handler) {
        this.apiEndpoints.set(endpoint, {
            pluginId,
            handler
        });
    }

    /**
     * Call API endpoint
     * @param {string} endpoint - Endpoint name
     * @param {*} params - Endpoint parameters
     * @returns {Promise<*>} Result
     */
    async callApiEndpoint(endpoint, params) {
        const endpointData = this.apiEndpoints.get(endpoint);
        if (!endpointData) {
            throw new Error(`API endpoint ${endpoint} not found`);
        }

        const plugin = this.plugins.get(endpointData.pluginId);
        if (!plugin || !plugin.enabled) {
            throw new Error(`Plugin ${endpointData.pluginId} is not enabled`);
        }

        return await endpointData.handler(params);
    }

    /**
     * Get plugin API interface
     * @returns {Object} API interface
     */
    getPluginAPI() {
        return {
            // State operations
            getState: (key) => stateManager.get(key),
            setState: (key, value) => stateManager.set(key, value),
            subscribe: (key, callback) => stateManager.subscribe(key, callback),

            // UI operations
            showModal: (modalId) => modalManager.show(modalId),
            closeModal: (modalId) => modalManager.close(modalId),
            showToast: (message, type, duration) => toastManager.show(message, type, duration),
            showLoading: (message) => loadingManager.show(message),
            hideLoading: () => loadingManager.hide(),

            // Layer operations
            createLayer: (name, features, type, metadata) => {
                const layerManager = stateManager.get('layerManager');
                return layerManager.createLayer(name, features, type, metadata);
            },
            getLayer: (layerId) => stateManager.getLayer(layerId),
            getAllLayers: () => stateManager.getAllLayers(),
            deleteLayer: (layerId) => {
                const layerManager = stateManager.get('layerManager');
                return layerManager.deleteLayer(layerId);
            },

            // Feature operations
            addFeaturesToLayer: (layerId, features) => {
                const layerManager = stateManager.get('layerManager');
                return layerManager.addFeaturesToLayer(layerId, features);
            },
            updateFeature: (layerId, featureId, properties) => {
                const layerManager = stateManager.get('layerManager');
                return layerManager.updateFeature(layerId, featureId, properties);
            },
            deleteFeature: (layerId, featureId) => {
                const layerManager = stateManager.get('layerManager');
                return layerManager.deleteFeature(layerId, featureId);
            },

            // Map operations
            getMap: () => {
                const mapManager = stateManager.get('mapManager');
                return mapManager.map;
            },
            fitBounds: (bounds) => {
                const mapManager = stateManager.get('mapManager');
                mapManager.map.fitBounds(bounds);
            },
            setCenter: (lat, lng, zoom) => {
                const mapManager = stateManager.get('mapManager');
                mapManager.map.setCenter({ lat, lng });
                if (zoom) mapManager.map.setZoom(zoom);
            },

            // Event operations
            on: (event, callback) => eventBus.on(event, callback),
            emit: (event, data) => eventBus.emit(event, data),
            once: (event, callback) => eventBus.once(event, callback),

            // Hook operations
            executeHook: (hookName, data) => this.executeHook(hookName, data),

            // Utility functions
            utils: Utils
        };
    }

    /**
     * Get all registered plugins
     * @returns {Array} Array of plugins
     */
    getAllPlugins() {
        return Array.from(this.plugins.values());
    }

    /**
     * Get plugin by ID
     * @param {string} pluginId - Plugin ID
     * @returns {Object|null} Plugin or null
     */
    getPlugin(pluginId) {
        return this.plugins.get(pluginId) || null;
    }

    /**
     * Check if plugin is registered
     * @param {string} pluginId - Plugin ID
     * @returns {boolean} True if registered
     */
    hasPlugin(pluginId) {
        return this.plugins.has(pluginId);
    }

    /**
     * Get plugin statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        const plugins = Array.from(this.plugins.values());
        return {
            total: plugins.length,
            enabled: plugins.filter(p => p.enabled).length,
            disabled: plugins.filter(p => !p.enabled).length,
            hooks: this.hooks.size,
            apiEndpoints: this.apiEndpoints.size
        };
    }
}

/**
 * External API Manager
 * Provides API for external integrations (Power Automate, Zapier, webhooks, etc.)
 */
class ExternalAPIManager {
    constructor() {
        this.endpoints = new Map();
        this.webhooks = new Map();
        this.apiKey = null;
        this.initialize();
    }

    /**
     * Initialize external API
     */
    initialize() {
        // Setup standard endpoints
        this.registerEndpoint('addLocation', this.addLocation.bind(this));
        this.registerEndpoint('addLocations', this.addLocations.bind(this));
        this.registerEndpoint('updateLocation', this.updateLocation.bind(this));
        this.registerEndpoint('deleteLocation', this.deleteLocation.bind(this));
        this.registerEndpoint('getLocations', this.getLocations.bind(this));
        this.registerEndpoint('createLayer', this.createLayer.bind(this));
        this.registerEndpoint('getLayers', this.getLayers.bind(this));

        console.log('External API initialized');
    }

    /**
     * Register an API endpoint
     * @param {string} name - Endpoint name
     * @param {Function} handler - Handler function
     */
    registerEndpoint(name, handler) {
        this.endpoints.set(name, handler);
    }

    /**
     * Call an API endpoint
     * @param {string} name - Endpoint name
     * @param {Object} params - Parameters
     * @returns {Promise<Object>} Result
     */
    async call(name, params = {}) {
        const handler = this.endpoints.get(name);
        if (!handler) {
            return {
                success: false,
                error: `Endpoint ${name} not found`
            };
        }

        try {
            const result = await handler(params);
            return {
                success: true,
                data: result
            };
        } catch (error) {
            console.error(`Error calling endpoint ${name}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Add a single location
     * @param {Object} params - Location parameters
     * @returns {Promise<Object>} Result
     */
    async addLocation(params) {
        const { layerId, name, latitude, longitude, properties = {} } = params;

        if (!layerId) {
            throw new Error('layerId is required');
        }

        if (!latitude || !longitude) {
            throw new Error('latitude and longitude are required');
        }

        const feature = {
            id: Utils.generateId('feature'),
            name: name || 'Imported Location',
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            ...properties,
            importedAt: Utils.formatDate(),
            source: 'external_api'
        };

        const layerManager = stateManager.get('layerManager');
        layerManager.addFeaturesToLayer(layerId, [feature]);

        eventBus.emit('location.added', { layerId, feature });

        return {
            featureId: feature.id,
            layerId: layerId
        };
    }

    /**
     * Add multiple locations
     * @param {Object} params - Parameters
     * @returns {Promise<Object>} Result
     */
    async addLocations(params) {
        const { layerId, locations } = params;

        if (!layerId) {
            throw new Error('layerId is required');
        }

        if (!Array.isArray(locations) || locations.length === 0) {
            throw new Error('locations must be a non-empty array');
        }

        const features = locations.map(loc => ({
            id: Utils.generateId('feature'),
            name: loc.name || 'Imported Location',
            latitude: parseFloat(loc.latitude),
            longitude: parseFloat(loc.longitude),
            ...loc.properties,
            importedAt: Utils.formatDate(),
            source: 'external_api'
        }));

        const layerManager = stateManager.get('layerManager');
        layerManager.addFeaturesToLayer(layerId, features);

        eventBus.emit('locations.added', { layerId, count: features.length });

        return {
            count: features.length,
            layerId: layerId
        };
    }

    /**
     * Update a location
     * @param {Object} params - Parameters
     * @returns {Promise<Object>} Result
     */
    async updateLocation(params) {
        const { layerId, featureId, properties } = params;

        if (!layerId || !featureId) {
            throw new Error('layerId and featureId are required');
        }

        const layerManager = stateManager.get('layerManager');
        layerManager.updateFeature(layerId, featureId, properties);

        eventBus.emit('location.updated', { layerId, featureId });

        return { success: true };
    }

    /**
     * Delete a location
     * @param {Object} params - Parameters
     * @returns {Promise<Object>} Result
     */
    async deleteLocation(params) {
        const { layerId, featureId } = params;

        if (!layerId || !featureId) {
            throw new Error('layerId and featureId are required');
        }

        const layerManager = stateManager.get('layerManager');
        layerManager.deleteFeature(layerId, featureId);

        eventBus.emit('location.deleted', { layerId, featureId });

        return { success: true };
    }

    /**
     * Get all locations
     * @param {Object} params - Parameters
     * @returns {Promise<Object>} Result
     */
    async getLocations(params) {
        const { layerId } = params;

        if (layerId) {
            const layer = stateManager.getLayer(layerId);
            return layer ? layer.features : [];
        }

        const layers = stateManager.getAllLayers();
        return layers.flatMap(layer => layer.features || []);
    }

    /**
     * Create a new layer
     * @param {Object} params - Parameters
     * @returns {Promise<Object>} Result
     */
    async createLayer(params) {
        const { name, type = 'point', features = [] } = params;

        if (!name) {
            throw new Error('name is required');
        }

        const layerManager = stateManager.get('layerManager');
        const layerId = layerManager.createLayer(name, features, type, {
            source: 'external_api',
            createdAt: Utils.formatDate()
        });

        eventBus.emit('layer.created', { layerId });

        return { layerId };
    }

    /**
     * Get all layers
     * @returns {Promise<Array>} Layers
     */
    async getLayers() {
        const layers = stateManager.getAllLayers();
        return layers.map(layer => ({
            id: layer.id,
            name: layer.name,
            type: layer.type,
            featureCount: layer.features.length,
            visible: layer.visible
        }));
    }

    /**
     * Register a webhook
     * @param {string} event - Event name
     * @param {string} url - Webhook URL
     * @param {Object} options - Options
     */
    registerWebhook(event, url, options = {}) {
        const webhookId = Utils.generateId('webhook');
        const webhook = {
            id: webhookId,
            event,
            url,
            ...options,
            registeredAt: Utils.formatDate()
        };

        this.webhooks.set(webhookId, webhook);

        // Subscribe to event
        eventBus.on(event, async (data) => {
            await this.triggerWebhook(webhookId, data);
        });

        return webhookId;
    }

    /**
     * Trigger a webhook
     * @param {string} webhookId - Webhook ID
     * @param {*} data - Data to send
     */
    async triggerWebhook(webhookId, data) {
        const webhook = this.webhooks.get(webhookId);
        if (!webhook) return;

        try {
            const response = await fetch(webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(webhook.headers || {})
                },
                body: JSON.stringify({
                    event: webhook.event,
                    data: data,
                    timestamp: Utils.formatDate()
                })
            });

            if (!response.ok) {
                console.error(`Webhook ${webhookId} failed:`, response.statusText);
            }
        } catch (error) {
            console.error(`Error triggering webhook ${webhookId}:`, error);
        }
    }

    /**
     * Unregister webhook
     * @param {string} webhookId - Webhook ID
     */
    unregisterWebhook(webhookId) {
        this.webhooks.delete(webhookId);
    }

    /**
     * Get API documentation
     * @returns {Object} API documentation
     */
    getDocumentation() {
        return {
            endpoints: {
                addLocation: {
                    description: 'Add a single location to a layer',
                    params: {
                        layerId: 'string (required)',
                        name: 'string',
                        latitude: 'number (required)',
                        longitude: 'number (required)',
                        properties: 'object (optional)'
                    },
                    example: {
                        layerId: 'layer_123',
                        name: 'Store Location',
                        latitude: 40.7128,
                        longitude: -74.0060,
                        properties: {
                            address: '123 Main St',
                            city: 'New York'
                        }
                    }
                },
                addLocations: {
                    description: 'Add multiple locations to a layer',
                    params: {
                        layerId: 'string (required)',
                        locations: 'array of location objects (required)'
                    }
                },
                updateLocation: {
                    description: 'Update a location',
                    params: {
                        layerId: 'string (required)',
                        featureId: 'string (required)',
                        properties: 'object (required)'
                    }
                },
                deleteLocation: {
                    description: 'Delete a location',
                    params: {
                        layerId: 'string (required)',
                        featureId: 'string (required)'
                    }
                },
                getLocations: {
                    description: 'Get all locations (optionally filtered by layer)',
                    params: {
                        layerId: 'string (optional)'
                    }
                },
                createLayer: {
                    description: 'Create a new layer',
                    params: {
                        name: 'string (required)',
                        type: 'string (point|polygon, default: point)',
                        features: 'array (optional)'
                    }
                },
                getLayers: {
                    description: 'Get all layers',
                    params: {}
                }
            },
            webhooks: {
                description: 'Register webhooks to receive real-time updates',
                events: [
                    'location.added',
                    'location.updated',
                    'location.deleted',
                    'locations.added',
                    'layer.created',
                    'layer.deleted'
                ]
            }
        };
    }
}

// Create singleton instances
const pluginManager = new PluginManager();
const externalAPI = new ExternalAPIManager();

// Expose API globally for external access (e.g., browser console, Power Automate)
window.SalesMapperAPI = {
    // Call API endpoint
    call: (endpoint, params) => externalAPI.call(endpoint, params),

    // Direct endpoint access
    addLocation: (params) => externalAPI.call('addLocation', params),
    addLocations: (params) => externalAPI.call('addLocations', params),
    updateLocation: (params) => externalAPI.call('updateLocation', params),
    deleteLocation: (params) => externalAPI.call('deleteLocation', params),
    getLocations: (params) => externalAPI.call('getLocations', params),
    createLayer: (params) => externalAPI.call('createLayer', params),
    getLayers: () => externalAPI.call('getLayers'),

    // Webhook support
    registerWebhook: (event, url, options) => externalAPI.registerWebhook(event, url, options),

    // Documentation
    getDocumentation: () => externalAPI.getDocumentation(),

    // Version info
    version: '2.0.0'
};
