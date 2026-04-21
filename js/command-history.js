/**
 * Command History Manager
 * Implements undo/redo functionality using the Command pattern
 * Part of SalesMapper v3.0
 */

class CommandHistory {
    constructor(maxHistory = 50) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = maxHistory;
        this.isExecuting = false; // Prevent infinite loops
    }

    /**
     * Execute a command and add it to history
     * @param {Command} command - Command to execute
     */
    execute(command) {
        if (this.isExecuting) return;

        this.isExecuting = true;
        try {
            command.execute();
            this.undoStack.push(command);

            // Clear redo stack when new command is executed
            this.redoStack = [];

            // Limit history size
            if (this.undoStack.length > this.maxHistory) {
                this.undoStack.shift();
            }

            this.notifyChange();
        } finally {
            this.isExecuting = false;
        }
    }

    /**
     * Undo the last command
     * @returns {boolean} True if undo was successful
     */
    undo() {
        if (!this.canUndo() || this.isExecuting) return false;

        this.isExecuting = true;
        try {
            const command = this.undoStack.pop();
            command.undo();
            this.redoStack.push(command);
            this.notifyChange();
            return true;
        } finally {
            this.isExecuting = false;
        }
    }

    /**
     * Redo the last undone command
     * @returns {boolean} True if redo was successful
     */
    redo() {
        if (!this.canRedo() || this.isExecuting) return false;

        this.isExecuting = true;
        try {
            const command = this.redoStack.pop();
            command.execute();
            this.undoStack.push(command);
            this.notifyChange();
            return true;
        } finally {
            this.isExecuting = false;
        }
    }

    /**
     * Check if undo is available
     * @returns {boolean}
     */
    canUndo() {
        return this.undoStack.length > 0;
    }

    /**
     * Check if redo is available
     * @returns {boolean}
     */
    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Get description of command that will be undone
     * @returns {string}
     */
    getUndoDescription() {
        if (!this.canUndo()) return '';
        return this.undoStack[this.undoStack.length - 1].description;
    }

    /**
     * Get description of command that will be redone
     * @returns {string}
     */
    getRedoDescription() {
        if (!this.canRedo()) return '';
        return this.redoStack[this.redoStack.length - 1].description;
    }

    /**
     * Clear all history
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this.notifyChange();
    }

    /**
     * Get history stats
     * @returns {Object}
     */
    getStats() {
        return {
            undoCount: this.undoStack.length,
            redoCount: this.redoStack.length,
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        };
    }

    /**
     * Notify subscribers of history change
     */
    notifyChange() {
        if (window.eventBus) {
            eventBus.emit('history.changed', this.getStats());
        }
    }
}

// ============================================================================
// Command Implementations
// ============================================================================

/**
 * Base Command class
 */
class Command {
    constructor(description) {
        this.description = description;
        this.timestamp = new Date();
    }

    execute() {
        throw new Error('Command.execute() must be implemented');
    }

    undo() {
        throw new Error('Command.undo() must be implemented');
    }
}

/**
 * Create Layer Command
 */
class CreateLayerCommand extends Command {
    constructor(layerManager, layerName, features, layerType, metadata) {
        super(`Create layer "${layerName}"`);
        this.layerManager = layerManager;
        this.layerName = layerName;
        this.features = features;
        this.layerType = layerType;
        this.metadata = metadata;
        this.layerId = null;
    }

    execute() {
        this.layerId = this.layerManager.createLayer(
            this.layerName,
            this.features,
            this.layerType,
            this.metadata
        );
    }

    undo() {
        if (this.layerId) {
            this.layerManager.deleteLayer(this.layerId);
        }
    }
}

/**
 * Delete Layer Command
 */
class DeleteLayerCommand extends Command {
    constructor(layerManager, layerId) {
        super(`Delete layer`);
        this.layerManager = layerManager;
        this.layerId = layerId;
        this.layerData = null;
        this.groupId = null;
    }

    execute() {
        // Store layer data before deletion
        const layer = this.layerManager.getLayer(this.layerId);
        if (layer) {
            this.layerData = JSON.parse(JSON.stringify(layer));
            this.groupId = layer.groupId;
            this.description = `Delete layer "${layer.name}"`;
        }
        this.layerManager.deleteLayer(this.layerId);
    }

    undo() {
        if (this.layerData) {
            // Recreate the layer with same ID
            this.layerManager.layers.set(this.layerId, this.layerData);

            // Re-add to map
            if (window.mapManager) {
                this.layerData.features.forEach(feature => {
                    if (this.layerData.type === 'point') {
                        mapManager.addMarker(this.layerId, feature);
                    } else if (this.layerData.type === 'polygon') {
                        mapManager.addPolygon(this.layerId, feature);
                    }
                });
            }

            // Re-add to group
            if (this.groupId && this.layerManager.layerGroups.has(this.groupId)) {
                const group = this.layerManager.layerGroups.get(this.groupId);
                if (!group.layerIds.includes(this.layerId)) {
                    group.layerIds.push(this.layerId);
                    this.layerManager.layerGroups.set(this.groupId, group);
                }
            }

            eventBus.emit('layer.restored', { layerId: this.layerId });
        }
    }
}

/**
 * Rename Layer Command
 */
class RenameLayerCommand extends Command {
    constructor(layerManager, layerId, newName) {
        super(`Rename layer`);
        this.layerManager = layerManager;
        this.layerId = layerId;
        this.newName = newName;
        this.oldName = null;
    }

    execute() {
        const layer = this.layerManager.getLayer(this.layerId);
        if (layer) {
            this.oldName = layer.name;
            this.description = `Rename layer "${this.oldName}" to "${this.newName}"`;
            this.layerManager.renameLayer(this.layerId, this.newName);
        }
    }

    undo() {
        if (this.oldName) {
            this.layerManager.renameLayer(this.layerId, this.oldName);
        }
    }
}

/**
 * Add Feature Command
 */
class AddFeatureCommand extends Command {
    constructor(layerManager, layerId, feature) {
        super(`Add feature to layer`);
        this.layerManager = layerManager;
        this.layerId = layerId;
        this.feature = feature;
    }

    execute() {
        const layer = this.layerManager.getLayer(this.layerId);
        if (layer) {
            this.description = `Add feature to "${layer.name}"`;
            this.layerManager.addFeature(this.layerId, this.feature);
        }
    }

    undo() {
        this.layerManager.removeFeature(this.layerId, this.feature.id);
    }
}

/**
 * Delete Feature Command
 */
class DeleteFeatureCommand extends Command {
    constructor(layerManager, layerId, featureId) {
        super(`Delete feature`);
        this.layerManager = layerManager;
        this.layerId = layerId;
        this.featureId = featureId;
        this.featureData = null;
        this.featureIndex = null;
    }

    execute() {
        const layer = this.layerManager.getLayer(this.layerId);
        if (layer) {
            this.description = `Delete feature from "${layer.name}"`;
            const featureIndex = layer.features.findIndex(f => f.id === this.featureId);
            if (featureIndex !== -1) {
                this.featureData = JSON.parse(JSON.stringify(layer.features[featureIndex]));
                this.featureIndex = featureIndex;
            }
        }
        this.layerManager.removeFeature(this.layerId, this.featureId);
    }

    undo() {
        if (this.featureData) {
            const layer = this.layerManager.getLayer(this.layerId);
            if (layer) {
                // Insert at original position
                layer.features.splice(this.featureIndex, 0, this.featureData);

                // Re-add to map
                if (window.mapManager) {
                    if (layer.type === 'point') {
                        mapManager.addMarker(this.layerId, this.featureData);
                    } else if (layer.type === 'polygon') {
                        mapManager.addPolygon(this.layerId, this.featureData);
                    }
                }

                eventBus.emit('feature.restored', {
                    layerId: this.layerId,
                    featureId: this.featureId
                });
            }
        }
    }
}

/**
 * Update Feature Command
 */
class UpdateFeatureCommand extends Command {
    constructor(layerManager, layerId, featureId, newProperties) {
        super(`Update feature`);
        this.layerManager = layerManager;
        this.layerId = layerId;
        this.featureId = featureId;
        this.newProperties = newProperties;
        this.oldProperties = null;
    }

    execute() {
        const layer = this.layerManager.getLayer(this.layerId);
        if (layer) {
            const feature = layer.features.find(f => f.id === this.featureId);
            if (feature) {
                this.oldProperties = JSON.parse(JSON.stringify(feature.properties));
                this.description = `Update feature in "${layer.name}"`;
                this.layerManager.updateFeature(this.layerId, this.featureId, this.newProperties);
            }
        }
    }

    undo() {
        if (this.oldProperties) {
            this.layerManager.updateFeature(this.layerId, this.featureId, this.oldProperties);
        }
    }
}

/**
 * Create Layer Group Command
 */
class CreateGroupCommand extends Command {
    constructor(layerManager, groupName, metadata = {}) {
        super(`Create group "${groupName}"`);
        this.layerManager = layerManager;
        this.groupName = groupName;
        this.metadata = metadata;
        this.groupId = null;
    }

    execute() {
        this.groupId = this.layerManager.createLayerGroup(this.groupName, this.metadata);
    }

    undo() {
        if (this.groupId) {
            this.layerManager.deleteLayerGroup(this.groupId);
        }
    }
}

/**
 * Delete Layer Group Command
 */
class DeleteGroupCommand extends Command {
    constructor(layerManager, groupId) {
        super(`Delete group`);
        this.layerManager = layerManager;
        this.groupId = groupId;
        this.groupData = null;
    }

    execute() {
        const group = this.layerManager.getLayerGroup(this.groupId);
        if (group) {
            this.groupData = JSON.parse(JSON.stringify(group));
            this.description = `Delete group "${group.name}"`;
        }
        this.layerManager.deleteLayerGroup(this.groupId);
    }

    undo() {
        if (this.groupData) {
            this.layerManager.layerGroups.set(this.groupId, this.groupData);
            eventBus.emit('group.restored', { groupId: this.groupId });
        }
    }
}

/**
 * Rename Layer Group Command
 */
class RenameGroupCommand extends Command {
    constructor(layerManager, groupId, newName) {
        super(`Rename group`);
        this.layerManager = layerManager;
        this.groupId = groupId;
        this.newName = newName;
        this.oldName = null;
    }

    execute() {
        const group = this.layerManager.getLayerGroup(this.groupId);
        if (group) {
            this.oldName = group.name;
            this.description = `Rename group "${this.oldName}" to "${this.newName}"`;
            this.layerManager.renameLayerGroup(this.groupId, this.newName);
        }
    }

    undo() {
        if (this.oldName) {
            this.layerManager.renameLayerGroup(this.groupId, this.oldName);
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CommandHistory,
        Command,
        CreateLayerCommand,
        DeleteLayerCommand,
        RenameLayerCommand,
        AddFeatureCommand,
        DeleteFeatureCommand,
        UpdateFeatureCommand,
        CreateGroupCommand,
        DeleteGroupCommand,
        RenameGroupCommand
    };
}
