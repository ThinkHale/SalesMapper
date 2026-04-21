/**
 * Heat Map Overlay Plugin
 * Creates a visual heatmap overlay from visible marker data
 *
 * Features:
 * - Generates heatmap from all visible point layers
 * - Configurable radius, opacity, and intensity
 * - Optional weight property for data-driven intensity
 * - Custom gradient colors
 * - Auto-updates when layer visibility changes
 */

const HeatmapOverlayPlugin = {
    // Required: Unique plugin ID
    id: 'heatmap-overlay',

    // Required: Plugin name
    name: 'Heat Map Overlay',

    // Plugin version
    version: '1.0.0',

    // Plugin description
    description: 'Visualize point density with a heat map overlay',

    // Plugin author
    author: 'SalesMapper Team',

    // Plugin configuration with defaults
    config: {
        enabled: false,
        radius: 30,
        opacity: 0.7,
        maxIntensity: 10,
        dissipating: true,
        weightProperty: null, // Property to use for weighted heatmap (e.g., 'revenue')
        gradient: null, // Custom gradient (null uses default)
        hideMarkersWhenActive: true // Hide point markers when heatmap is shown
    },

    // Predefined gradient options
    gradients: {
        default: null, // Uses Google Maps default
        fire: [
            'rgba(0, 0, 0, 0)',
            'rgba(255, 0, 0, 0.6)',
            'rgba(255, 165, 0, 0.8)',
            'rgba(255, 255, 0, 1)'
        ],
        cool: [
            'rgba(0, 0, 0, 0)',
            'rgba(0, 0, 255, 0.4)',
            'rgba(0, 255, 255, 0.6)',
            'rgba(0, 255, 0, 0.8)',
            'rgba(255, 255, 0, 1)'
        ],
        purple: [
            'rgba(0, 0, 0, 0)',
            'rgba(128, 0, 128, 0.4)',
            'rgba(255, 0, 255, 0.6)',
            'rgba(255, 128, 255, 0.8)',
            'rgba(255, 255, 255, 1)'
        ],
        ocean: [
            'rgba(0, 0, 0, 0)',
            'rgba(0, 0, 139, 0.4)',
            'rgba(0, 100, 200, 0.6)',
            'rgba(0, 191, 255, 0.8)',
            'rgba(173, 216, 230, 1)'
        ],
        heat: [
            'rgba(0, 0, 0, 0)',
            'rgba(0, 0, 255, 0.3)',
            'rgba(0, 255, 0, 0.5)',
            'rgba(255, 255, 0, 0.7)',
            'rgba(255, 0, 0, 1)'
        ]
    },

    // Internal state
    heatmapLayer: null,
    api: null,
    eventUnsubscribers: [],
    uiElements: {},
    pluginEnabled: true, // Tracks if plugin is enabled via plugin manager
    hiddenLayerIds: [], // Track layers whose markers we've hidden

    /**
     * Check if plugin is active (plugin enabled AND heatmap enabled)
     * @returns {boolean} True if heatmap should be active
     */
    isActive() {
        return this.pluginEnabled && this.config.enabled;
    },

    /**
     * Initialize plugin
     * @param {Object} api - Plugin API interface
     */
    init(api) {
        console.log('[HeatmapOverlayPlugin] Initializing...');
        this.api = api;
        this.pluginEnabled = true;

        // Load saved configuration
        this.loadConfig();

        // Subscribe to relevant events
        this.subscribeToEvents();

        // Add UI elements
        this.addUIElements();

        console.log('[HeatmapOverlayPlugin] Initialized successfully');
    },

    /**
     * Load saved configuration from localStorage
     */
    loadConfig() {
        try {
            const saved = localStorage.getItem('heatmap-plugin-config');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.config = { ...this.config, ...parsed };
            }
        } catch (error) {
            console.warn('[HeatmapOverlayPlugin] Could not load saved config:', error);
        }
    },

    /**
     * Save configuration to localStorage
     */
    saveConfig() {
        try {
            localStorage.setItem('heatmap-plugin-config', JSON.stringify(this.config));
        } catch (error) {
            console.warn('[HeatmapOverlayPlugin] Could not save config:', error);
        }
    },

    /**
     * Subscribe to application events
     */
    subscribeToEvents() {
        // Layer visibility changes
        const unsubVisibility = this.api.on('layer.visibility.changed', () => {
            if (this.isActive()) {
                this.updateHeatmap();
            }
        });
        this.eventUnsubscribers.push(unsubVisibility);

        // Layer created/deleted
        const unsubCreated = this.api.on('layer.created', () => {
            if (this.isActive()) {
                this.updateHeatmap();
            }
        });
        this.eventUnsubscribers.push(unsubCreated);

        const unsubDeleted = this.api.on('layer.deleted', () => {
            if (this.isActive()) {
                this.updateHeatmap();
            }
        });
        this.eventUnsubscribers.push(unsubDeleted);

        // Feature changes
        const unsubFeatureAdded = this.api.on('feature.added', () => {
            if (this.isActive()) {
                this.updateHeatmap();
            }
        });
        this.eventUnsubscribers.push(unsubFeatureAdded);

        const unsubFeatureDeleted = this.api.on('feature.deleted', () => {
            if (this.isActive()) {
                this.updateHeatmap();
            }
        });
        this.eventUnsubscribers.push(unsubFeatureDeleted);

        // Data import
        const unsubImport = this.api.on('data.imported', () => {
            if (this.isActive()) {
                setTimeout(() => this.updateHeatmap(), 500);
            }
        });
        this.eventUnsubscribers.push(unsubImport);
    },

    /**
     * Add UI elements to the application
     */
    addUIElements() {
        // Heatmap button is now in the Plugins dropdown menu in the main UI
        // No longer adding a quick action button dynamically

        // Create configuration modal
        this.createConfigModal();
    },

    /**
     * Add quick action button
     */
    addQuickActionButton() {
        const quickActions = document.querySelector('.quick-actions');
        if (!quickActions) {
            console.warn('[HeatmapOverlayPlugin] Quick actions container not found');
            return;
        }

        // Create heatmap button
        const button = document.createElement('button');
        button.id = 'showHeatmapBtn';
        button.className = 'btn btn-small';
        button.title = 'Toggle heat map overlay';
        button.innerHTML = '<span>🔥</span>Heatmap';
        button.addEventListener('click', () => this.showConfigModal());

        quickActions.appendChild(button);
        this.uiElements.quickButton = button;

        // Update button state
        this.updateButtonState();
    },

    /**
     * Update the quick action button state
     */
    updateButtonState() {
        if (this.uiElements.quickButton) {
            if (this.config.enabled) {
                this.uiElements.quickButton.classList.add('active');
                this.uiElements.quickButton.style.background = 'linear-gradient(135deg, #ff6b35, #f7931e)';
                this.uiElements.quickButton.style.color = 'white';
            } else {
                this.uiElements.quickButton.classList.remove('active');
                this.uiElements.quickButton.style.background = '';
                this.uiElements.quickButton.style.color = '';
            }
        }
    },

    /**
     * Create configuration modal
     */
    createConfigModal() {
        // Check if modal already exists
        if (document.getElementById('heatmapModal')) {
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'heatmapModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Heat Map Settings</h2>
                    <span class="close" data-modal="heatmapModal">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="heatmap-toggle-section">
                        <label class="toggle-label">
                            <input type="checkbox" id="heatmapEnabled" ${this.config.enabled ? 'checked' : ''}>
                            <span class="toggle-text">Enable Heat Map Overlay</span>
                        </label>
                    </div>

                    <hr style="margin: 1rem 0; border-color: #333;">

                    <div class="form-group">
                        <label for="heatmapRadius">Radius: <span id="radiusValue">${this.config.radius}</span>px</label>
                        <input type="range" id="heatmapRadius" class="slider-wide" min="5" max="100" value="${this.config.radius}">
                    </div>

                    <div class="form-group">
                        <label for="heatmapOpacity">Opacity: <span id="heatmapOpacityValue">${Math.round(this.config.opacity * 100)}</span>%</label>
                        <input type="range" id="heatmapOpacity" class="slider-wide" min="10" max="100" value="${Math.round(this.config.opacity * 100)}">
                    </div>

                    <div class="form-group">
                        <label for="heatmapIntensity">Max Intensity: <span id="intensityValue">${this.config.maxIntensity}</span></label>
                        <input type="range" id="heatmapIntensity" class="slider-wide" min="1" max="50" value="${this.config.maxIntensity}">
                    </div>

                    <div class="form-group">
                        <label for="heatmapGradient">Color Gradient:</label>
                        <select id="heatmapGradient" class="form-select">
                            <option value="default" ${!this.config.gradient ? 'selected' : ''}>Default (Red-Yellow)</option>
                            <option value="fire" ${this.config.gradient === 'fire' ? 'selected' : ''}>Fire</option>
                            <option value="cool" ${this.config.gradient === 'cool' ? 'selected' : ''}>Cool</option>
                            <option value="purple" ${this.config.gradient === 'purple' ? 'selected' : ''}>Purple</option>
                            <option value="ocean" ${this.config.gradient === 'ocean' ? 'selected' : ''}>Ocean</option>
                            <option value="heat" ${this.config.gradient === 'heat' ? 'selected' : ''}>Spectrum</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="heatmapWeight">Weight Property (optional):</label>
                        <select id="heatmapWeight" class="form-select">
                            <option value="">None (equal weight)</option>
                        </select>
                        <small class="form-hint">Use a numeric property to influence point intensity</small>
                    </div>

                    <div class="form-group">
                        <label class="toggle-label">
                            <input type="checkbox" id="heatmapDissipating" ${this.config.dissipating ? 'checked' : ''}>
                            <span class="toggle-text">Dissipate on zoom</span>
                        </label>
                        <small class="form-hint">When enabled, radius adjusts based on zoom level</small>
                    </div>

                    <div class="form-group">
                        <label class="toggle-label">
                            <input type="checkbox" id="heatmapHideMarkers" ${this.config.hideMarkersWhenActive ? 'checked' : ''}>
                            <span class="toggle-text">Hide markers when active</span>
                        </label>
                        <small class="form-hint">Hide point markers to show only the heatmap overlay</small>
                    </div>

                    <div class="heatmap-stats" id="heatmapStats">
                        <p>Points in heatmap: <strong id="heatmapPointCount">0</strong></p>
                    </div>

                    <div class="modal-actions">
                        <button id="applyHeatmapBtn" class="btn btn-primary">Apply</button>
                        <button id="closeHeatmapBtn" class="btn btn-secondary">Close</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.uiElements.modal = modal;

        // Bind event listeners
        this.bindModalEvents();
    },

    /**
     * Bind modal event listeners
     */
    bindModalEvents() {
        const modal = this.uiElements.modal;
        if (!modal) return;

        // Close button
        const closeBtn = modal.querySelector('.close');
        closeBtn.addEventListener('click', () => this.hideConfigModal());

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hideConfigModal();
            }
        });

        // Enable toggle
        const enabledCheckbox = modal.querySelector('#heatmapEnabled');
        enabledCheckbox.addEventListener('change', (e) => {
            this.config.enabled = e.target.checked;
            this.updateButtonState();
            if (this.isActive()) {
                this.updateHeatmap();
            } else {
                this.removeHeatmap();
            }
            this.saveConfig();
        });

        // Radius slider
        const radiusSlider = modal.querySelector('#heatmapRadius');
        const radiusValue = modal.querySelector('#radiusValue');
        radiusSlider.addEventListener('input', (e) => {
            radiusValue.textContent = e.target.value;
            this.config.radius = parseInt(e.target.value);
        });

        // Opacity slider
        const opacitySlider = modal.querySelector('#heatmapOpacity');
        const opacityValue = modal.querySelector('#heatmapOpacityValue');
        opacitySlider.addEventListener('input', (e) => {
            opacityValue.textContent = e.target.value;
            this.config.opacity = parseInt(e.target.value) / 100;
        });

        // Intensity slider
        const intensitySlider = modal.querySelector('#heatmapIntensity');
        const intensityValue = modal.querySelector('#intensityValue');
        intensitySlider.addEventListener('input', (e) => {
            intensityValue.textContent = e.target.value;
            this.config.maxIntensity = parseInt(e.target.value);
        });

        // Gradient select
        const gradientSelect = modal.querySelector('#heatmapGradient');
        gradientSelect.addEventListener('change', (e) => {
            this.config.gradient = e.target.value === 'default' ? null : e.target.value;
        });

        // Weight property select
        const weightSelect = modal.querySelector('#heatmapWeight');
        weightSelect.addEventListener('change', (e) => {
            this.config.weightProperty = e.target.value || null;
        });

        // Dissipating checkbox
        const dissipatingCheckbox = modal.querySelector('#heatmapDissipating');
        dissipatingCheckbox.addEventListener('change', (e) => {
            this.config.dissipating = e.target.checked;
        });

        // Hide markers checkbox
        const hideMarkersCheckbox = modal.querySelector('#heatmapHideMarkers');
        hideMarkersCheckbox.addEventListener('change', (e) => {
            this.config.hideMarkersWhenActive = e.target.checked;
            // Immediately apply the change if heatmap is active
            if (this.isActive()) {
                if (this.config.hideMarkersWhenActive) {
                    this.hidePointLayerMarkers();
                } else {
                    this.showPointLayerMarkers();
                }
            }
        });

        // Apply button
        const applyBtn = modal.querySelector('#applyHeatmapBtn');
        applyBtn.addEventListener('click', () => {
            this.saveConfig();
            if (this.isActive()) {
                this.updateHeatmap();
            }
            this.api.showToast('Heat map settings applied', 'success');
        });

        // Close button
        const closeHeatmapBtn = modal.querySelector('#closeHeatmapBtn');
        closeHeatmapBtn.addEventListener('click', () => this.hideConfigModal());
    },

    /**
     * Show configuration modal
     */
    showConfigModal() {
        // Check if plugin is enabled
        if (!this.pluginEnabled) {
            this.api.showToast('Plugin is disabled. Enable it from Plugins menu.', 'warning');
            return;
        }

        // Update weight property options before showing
        this.populateWeightProperties();
        this.updatePointCount();

        if (this.uiElements.modal) {
            this.uiElements.modal.style.display = 'flex';
        }
    },

    /**
     * Hide configuration modal
     */
    hideConfigModal() {
        if (this.uiElements.modal) {
            this.uiElements.modal.style.display = 'none';
        }
    },

    /**
     * Populate weight property dropdown with available numeric properties
     */
    populateWeightProperties() {
        const weightSelect = document.getElementById('heatmapWeight');
        if (!weightSelect) return;

        // Get all visible point features
        const features = this.getVisiblePointFeatures();

        // Find numeric properties
        const numericProperties = new Set();
        features.forEach(feature => {
            Object.keys(feature).forEach(key => {
                // Skip system properties
                if (['id', 'layerId', 'latitude', 'longitude', 'wkt', 'geometry', 'createdAt', 'importedAt', 'source'].includes(key)) {
                    return;
                }
                // Check if value is numeric
                const value = feature[key];
                if (typeof value === 'number' || (typeof value === 'string' && !isNaN(parseFloat(value)))) {
                    numericProperties.add(key);
                }
            });
        });

        // Update select options
        weightSelect.innerHTML = '<option value="">None (equal weight)</option>';
        numericProperties.forEach(prop => {
            const option = document.createElement('option');
            option.value = prop;
            option.textContent = prop;
            if (this.config.weightProperty === prop) {
                option.selected = true;
            }
            weightSelect.appendChild(option);
        });
    },

    /**
     * Update point count display
     */
    updatePointCount() {
        const countElement = document.getElementById('heatmapPointCount');
        if (countElement) {
            const features = this.getVisiblePointFeatures();
            countElement.textContent = features.length;
        }
    },

    /**
     * Get all visible point features
     * @returns {Array} Array of features with lat/lng
     */
    getVisiblePointFeatures() {
        const layers = this.api.getAllLayers();
        const features = [];

        layers.forEach(layer => {
            // Only include visible point layers
            if (layer.visible && layer.type === 'point' && layer.features) {
                layer.features.forEach(feature => {
                    if (feature.latitude != null && feature.longitude != null) {
                        features.push({
                            ...feature,
                            layerId: layer.id
                        });
                    }
                });
            }
        });

        return features;
    },

    /**
     * Create or update the heatmap layer
     */
    updateHeatmap() {
        const map = this.api.getMap();
        if (!map) {
            console.warn('[HeatmapOverlayPlugin] Map not available');
            return;
        }

        // Check if visualization library is loaded
        if (!google.maps.visualization) {
            console.error('[HeatmapOverlayPlugin] Google Maps Visualization library not loaded');
            this.api.showToast('Heatmap library not available', 'error');
            return;
        }

        // Get visible point features
        const features = this.getVisiblePointFeatures();

        if (features.length === 0) {
            this.removeHeatmap();
            return;
        }

        // Build heatmap data
        const heatmapData = features.map(feature => {
            const location = new google.maps.LatLng(
                parseFloat(feature.latitude),
                parseFloat(feature.longitude)
            );

            // Apply weight if configured
            if (this.config.weightProperty && feature[this.config.weightProperty] != null) {
                const weight = parseFloat(feature[this.config.weightProperty]);
                if (!isNaN(weight) && weight > 0) {
                    return { location, weight };
                }
            }

            return location;
        });

        // Get gradient
        const gradient = this.config.gradient ? this.gradients[this.config.gradient] : null;

        // Create or update heatmap layer
        if (this.heatmapLayer) {
            // Update existing layer
            this.heatmapLayer.setData(heatmapData);
            this.heatmapLayer.setOptions({
                radius: this.config.radius,
                opacity: this.config.opacity,
                maxIntensity: this.config.maxIntensity,
                dissipating: this.config.dissipating,
                gradient: gradient
            });
        } else {
            // Create new heatmap layer
            this.heatmapLayer = new google.maps.visualization.HeatmapLayer({
                data: heatmapData,
                map: map,
                radius: this.config.radius,
                opacity: this.config.opacity,
                maxIntensity: this.config.maxIntensity,
                dissipating: this.config.dissipating,
                gradient: gradient
            });
        }

        // Hide markers if configured
        this.hidePointLayerMarkers();

        // Update point count
        this.updatePointCount();

        console.log(`[HeatmapOverlayPlugin] Heatmap updated with ${features.length} points`);
    },

    /**
     * Remove the heatmap layer
     */
    removeHeatmap() {
        if (this.heatmapLayer) {
            this.heatmapLayer.setMap(null);
            this.heatmapLayer = null;
        }

        // Restore markers if we hid them
        this.showPointLayerMarkers();

        this.updatePointCount();
    },

    /**
     * Hide markers for visible point layers
     */
    hidePointLayerMarkers() {
        if (!this.config.hideMarkersWhenActive) return;

        const mapManager = this.api.getState('mapManager');
        if (!mapManager) return;

        const layers = this.api.getAllLayers();
        this.hiddenLayerIds = [];

        layers.forEach(layer => {
            // Only hide markers for visible point layers
            if (layer.visible && layer.type === 'point') {
                const mapLayer = mapManager.layers.get(layer.id);
                if (mapLayer) {
                    // Hide clusterer if present
                    if (mapLayer.clusterer) {
                        mapLayer.clusterer.setMap(null);
                    }
                    // Hide individual markers
                    if (mapLayer.markers) {
                        mapLayer.markers.forEach(marker => marker.setMap(null));
                    }
                    this.hiddenLayerIds.push(layer.id);
                }
            }
        });

        if (this.hiddenLayerIds.length > 0) {
            console.log(`[HeatmapOverlayPlugin] Hidden markers for ${this.hiddenLayerIds.length} layer(s)`);
        }
    },

    /**
     * Show markers for layers we previously hid
     */
    showPointLayerMarkers() {
        if (this.hiddenLayerIds.length === 0) return;

        const mapManager = this.api.getState('mapManager');
        if (!mapManager) return;

        const map = this.api.getMap();
        const layers = this.api.getAllLayers();

        this.hiddenLayerIds.forEach(layerId => {
            const layer = layers.find(l => l.id === layerId);
            // Only restore if layer is still visible
            if (layer && layer.visible) {
                const mapLayer = mapManager.layers.get(layerId);
                if (mapLayer) {
                    // Show clusterer if present
                    if (mapLayer.clusterer) {
                        mapLayer.clusterer.setMap(map);
                    }
                    // Show individual markers
                    if (mapLayer.markers) {
                        mapLayer.markers.forEach(marker => marker.setMap(map));
                    }
                }
            }
        });

        console.log(`[HeatmapOverlayPlugin] Restored markers for ${this.hiddenLayerIds.length} layer(s)`);
        this.hiddenLayerIds = [];
    },

    /**
     * Toggle heatmap on/off
     */
    toggle() {
        if (!this.pluginEnabled) {
            this.api.showToast('Plugin is disabled. Enable it from Plugins menu.', 'warning');
            return;
        }

        this.config.enabled = !this.config.enabled;
        this.updateButtonState();

        if (this.config.enabled) {
            this.updateHeatmap();
            this.api.showToast('Heat map enabled', 'success');
        } else {
            this.removeHeatmap();
            this.api.showToast('Heat map disabled', 'info');
        }

        this.saveConfig();
    },

    /**
     * Plugin lifecycle: called when enabled via plugin manager
     */
    onEnable() {
        console.log('[HeatmapOverlayPlugin] Enabled');
        this.pluginEnabled = true;

        // Show UI elements
        if (this.uiElements.quickButton) {
            this.uiElements.quickButton.style.display = '';
        }

        // Restore heatmap if it was enabled before
        if (this.config.enabled) {
            this.updateHeatmap();
            this.updateButtonState();
        }
    },

    /**
     * Plugin lifecycle: called when disabled via plugin manager
     */
    onDisable() {
        console.log('[HeatmapOverlayPlugin] Disabled');
        this.pluginEnabled = false;

        // Remove the heatmap layer from the map
        this.removeHeatmap();

        // Hide UI elements (but keep them in DOM for re-enabling)
        if (this.uiElements.quickButton) {
            this.uiElements.quickButton.style.display = 'none';
        }

        // Close modal if open
        this.hideConfigModal();
    },

    /**
     * Plugin lifecycle: called when unregistered
     */
    destroy() {
        console.log('[HeatmapOverlayPlugin] Destroying...');

        // Remove heatmap layer
        this.removeHeatmap();

        // Unsubscribe from events
        this.eventUnsubscribers.forEach(unsub => {
            if (typeof unsub === 'function') {
                unsub();
            }
        });
        this.eventUnsubscribers = [];

        // Remove UI elements
        if (this.uiElements.quickButton) {
            this.uiElements.quickButton.remove();
        }
        if (this.uiElements.modal) {
            this.uiElements.modal.remove();
        }

        console.log('[HeatmapOverlayPlugin] Destroyed');
    },

    // Plugin API endpoints - expose functionality to other plugins
    api: {
        /**
         * Enable heatmap
         */
        'heatmap.enable': async function() {
            HeatmapOverlayPlugin.config.enabled = true;
            HeatmapOverlayPlugin.updateButtonState();
            HeatmapOverlayPlugin.updateHeatmap();
            HeatmapOverlayPlugin.saveConfig();
            return { success: true };
        },

        /**
         * Disable heatmap
         */
        'heatmap.disable': async function() {
            HeatmapOverlayPlugin.config.enabled = false;
            HeatmapOverlayPlugin.updateButtonState();
            HeatmapOverlayPlugin.removeHeatmap();
            HeatmapOverlayPlugin.saveConfig();
            return { success: true };
        },

        /**
         * Toggle heatmap
         */
        'heatmap.toggle': async function() {
            HeatmapOverlayPlugin.toggle();
            return { enabled: HeatmapOverlayPlugin.config.enabled };
        },

        /**
         * Update heatmap configuration
         */
        'heatmap.configure': async function(params) {
            const { radius, opacity, maxIntensity, gradient, weightProperty, dissipating } = params;

            if (radius !== undefined) HeatmapOverlayPlugin.config.radius = radius;
            if (opacity !== undefined) HeatmapOverlayPlugin.config.opacity = opacity;
            if (maxIntensity !== undefined) HeatmapOverlayPlugin.config.maxIntensity = maxIntensity;
            if (gradient !== undefined) HeatmapOverlayPlugin.config.gradient = gradient;
            if (weightProperty !== undefined) HeatmapOverlayPlugin.config.weightProperty = weightProperty;
            if (dissipating !== undefined) HeatmapOverlayPlugin.config.dissipating = dissipating;

            if (HeatmapOverlayPlugin.config.enabled) {
                HeatmapOverlayPlugin.updateHeatmap();
            }
            HeatmapOverlayPlugin.saveConfig();

            return { success: true, config: HeatmapOverlayPlugin.config };
        },

        /**
         * Get current configuration
         */
        'heatmap.getConfig': async function() {
            return HeatmapOverlayPlugin.config;
        },

        /**
         * Get heatmap statistics
         */
        'heatmap.getStats': async function() {
            const features = HeatmapOverlayPlugin.getVisiblePointFeatures();
            return {
                enabled: HeatmapOverlayPlugin.config.enabled,
                pointCount: features.length,
                config: HeatmapOverlayPlugin.config
            };
        }
    }
};

// Auto-register plugin when loaded
if (typeof pluginManager !== 'undefined') {
    pluginManager.register(HeatmapOverlayPlugin);
}
