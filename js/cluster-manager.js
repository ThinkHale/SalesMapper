/**
 * Cluster Manager - Enhanced Marker Clustering
 * v3.0 Phase 4: Performance & Scale
 *
 * Features:
 * - Custom cluster renderer with gradient colors
 * - Spider-out for small clusters (3-10 markers)
 * - Smart interaction patterns
 * - Layer-aware clustering
 * - User-configurable settings
 * - Performance optimized for large datasets
 */

class ClusterManager {
    constructor(map) {
        this.map = map;
        this.clusterers = new Map(); // layerId -> clusterer instance
        this.clusterSettings = this.loadSettings();
        this.spiderfyMarkers = [];
        this.activeSpiderCluster = null;

        // Cluster size thresholds with colors
        this.clusterSizes = [
            { min: 2, max: 9, color: '#4CAF50', textColor: '#FFFFFF', size: 40, label: 'Small' },
            { min: 10, max: 49, color: '#FF9800', textColor: '#FFFFFF', size: 50, label: 'Medium' },
            { min: 50, max: 99, color: '#F44336', textColor: '#FFFFFF', size: 60, label: 'Large' },
            { min: 100, max: 499, color: '#9C27B0', textColor: '#FFFFFF', size: 70, label: 'X-Large' },
            { min: 500, max: Infinity, color: '#E91E63', textColor: '#FFFFFF', size: 80, label: 'Huge' }
        ];
    }

    /**
     * Initialize clustering for a layer
     * @param {string} layerId - Layer ID
     * @param {Array} markers - Markers to cluster
     * @param {string} color - Layer color
     * @param {boolean} initiallyVisible - Whether layer should be visible initially
     */
    initializeForLayer(layerId, markers, color, initiallyVisible = true) {

        if (!markers || markers.length === 0) {
            return null;
        }

        // Check if clustering is disabled globally or for this specific layer
        if (!this.clusterSettings.enabled) {
            // Just add markers to map without clustering (only if initially visible)
            if (initiallyVisible) {
                markers.forEach(marker => marker.setMap(this.map));
            }
            return null;
        }

        // Don't cluster if below minimum threshold
        if (markers.length < this.clusterSettings.minClusterSize) {
            // Add markers to map without clustering (only if initially visible)
            if (initiallyVisible) {
                markers.forEach(marker => marker.setMap(this.map));
            }
            return null;
        }

        // Remove existing clusterer for this layer
        this.removeClusterer(layerId);

        // Create custom renderer
        const renderer = this.createCustomRenderer(color, layerId);

        // Initialize MarkerClusterer
        try {
            if (typeof markerClusterer === 'undefined' || !markerClusterer.MarkerClusterer) {
                console.warn('MarkerClusterer library not loaded');
                // Fallback: show markers without clustering (only if initially visible)
                if (initiallyVisible) {
                    markers.forEach(marker => marker.setMap(this.map));
                }
                return null;
            }

            const mapToUse = initiallyVisible ? this.map : null;
            console.log(`🔧 Creating MarkerClusterer for ${layerId}: initiallyVisible=${initiallyVisible}, map=${mapToUse ? 'SET' : 'NULL'}, markers=${markers.length}`);

            const clusterer = new markerClusterer.MarkerClusterer({
                map: mapToUse,
                markers: markers,
                renderer: renderer,
                algorithm: this.createAlgorithm(),
                onClusterClick: (event, cluster, map) => {
                    this.handleClusterClick(cluster, layerId);
                }
            });

            // Verify the clusterer's map after creation
            const actualMap = clusterer.getMap();
            console.log(`🔍 Clusterer created - actualMap after init: ${actualMap ? 'HAS MAP (BUG!)' : 'null (correct)'}`);

            // Store clusterer
            this.clusterers.set(layerId, {
                clusterer: clusterer,
                markers: markers,
                color: color
            });

            console.log(`Enhanced clustering initialized for ${layerId}: ${markers.length} markers`);
            return clusterer;

        } catch (error) {
            console.error('Error initializing clusterer:', error);
            // Fallback: show markers without clustering (only if initially visible)
            if (initiallyVisible) {
                markers.forEach(marker => marker.setMap(this.map));
            }
            return null;
        }
    }

    /**
     * Create custom cluster renderer
     */
    createCustomRenderer(layerColor, layerId) {
        const clusterSizes = this.clusterSizes;
        const settings = this.clusterSettings;

        return {
            render: ({ count, position }, stats) => {
                // Determine cluster size and color
                const sizeConfig = clusterSizes.find(size =>
                    count >= size.min && count <= size.max
                ) || clusterSizes[0];

                // Use layer color if enabled, otherwise use count-based color
                const color = settings.useLayerColors ? layerColor : sizeConfig.color;
                const size = sizeConfig.size;

                // Create custom SVG icon
                const svg = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                        <defs>
                            <filter id="shadow-${count}" x="-50%" y="-50%" width="200%" height="200%">
                                <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
                                <feOffset dx="0" dy="2" result="offsetblur"/>
                                <feComponentTransfer>
                                    <feFuncA type="linear" slope="0.3"/>
                                </feComponentTransfer>
                                <feMerge>
                                    <feMergeNode/>
                                    <feMergeNode in="SourceGraphic"/>
                                </feMerge>
                            </filter>
                            <radialGradient id="grad-${count}" cx="35%" cy="35%">
                                <stop offset="0%" style="stop-color:${this.lightenColor(color, 20)};stop-opacity:1" />
                                <stop offset="100%" style="stop-color:${color};stop-opacity:1" />
                            </radialGradient>
                        </defs>
                        <circle
                            cx="${size/2}"
                            cy="${size/2}"
                            r="${size/2 - 2}"
                            fill="url(#grad-${count})"
                            stroke="white"
                            stroke-width="2"
                            filter="url(#shadow-${count})"
                        />
                        ${settings.showCounts ? `
                        <text
                            x="${size/2}"
                            y="${size/2}"
                            text-anchor="middle"
                            dominant-baseline="central"
                            fill="${sizeConfig.textColor}"
                            font-size="${size * 0.4}"
                            font-weight="bold"
                            font-family="Arial, sans-serif"
                        >${this.formatCount(count)}</text>
                        ` : ''}
                    </svg>
                `;

                // Create marker
                const marker = new google.maps.Marker({
                    position: position,
                    icon: {
                        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
                        scaledSize: new google.maps.Size(size, size),
                        anchor: new google.maps.Point(size/2, size/2)
                    },
                    zIndex: count,
                    title: this.createClusterTitle(count, layerId)
                });

                // Add hover tooltip
                if (settings.showTooltip) {
                    this.addClusterTooltip(marker, count, layerId);
                }

                return marker;
            }
        };
    }

    /**
     * Create clustering algorithm with custom settings
     */
    createAlgorithm() {
        const settings = this.clusterSettings;

        // Use GridAlgorithm for better performance
        if (typeof markerClusterer === 'undefined' || !markerClusterer.GridAlgorithm) {
            return undefined; // Use default
        }

        return new markerClusterer.GridAlgorithm({
            gridSize: settings.clusterRadius,
            maxZoom: settings.maxZoom
        });
    }

    /**
     * Handle cluster click - spider-out for small clusters, zoom for large
     */
    handleClusterClick(cluster, layerId) {
        const markers = cluster.markers;
        const count = markers.length;

        // Clear any existing spiderfy
        this.clearSpiderfy();

        // Strategy based on cluster size
        if (count <= this.clusterSettings.spiderfyMaxMarkers && this.clusterSettings.spiderfy) {
            // Spider-out for small clusters
            this.spiderfyCluster(cluster, markers);
        } else if (count <= 50) {
            // Zoom to bounds for medium clusters
            this.zoomToClusterBounds(markers);
        } else {
            // Show modal list for large clusters
            this.showClusterModal(markers, layerId);
        }
    }

    /**
     * Spider-out small clusters in a radial pattern
     */
    spiderfyCluster(cluster, markers) {
        const center = cluster.position;
        const count = markers.length;

        // Calculate spider leg length based on zoom
        const zoom = this.map.getZoom();
        const legLengthMeters = 50 / Math.pow(2, zoom - 15); // Adaptive length

        // Create spider legs in a circle
        const angleStep = (2 * Math.PI) / count;

        this.spiderfyMarkers = markers.map((marker, index) => {
            const angle = angleStep * index;
            const offset = google.maps.geometry.spherical.computeOffset(
                center,
                legLengthMeters,
                angle * 180 / Math.PI
            );

            // Create spider leg line
            const line = new google.maps.Polyline({
                path: [center, offset],
                strokeColor: '#666666',
                strokeOpacity: 0.6,
                strokeWeight: 2,
                map: this.map,
                zIndex: 1
            });

            // Move marker to spider position
            const spiderMarker = new google.maps.Marker({
                position: offset,
                map: this.map,
                icon: marker.getIcon(),
                title: marker.getTitle(),
                zIndex: 1000
            });

            // Copy click handler
            if (marker.clickHandler) {
                spiderMarker.addListener('click', marker.clickHandler);
            }

            return { marker: spiderMarker, line: line };
        });

        this.activeSpiderCluster = cluster;

        // Add click listener to map to clear spiderfy
        const clearListener = google.maps.event.addListener(this.map, 'click', () => {
            this.clearSpiderfy();
            google.maps.event.removeListener(clearListener);
        });
    }

    /**
     * Clear spider-out markers
     */
    clearSpiderfy() {
        this.spiderfyMarkers.forEach(({ marker, line }) => {
            marker.setMap(null);
            line.setMap(null);
        });
        this.spiderfyMarkers = [];
        this.activeSpiderCluster = null;
    }

    /**
     * Zoom to cluster bounds
     */
    zoomToClusterBounds(markers) {
        const bounds = new google.maps.LatLngBounds();
        markers.forEach(marker => {
            bounds.extend(marker.getPosition());
        });

        this.map.fitBounds(bounds);

        // Add small padding
        setTimeout(() => {
            const currentZoom = this.map.getZoom();
            if (currentZoom > 18) {
                this.map.setZoom(18);
            }
        }, 300);
    }

    /**
     * Show modal with cluster contents
     */
    showClusterModal(markers, layerId) {
        const modal = document.createElement('div');
        modal.className = 'cluster-modal';
        modal.innerHTML = `
            <div class="cluster-modal-content">
                <div class="cluster-modal-header">
                    <h3>📍 Cluster Contents (${markers.length} locations)</h3>
                    <button class="close-cluster-modal">×</button>
                </div>
                <div class="cluster-modal-body">
                    <div class="cluster-list">
                        ${markers.slice(0, 100).map((marker, index) => {
                            const title = marker.getTitle() || `Location ${index + 1}`;
                            const pos = marker.getPosition();
                            return `
                                <div class="cluster-item" data-marker-index="${index}">
                                    <div class="cluster-item-icon">📍</div>
                                    <div class="cluster-item-content">
                                        <div class="cluster-item-title">${title}</div>
                                        <div class="cluster-item-coords">
                                            ${pos.lat().toFixed(6)}, ${pos.lng().toFixed(6)}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                        ${markers.length > 100 ? `
                            <div class="cluster-item-more">
                                + ${markers.length - 100} more locations
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="cluster-modal-footer">
                    <button class="btn btn-secondary close-cluster-modal">Close</button>
                    <button class="btn btn-primary zoom-to-cluster">Zoom to All</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        modal.querySelectorAll('.close-cluster-modal').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });

        modal.querySelector('.zoom-to-cluster').addEventListener('click', () => {
            this.zoomToClusterBounds(markers);
            modal.remove();
        });

        // Click on cluster item to zoom to marker
        modal.querySelectorAll('.cluster-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                const marker = markers[index];
                this.map.setCenter(marker.getPosition());
                this.map.setZoom(18);
                modal.remove();

                // Trigger marker click
                google.maps.event.trigger(marker, 'click');
            });
        });
    }

    /**
     * Add tooltip on hover
     */
    addClusterTooltip(marker, count, layerId) {
        let tooltip = null;

        marker.addListener('mouseover', () => {
            tooltip = new google.maps.InfoWindow({
                content: `
                    <div class="cluster-tooltip">
                        <strong>${count} locations</strong>
                        <div class="cluster-tooltip-hint">Click to ${count <= this.clusterSettings.spiderfyMaxMarkers ? 'expand' : 'zoom in'}</div>
                    </div>
                `
            });
            tooltip.open(this.map, marker);
        });

        marker.addListener('mouseout', () => {
            if (tooltip) {
                tooltip.close();
                tooltip = null;
            }
        });
    }

    /**
     * Create cluster title
     */
    createClusterTitle(count, layerId) {
        return `Cluster of ${count} locations (click to expand)`;
    }

    /**
     * Format count for display
     */
    formatCount(count) {
        if (count >= 1000) {
            return (count / 1000).toFixed(1) + 'K';
        }
        return count.toString();
    }

    /**
     * Lighten color for gradient
     */
    lightenColor(color, percent) {
        const num = parseInt(color.replace("#",""), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 +
            (G<255?G<1?0:G:255)*0x100 + (B<255?B<1?0:B:255))
            .toString(16).slice(1);
    }

    /**
     * Remove clusterer for a layer
     */
    removeClusterer(layerId) {
        if (this.clusterers.has(layerId)) {
            const { clusterer } = this.clusterers.get(layerId);
            if (clusterer && clusterer.clearMarkers) {
                clusterer.clearMarkers();
                clusterer.setMap(null);
            }
            this.clusterers.delete(layerId);
        }
    }

    /**
     * Update settings
     */
    updateSettings(newSettings) {
        this.clusterSettings = { ...this.clusterSettings, ...newSettings };
        this.saveSettings();

        // Re-initialize all clusterers
        this.reInitializeAll();

        if (window.eventBus) {
            eventBus.emit('cluster.settingsUpdated', this.clusterSettings);
        }
    }

    /**
     * Re-initialize all clusterers
     */
    reInitializeAll() {
        const layersToReinit = Array.from(this.clusterers.entries());

        layersToReinit.forEach(([layerId, { markers, color }]) => {
            this.initializeForLayer(layerId, markers, color);
        });
    }

    /**
     * Get current settings
     */
    getSettings() {
        return { ...this.clusterSettings };
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
        try {
            const stored = localStorage.getItem('salesMapper_clusterSettings');
            if (stored) {
                return { ...this.getDefaultSettings(), ...JSON.parse(stored) };
            }
        } catch (error) {
            console.error('Error loading cluster settings:', error);
        }
        return this.getDefaultSettings();
    }

    /**
     * Save settings to localStorage
     */
    saveSettings() {
        try {
            localStorage.setItem('salesMapper_clusterSettings', JSON.stringify(this.clusterSettings));
        } catch (error) {
            console.error('Error saving cluster settings:', error);
        }
    }

    /**
     * Get default settings
     */
    getDefaultSettings() {
        return {
            enabled: true,
            clusterRadius: 60,
            minClusterSize: 2,
            maxZoom: 16,
            showCounts: true,
            showTooltip: true,
            spiderfy: true,
            spiderfyMaxMarkers: 10,
            useLayerColors: false,
            animateZoom: true
        };
    }

    /**
     * Render settings panel
     */
    renderSettingsPanel() {
        const container = document.getElementById('clusterSettingsContent');
        if (!container) return;

        const settings = this.clusterSettings;

        container.innerHTML = `
            <div class="cluster-settings">
                <div class="setting-row">
                    <label class="setting-label">
                        <input type="checkbox" id="clusterEnabled" ${settings.enabled ? 'checked' : ''}>
                        Enable Clustering
                    </label>
                </div>

                <div class="setting-row">
                    <label class="setting-label">Cluster Radius: ${settings.clusterRadius}px</label>
                    <input type="range" id="clusterRadius" min="30" max="100" value="${settings.clusterRadius}" step="5">
                </div>

                <div class="setting-row">
                    <label class="setting-label">Min Cluster Size: ${settings.minClusterSize}</label>
                    <input type="range" id="minClusterSize" min="2" max="10" value="${settings.minClusterSize}">
                </div>

                <div class="setting-row">
                    <label class="setting-label">Max Zoom Level: ${settings.maxZoom}</label>
                    <input type="range" id="maxZoom" min="10" max="20" value="${settings.maxZoom}">
                </div>

                <div class="setting-row">
                    <label class="setting-label">Spider-out Max: ${settings.spiderfyMaxMarkers}</label>
                    <input type="range" id="spiderfyMaxMarkers" min="3" max="15" value="${settings.spiderfyMaxMarkers}">
                </div>

                <div class="setting-row">
                    <label class="setting-label">
                        <input type="checkbox" id="showCounts" ${settings.showCounts ? 'checked' : ''}>
                        Show Counts
                    </label>
                </div>

                <div class="setting-row">
                    <label class="setting-label">
                        <input type="checkbox" id="showTooltip" ${settings.showTooltip ? 'checked' : ''}>
                        Show Hover Tooltips
                    </label>
                </div>

                <div class="setting-row">
                    <label class="setting-label">
                        <input type="checkbox" id="spiderfy" ${settings.spiderfy ? 'checked' : ''}>
                        Enable Spider-out
                    </label>
                </div>

                <div class="setting-row">
                    <label class="setting-label">
                        <input type="checkbox" id="useLayerColors" ${settings.useLayerColors ? 'checked' : ''}>
                        Use Layer Colors
                    </label>
                </div>

                <div class="setting-actions">
                    <button class="btn btn-secondary" id="resetClusterSettings">Reset to Defaults</button>
                    <button class="btn btn-primary" id="applyClusterSettings">Apply Changes</button>
                </div>
            </div>
        `;

        // Event listeners
        container.querySelector('#applyClusterSettings').addEventListener('click', () => {
            this.applySettingsFromPanel();
        });

        container.querySelector('#resetClusterSettings').addEventListener('click', () => {
            this.updateSettings(this.getDefaultSettings());
            this.renderSettingsPanel();
            if (window.toastManager) {
                toastManager.success('Cluster settings reset to defaults');
            }
        });
    }

    /**
     * Apply settings from panel inputs
     */
    applySettingsFromPanel() {
        const newSettings = {
            enabled: document.getElementById('clusterEnabled').checked,
            clusterRadius: parseInt(document.getElementById('clusterRadius').value),
            minClusterSize: parseInt(document.getElementById('minClusterSize').value),
            maxZoom: parseInt(document.getElementById('maxZoom').value),
            spiderfyMaxMarkers: parseInt(document.getElementById('spiderfyMaxMarkers').value),
            showCounts: document.getElementById('showCounts').checked,
            showTooltip: document.getElementById('showTooltip').checked,
            spiderfy: document.getElementById('spiderfy').checked,
            useLayerColors: document.getElementById('useLayerColors').checked
        };

        this.updateSettings(newSettings);

        if (window.toastManager) {
            toastManager.success('Cluster settings updated');
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClusterManager;
}
