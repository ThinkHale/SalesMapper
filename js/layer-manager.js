/**
 * Layer Manager
 * Manages layer creation, editing, filtering, and sorting
 * Integrated with StateManager and EventBus
 */

class LayerManager {
    constructor(mapManager) {
        this.mapManager = mapManager;
        this.activeFilters = new Map(); // layerId -> filter config
        this.activeSorts = new Map(); // layerId -> sort config

        // Use StateManager for layers data instead of local storage
        // StateManager is initialized in app.js, so layers are managed centrally
    }

    /**
     * Get layers from state
     */
    get layers() {
        return stateManager.get('layers') || new Map();
    }

    /**
     * Set layers in state
     */
    set layers(value) {
        stateManager.set('layers', value);
    }

    /**
     * Get layer order from state
     */
    get layerOrder() {
        return stateManager.get('layerOrder') || [];
    }

    /**
     * Set layer order in state
     */
    set layerOrder(value) {
        stateManager.set('layerOrder', value);
    }

    /**
     * Get layer groups from state
     */
    get layerGroups() {
        return stateManager.get('layerGroups') || new Map();
    }

    /**
     * Set layer groups in state
     */
    set layerGroups(value) {
        stateManager.set('layerGroups', value);
    }

    /**
     * Create a new layer
     * @param {string} name - Layer name
     * @param {Array} features - Array of features
     * @param {string} type - Layer type ('polygon' or 'point')
     * @param {Object} metadata - Additional layer metadata
     * @returns {string} Layer ID
     */
    createLayer(name, features = [], type = 'point', metadata = {}) {
        const layerId = Utils.generateId('layer');

        const layer = {
            id: layerId,
            name: name,
            type: type,
            features: features,
            visible: true,
            opacity: 1.0,
            color: null,
            groupId: metadata.groupId || null,
            metadata: metadata,
            createdAt: Utils.formatDate()
        };

        // Store layer in state
        const layers = this.layers;
        layers.set(layerId, layer);
        this.layers = layers;

        const layerOrder = this.layerOrder;
        layerOrder.push(layerId);
        this.layerOrder = layerOrder;

        // Add to map if there are features
        if (features.length > 0) {
            const color = this.mapManager.addFeaturesToLayer(layerId, features, type);
            layer.color = color;
        } else {
            // Create empty data source
            this.mapManager.createDataSource(layerId, type === 'point');
            layer.color = this.mapManager.getNextColor();

            // Add empty layer to mapManager.layers so it can be toggled and synced
            if (type === 'polygon') {
                this.mapManager.addPolygonLayer(layerId, layer.color, layer.visible);
            } else if (type === 'point') {
                this.mapManager.addPointLayer(layerId, layer.color, layer.visible);
            }
        }

        // Emit event
        eventBus.emit('layer.created', { layerId, layer });

        return layerId;
    }

    /**
     * Add features to an existing layer
     * @param {string} layerId - Layer ID
     * @param {Array} features - Array of features to add
     */
    addFeaturesToLayer(layerId, features, featureType = null) {
        const layers = this.layers;
        const layer = layers.get(layerId);
        if (!layer) {
            console.error(`Layer ${layerId} not found`);
            return;
        }

        // Add to layer data
        layer.features.push(...features);

        // Determine the type to use for rendering
        // If featureType is provided, use it; otherwise use layer's type
        const typeToUse = featureType || layer.type;

        // Check if layer now contains mixed types
        const hasPoints = layer.features.some(f => f.latitude !== undefined && f.longitude !== undefined);
        const hasPolygons = layer.features.some(f => f.wkt !== undefined);

        if (hasPoints && hasPolygons && layer.type !== 'mixed') {
            // Layer now contains both points and polygons
            layer.type = 'mixed';
            console.log(`Layer ${layerId} now contains mixed feature types`);
        }

        layers.set(layerId, layer);
        this.layers = layers;

        // Add to map with the specific feature type
        const color = this.mapManager.addFeaturesToLayer(layerId, features, typeToUse, layer.color);
        layer.color = color;

        // Emit event
        eventBus.emit('features.added', { layerId, features, count: features.length });
    }

    /**
     * Toggle layer visibility
     * @param {string} layerId - Layer ID
     */
    toggleLayerVisibility(layerId) {
        const layers = this.layers;
        const layer = layers.get(layerId);
        if (!layer) return;

        layer.visible = !layer.visible;
        layers.set(layerId, layer);
        this.layers = layers;

        this.mapManager.toggleLayerVisibility(layerId, layer.visible);

        // Emit event
        eventBus.emit('layer.visibility.changed', { layerId, visible: layer.visible });
    }

    /**
     * Rename a layer
     * @param {string} layerId - Layer ID
     * @param {string} newName - New layer name
     */
    renameLayer(layerId, newName) {
        const layers = this.layers;
        const layer = layers.get(layerId);
        if (!layer) return false;

        const oldName = layer.name;
        layer.name = newName;
        layers.set(layerId, layer);
        this.layers = layers;

        // Emit event
        eventBus.emit('layer.renamed', { layerId, oldName, newName });

        return true;
    }

    /**
     * Move a feature from one layer to another
     * @param {string} sourceLayerId - Source layer ID
     * @param {string} featureId - Feature ID to move
     * @param {string} targetLayerId - Target layer ID
     * @returns {boolean} Success status
     */
    moveFeatureToLayer(sourceLayerId, featureId, targetLayerId) {
        const layers = this.layers;
        const sourceLayer = layers.get(sourceLayerId);
        const targetLayer = layers.get(targetLayerId);

        if (!sourceLayer || !targetLayer) {
            console.error('Source or target layer not found');
            return false;
        }

        // Find the feature in source layer
        const featureIndex = sourceLayer.features.findIndex(f => f.id === featureId);
        if (featureIndex === -1) {
            console.error(`Feature ${featureId} not found in source layer`);
            return false;
        }

        // Get the feature
        const feature = sourceLayer.features[featureIndex];

        // Remove from source layer data
        sourceLayer.features.splice(featureIndex, 1);
        layers.set(sourceLayerId, sourceLayer);

        // Add to target layer data
        targetLayer.features.push(feature);
        layers.set(targetLayerId, targetLayer);
        this.layers = layers;

        // Remove from source map layer
        this.mapManager.removeFeature(sourceLayerId, featureId);

        // Add to target map layer
        this.mapManager.addFeaturesToLayer(targetLayerId, [feature], targetLayer.type, targetLayer.color);

        // Emit events
        eventBus.emit('feature.moved', {
            featureId,
            sourceLayerId,
            targetLayerId,
            feature
        });

        return true;
    }

    /**
     * Delete a layer
     * @param {string} layerId - Layer ID
     */
    deleteLayer(layerId) {
        const layers = this.layers;
        const layer = layers.get(layerId);
        if (!layer) return;

        // Remove from map
        this.mapManager.removeLayer(layerId);

        // Remove from storage
        layers.delete(layerId);
        this.layers = layers;

        this.activeFilters.delete(layerId);
        this.activeSorts.delete(layerId);

        // Remove from order
        const layerOrder = this.layerOrder;
        const index = layerOrder.indexOf(layerId);
        if (index > -1) {
            layerOrder.splice(index, 1);
            this.layerOrder = layerOrder;
        }

        // Emit event
        eventBus.emit('layer.deleted', { layerId, layerName: layer.name, layer });

        return layer;
    }

    /**
     * Clear all layers
     */
    clearAllLayers() {
        // Get all layer IDs
        const layerIds = Array.from(this.layers.keys());

        // Delete each layer
        layerIds.forEach(layerId => {
            this.mapManager.removeLayer(layerId);
        });

        // Clear all storage
        this.layers = new Map();
        this.layerOrder = [];
        this.activeFilters.clear();
        this.activeSorts.clear();

        // Emit event
        eventBus.emit('layers.cleared');

        console.log('All layers cleared');
    }

    /**
     * Get layer by ID
     * @param {string} layerId - Layer ID
     * @returns {Object} Layer data
     */
    getLayer(layerId) {
        return this.layers.get(layerId);
    }

    /**
     * Get all layers
     * @returns {Array} Array of all layers
     */
    getAllLayers() {
        // Return layers in the specified order
        return this.layerOrder
            .map(id => this.layers.get(id))
            .filter(layer => layer !== undefined);
    }

    /**
     * Move layer up or down in display order
     * @param {string} layerId - Layer ID
     * @param {string} direction - 'up' or 'down'
     */
    moveLayer(layerId, direction) {
        const layerOrder = this.layerOrder;
        const index = layerOrder.indexOf(layerId);
        if (index === -1) return;

        if (direction === 'up' && index > 0) {
            // Swap with previous
            [layerOrder[index - 1], layerOrder[index]] =
            [layerOrder[index], layerOrder[index - 1]];
            this.layerOrder = layerOrder;
            this.syncLayerZOrder();
            eventBus.emit('layer.reordered', { layerId, direction });
        } else if (direction === 'down' && index < layerOrder.length - 1) {
            // Swap with next
            [layerOrder[index], layerOrder[index + 1]] =
            [layerOrder[index + 1], layerOrder[index]];
            this.layerOrder = layerOrder;
            this.syncLayerZOrder();
            eventBus.emit('layer.reordered', { layerId, direction });
        }
    }

    /**
     * Sync map layer z-order with layerOrder array
     * Layers at the top of the list appear on top on the map
     */
    syncLayerZOrder() {
        // Reverse the order because maps typically render layers bottom-to-top
        // (last added layer appears on top)
        const reversedOrder = [...this.layerOrder].reverse();

        // Delegate ordering to the map manager so it can use the correct
        // Google Maps APIs (the old Azure Maps calls are no longer valid).
        this.mapManager.reorderLayers(reversedOrder);
    }

    /**
     * Set layer opacity
     * @param {string} layerId - Layer ID
     * @param {number} opacity - Opacity value (0-1)
     */
    setLayerOpacity(layerId, opacity) {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        layer.opacity = opacity;

        // Update map layers
        const mapLayers = this.mapManager.layers.get(layerId);
        if (mapLayers) {
            if (mapLayers.polygon) {
                mapLayers.polygon.setOptions({ fillOpacity: opacity * 0.5 });
            }
            if (mapLayers.line) {
                mapLayers.line.setOptions({ strokeOpacity: opacity });
            }
            if (mapLayers.symbol) {
                mapLayers.symbol.setOptions({ iconOptions: { opacity: opacity } });
            }
            if (mapLayers.bubble) {
                mapLayers.bubble.setOptions({ opacity: opacity });
            }
            if (mapLayers.individualBubble) {
                mapLayers.individualBubble.setOptions({ opacity: opacity });
            }
            if (mapLayers.clusterLabel) {
                mapLayers.clusterLabel.setOptions({ textOptions: { opacity: opacity } });
            }
        }

        eventBus.emit('layer.opacity.changed', { layerId, opacity });
    }

    /**
     * Update feature in a layer
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     * @param {Object} newProperties - Updated properties
     */
    updateFeature(layerId, featureId, newProperties) {
        const layers = this.layers;
        const layer = layers.get(layerId);
        if (!layer) return;

        // Find and update feature in layer data
        const featureIndex = layer.features.findIndex(f => f.id === featureId);
        if (featureIndex !== -1) {
            layer.features[featureIndex] = {
                ...layer.features[featureIndex],
                ...newProperties
            };

            layers.set(layerId, layer);
            this.layers = layers;

            // Update on map
            this.mapManager.updateFeatureProperties(layerId, featureId, newProperties);

            // Emit event
            eventBus.emit('feature.updated', { layerId, featureId, properties: newProperties });
        }
    }

    /**
     * Delete feature from a layer
     * @param {string} layerId - Layer ID
     * @param {string} featureId - Feature ID
     */
    deleteFeature(layerId, featureId) {
        const layers = this.layers;
        const layer = layers.get(layerId);
        if (!layer) return;

        // Remove from layer data
        layer.features = layer.features.filter(f => f.id !== featureId);
        layers.set(layerId, layer);
        this.layers = layers;

        // Remove from map
        this.mapManager.removeFeature(layerId, featureId);

        // Emit event
        eventBus.emit('feature.deleted', { layerId, featureId });
    }

    /**
     * Apply filter to a layer
     * @param {string} layerId - Layer ID
     * @param {string} column - Column to filter by
     * @param {string} value - Filter value
     */
    applyFilter(layerId, column, value) {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        // Store filter
        this.activeFilters.set(layerId, { column, value });

        // Get filtered features
        const filteredFeatures = layer.features.filter(feature => {
            const featureValue = String(feature[column] || '').toLowerCase();
            const filterValue = String(value).toLowerCase();
            return featureValue.includes(filterValue);
        });

        // Re-render layer with filtered features
        this.rerenderLayer(layerId, filteredFeatures);
    }

    /**
     * Clear filter from a layer
     * @param {string} layerId - Layer ID
     */
    clearFilter(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        // Remove filter
        this.activeFilters.delete(layerId);

        // Re-render layer with all features
        this.rerenderLayer(layerId, layer.features);
    }

    /**
     * Sort layer features
     * @param {string} layerId - Layer ID
     * @param {string} column - Column to sort by
     * @param {string} direction - Sort direction ('asc' or 'desc')
     */
    sortLayer(layerId, column, direction = 'asc') {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        // Store sort config
        this.activeSorts.set(layerId, { column, direction });

        // Sort features
        const sortedFeatures = [...layer.features].sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];

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

        // Update layer features order
        layer.features = sortedFeatures;
        const layers = this.layers;
        layers.set(layerId, layer);
        this.layers = layers;

        // Emit event
        eventBus.emit('layer.sorted', { layerId, column, direction });
    }

    /**
     * Re-render a layer with specific features
     * @param {string} layerId - Layer ID
     * @param {Array} features - Features to render
     */
    rerenderLayer(layerId, features) {
        const layer = this.layers.get(layerId);
        if (!layer) return;

        // Remove existing layer from map
        this.mapManager.removeLayer(layerId);

        // Create new data source with current visibility state
        this.mapManager.createDataSource(layerId, layer.type === 'point', layer.visible);

        // Add filtered features
        if (features.length > 0) {
            const color = this.mapManager.addFeaturesToLayer(layerId, features, layer.type, layer.color);
            layer.color = color;
        }

        // Restore visibility state
        this.mapManager.toggleLayerVisibility(layerId, layer.visible);
    }

    /**
     * Get all unique values for a column across all layers
     * @param {string} column - Column name
     * @returns {Array} Unique values
     */
    getUniqueColumnValues(column) {
        const values = new Set();

        for (let layer of this.layers.values()) {
            for (let feature of layer.features) {
                if (feature[column]) {
                    values.add(feature[column]);
                }
            }
        }

        return Array.from(values).sort();
    }

    /**
     * Get all column names across all layers
     * @returns {Array} Column names
     */
    getAllColumnNames() {
        const columns = new Set();

        for (let layer of this.layers.values()) {
            for (let feature of layer.features) {
                Object.keys(feature).forEach(key => {
                    // Skip certain properties
                    if (!['id', 'wkt', 'layerId'].includes(key)) {
                        columns.add(key);
                    }
                });
            }
        }

        return Array.from(columns).sort();
    }

    /**
     * Export layer data
     * @param {string} layerId - Layer ID
     * @returns {Object} Layer data
     */
    exportLayer(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return null;

        const exported = {
            id: layer.id,
            name: layer.name,
            type: layer.type,
            features: layer.features,
            visible: layer.visible,
            opacity: layer.opacity !== undefined ? layer.opacity : 1.0,
            color: layer.color,
            metadata: layer.metadata,
            createdAt: layer.createdAt
        };

        // Only add style properties if they exist (Firebase can't save undefined)
        if (layer.styleType !== undefined) {
            exported.styleType = layer.styleType;
        }
        if (layer.styleProperty !== undefined) {
            exported.styleProperty = layer.styleProperty;
        }
        if (layer.colorMap !== undefined) {
            exported.colorMap = layer.colorMap;
        }
        if (layer.showLabels !== undefined) {
            exported.showLabels = layer.showLabels;
        }

        return exported;
    }

    /**
     * Export all layers
     * @returns {Object} All layers data
     */
    exportAllLayers() {
        const data = {
            layers: {},
            layerOrder: this.layerOrder
        };

        for (let [layerId, layer] of this.layers) {
            data.layers[layerId] = this.exportLayer(layerId);
        }

        return data;
    }

    /**
     * Import layers from data
     * @param {Object} data - Layers data
     */
    importLayers(data) {
        // Clear existing layers
        for (let layerId of this.layers.keys()) {
            this.deleteLayer(layerId);
        }

        // Handle both old format (direct object) and new format (with layerOrder)
        const layersData = data.layers || data;
        const layerOrder = data.layerOrder || Object.keys(layersData);

        // Import each layer
        for (let [layerId, layerData] of Object.entries(layersData)) {
            // Skip special properties (timestamps, groups, etc.)
            if (layerId.startsWith('_')) {
                continue;
            }

            // Create layer object with preserved ID
            const layer = {
                id: layerId,  // Preserve original ID
                name: layerData.name,
                type: layerData.type,
                features: layerData.features || [],
                visible: layerData.visible !== undefined ? layerData.visible : true,
                opacity: layerData.opacity !== undefined ? layerData.opacity : 1.0,
                color: layerData.color || null,
                metadata: layerData.metadata || {},
                createdAt: layerData.createdAt || new Date().toISOString(),
                styleType: layerData.styleType,
                styleProperty: layerData.styleProperty,
                colorMap: layerData.colorMap,
                showLabels: layerData.showLabels || false
            };

            console.log(`📥 Importing layer: "${layer.name}" (${layerId}), visible=${layer.visible}, type=${layer.type}, features=${layer.features.length}, styleType=${layer.styleType || 'none'}`);

            // Store layer (don't add to layerOrder yet)
            this.layers.set(layerId, layer);

            // Add to map if there are features
            if (layer.features.length > 0) {
                // Check if this layer has property-based styling
                if (layer.styleType && layer.styleProperty && layer.colorMap) {
                    // Will be re-styled by app.js after import
                    // Pass layer.visible to prevent visual flash when loading hidden layers
                    const color = this.mapManager.addFeaturesToLayer(layerId, layer.features, layer.type, layer.color, layer.visible);
                    layer.color = color;
                } else {
                    // Normal styling
                    // Pass layer.visible to prevent visual flash when loading hidden layers
                    const color = this.mapManager.addFeaturesToLayer(layerId, layer.features, layer.type, layer.color, layer.visible);
                    layer.color = color;
                }

                // Set opacity on map
                if (layer.opacity !== undefined && layer.opacity !== 1.0) {
                    this.setLayerOpacity(layerId, layer.opacity);
                }
            } else {
                // Create empty data source with layer's visibility state
                this.mapManager.createDataSource(layerId, layer.type === 'point', layer.visible);
                layer.color = this.mapManager.getNextColor();

                // Add empty layer to mapManager.layers so it can be toggled and synced
                if (layer.type === 'polygon') {
                    this.mapManager.addPolygonLayer(layerId, layer.color, layer.visible);
                } else if (layer.type === 'point') {
                    this.mapManager.addPointLayer(layerId, layer.color, layer.visible);
                }
            }
        }

        // Restore layer order (exclude special properties)
        this.layerOrder = layerOrder.filter(id => !id.startsWith('_') && this.layers.has(id));

        // Sync the layer z-order on the map to match the restored order
        this.syncLayerZOrder();

        // Emit event
        eventBus.emit('layers.imported', { count: this.layers.size });
    }

    /**
     * Create a layer group
     * @param {string} name - Group name
     * @param {Object} metadata - Group metadata
     * @returns {string} Group ID
     */
    createLayerGroup(name, metadata = {}) {
        const groupId = Utils.generateId('group');

        const group = {
            id: groupId,
            name: name,
            layerIds: [],
            visible: true,
            expanded: true,
            metadata: metadata,
            createdAt: Utils.formatDate()
        };

        const layerGroups = this.layerGroups;
        layerGroups.set(groupId, group);
        this.layerGroups = layerGroups;

        eventBus.emit('group.created', { groupId, group });

        return groupId;
    }

    /**
     * Add layer to group
     * @param {string} layerId - Layer ID
     * @param {string} groupId - Group ID
     */
    addLayerToGroup(layerId, groupId) {
        const layers = this.layers;
        const layer = layers.get(layerId);
        if (!layer) return;

        const layerGroups = this.layerGroups;
        const group = layerGroups.get(groupId);
        if (!group) return;

        // Remove from previous group if exists
        if (layer.groupId) {
            this.removeLayerFromGroup(layerId);
        }

        // Add to new group
        layer.groupId = groupId;
        layers.set(layerId, layer);
        this.layers = layers;

        group.layerIds.push(layerId);
        layerGroups.set(groupId, group);
        this.layerGroups = layerGroups;

        eventBus.emit('layer.grouped', { layerId, groupId });
    }

    /**
     * Remove layer from group
     * @param {string} layerId - Layer ID
     */
    removeLayerFromGroup(layerId) {
        const layers = this.layers;
        const layer = layers.get(layerId);
        if (!layer || !layer.groupId) return;

        const layerGroups = this.layerGroups;
        const group = layerGroups.get(layer.groupId);
        if (group) {
            group.layerIds = group.layerIds.filter(id => id !== layerId);
            layerGroups.set(group.id, group);
            this.layerGroups = layerGroups;
        }

        layer.groupId = null;
        layers.set(layerId, layer);
        this.layers = layers;

        eventBus.emit('layer.ungrouped', { layerId });
    }

    /**
     * Delete layer group
     * @param {string} groupId - Group ID
     */
    deleteLayerGroup(groupId) {
        const layerGroups = this.layerGroups;
        const group = layerGroups.get(groupId);
        if (!group) return;

        // Ungroup all layers in this group
        group.layerIds.forEach(layerId => {
            this.removeLayerFromGroup(layerId);
        });

        layerGroups.delete(groupId);
        this.layerGroups = layerGroups;

        eventBus.emit('group.deleted', { groupId });
    }

    /**
     * Rename layer group
     * @param {string} groupId - Group ID
     * @param {string} newName - New group name
     */
    renameLayerGroup(groupId, newName) {
        const layerGroups = this.layerGroups;
        const group = layerGroups.get(groupId);
        if (!group) return;

        group.name = newName;
        layerGroups.set(groupId, group);
        this.layerGroups = layerGroups;

        eventBus.emit('group.renamed', { groupId, newName });
    }

    /**
     * Get layer group
     * @param {string} groupId - Group ID
     * @returns {Object} Group data
     */
    getLayerGroup(groupId) {
        return this.layerGroups.get(groupId);
    }

    /**
     * Get all layer groups
     * @returns {Array} Array of all groups
     */
    getAllLayerGroups() {
        return Array.from(this.layerGroups.values());
    }

    /**
     * Toggle group visibility
     * @param {string} groupId - Group ID
     */
    toggleGroupVisibility(groupId) {
        const layerGroups = this.layerGroups;
        const group = layerGroups.get(groupId);
        if (!group) return;

        group.visible = !group.visible;
        layerGroups.set(groupId, group);
        this.layerGroups = layerGroups;

        // Toggle all layers in group
        group.layerIds.forEach(layerId => {
            const layers = this.layers;
            const layer = layers.get(layerId);
            if (layer) {
                layer.visible = group.visible;
                layers.set(layerId, layer);
                this.layers = layers;
                this.mapManager.toggleLayerVisibility(layerId, layer.visible);
            }
        });

        eventBus.emit('group.visibility.changed', { groupId, visible: group.visible });
    }

    /**
     * Toggle group expansion
     * @param {string} groupId - Group ID
     */
    toggleGroupExpansion(groupId) {
        const layerGroups = this.layerGroups;
        const group = layerGroups.get(groupId);
        if (!group) return;

        group.expanded = !group.expanded;
        layerGroups.set(groupId, group);
        this.layerGroups = layerGroups;

        eventBus.emit('group.expanded', { groupId, expanded: group.expanded });
    }

    /**
     * Get layer statistics
     * @param {string} layerId - Layer ID
     * @returns {Object} Layer statistics
     */
    getLayerStats(layerId) {
        const layer = this.layers.get(layerId);
        if (!layer) return null;

        return {
            featureCount: layer.features.length,
            type: layer.type,
            visible: layer.visible,
            hasFilter: this.activeFilters.has(layerId),
            hasSort: this.activeSorts.has(layerId)
        };
    }

    /**
     * Notify that layers have been updated
     * Emits event to trigger UI refresh
     */
    notifyUpdate() {
        eventBus.emit('layers.updated', {
            layerCount: this.layers.size,
            groupCount: this.layerGroups.size
        });
    }
}
