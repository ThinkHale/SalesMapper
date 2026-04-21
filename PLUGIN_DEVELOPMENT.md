# Plugin Development Guide

## Overview

SalesMapper supports a powerful plugin system that allows you to extend functionality without modifying the core application code. Plugins can:

- React to events (map clicks, feature selections, data imports)
- Modify data as it flows through the application (hooks)
- Add new API endpoints
- Integrate with external services
- Extend the UI

## Plugin Structure

```javascript
const MyPlugin = {
    // Required fields
    id: 'my-plugin',                    // Unique identifier
    name: 'My Awesome Plugin',          // Display name

    // Optional fields
    version: '1.0.0',                   // Plugin version
    description: 'Does awesome things', // Description
    author: 'Your Name',                // Author name

    // Lifecycle methods
    init(api) {
        // Called when plugin is registered
        // Store the API reference
        this.api = api;
    },

    onEnable() {
        // Called when plugin is enabled
    },

    onDisable() {
        // Called when plugin is disabled
    },

    destroy() {
        // Called when plugin is unregistered
        // Clean up resources here
    },

    // Event hooks (optional)
    hooks: {
        'before.feature.add': async (feature) => {
            // Modify feature before it's added
            return feature;
        },
        'after.layer.create': async (layer) => {
            // React to layer creation
            return layer;
        }
    },

    // API endpoints (optional)
    api: {
        'myendpoint': async (params) => {
            // Custom endpoint logic
            return result;
        }
    }
};
```

## Plugin API Reference

### State Operations

```javascript
// Get state value
const value = api.getState('layers');

// Set state value
api.setState('myPluginData', { foo: 'bar' });

// Subscribe to state changes
const unsubscribe = api.subscribe('layers', (newValue, oldValue) => {
    console.log('Layers changed:', newValue);
});
```

### UI Operations

```javascript
// Show/hide modals
api.showModal('myModal');
api.closeModal('myModal');

// Show toast notifications
api.showToast('Success!', 'success');
api.showToast('Error occurred', 'error', 5000);

// Show/hide loading overlay
api.showLoading('Processing...');
api.hideLoading();
```

### Layer Operations

```javascript
// Create a layer
const layerId = api.createLayer('My Layer', [], 'point', {
    source: 'my-plugin'
});

// Get layer
const layer = api.getLayer(layerId);

// Get all layers
const layers = api.getAllLayers();

// Delete layer
api.deleteLayer(layerId);
```

### Feature Operations

```javascript
// Add features to layer
api.addFeaturesToLayer(layerId, [
    {
        id: 'feature1',
        name: 'Location 1',
        latitude: 40.7128,
        longitude: -74.0060
    }
]);

// Update feature
api.updateFeature(layerId, featureId, {
    name: 'Updated Name'
});

// Delete feature
api.deleteFeature(layerId, featureId);
```

### Map Operations

```javascript
// Get map instance
const map = api.getMap();

// Set map center
api.setCenter(40.7128, -74.0060, 12);

// Fit bounds
api.fitBounds(bounds);
```

### Event Operations

```javascript
// Listen to events
api.on('layer.created', (data) => {
    console.log('Layer created:', data);
});

// Listen once
api.once('feature.selected', (data) => {
    console.log('Feature selected:', data);
});

// Emit custom events
api.emit('myplugin.event', { data: 'value' });
```

### Hook Execution

```javascript
// Execute a hook (for plugin-to-plugin communication)
const modifiedData = await api.executeHook('before.export', data);
```

### Utility Functions

```javascript
// Access utility functions
const distance = api.utils.calculateDistance(lat1, lng1, lat2, lng2);
const id = api.utils.generateId('prefix');
const camelCase = api.utils.toCamelCase('some-string');
```

## Available Events

### Map Events
- `map.clicked` - Map was clicked
- `map.initialized` - Map finished initializing
- `map.bounds.changed` - Map bounds changed

### Layer Events
- `layer.created` - Layer was created
- `layer.updated` - Layer was updated
- `layer.deleted` - Layer was deleted
- `layer.visibility.changed` - Layer visibility changed

### Feature Events
- `feature.added` - Feature was added
- `feature.updated` - Feature was updated
- `feature.deleted` - Feature was deleted
- `feature.selected` - Feature was selected

### Data Events
- `data.imported` - Data was imported
- `data.exported` - Data was exported
- `data.saved` - Data was saved

### Plugin Events
- `plugin.registered` - Plugin was registered
- `plugin.unregistered` - Plugin was unregistered
- `plugin.enabled` - Plugin was enabled
- `plugin.disabled` - Plugin was disabled

## Available Hooks

Hooks allow you to modify data as it flows through the application:

- `before.feature.add` - Modify features before adding to layer
- `after.feature.add` - React to features being added
- `before.layer.create` - Modify layer data before creation
- `after.layer.create` - React to layer creation
- `before.export` - Modify data before export
- `after.import` - React to data import
- `before.save` - Modify data before saving
- `after.load` - React to data loading

## Registering Your Plugin

### Method 1: Auto-register (recommended)

Add this at the end of your plugin file:

```javascript
if (typeof pluginManager !== 'undefined') {
    pluginManager.register(MyPlugin);
}
```

### Method 2: Manual registration

```javascript
// In your app initialization code
pluginManager.register(MyPlugin);
```

### Method 3: Load from URL

```javascript
// Load plugin from external URL
const script = document.createElement('script');
script.src = 'https://example.com/my-plugin.js';
document.head.appendChild(script);
```

## Managing Plugins

```javascript
// Get all plugins
const plugins = pluginManager.getAllPlugins();

// Get specific plugin
const plugin = pluginManager.getPlugin('my-plugin');

// Enable/disable plugin
pluginManager.enable('my-plugin');
pluginManager.disable('my-plugin');

// Unregister plugin
pluginManager.unregister('my-plugin');

// Get statistics
const stats = pluginManager.getStatistics();
```

## Example Plugins

### 1. Export to Excel Plugin

```javascript
const ExcelExportPlugin = {
    id: 'excel-export',
    name: 'Excel Export',
    version: '1.0.0',

    init(api) {
        this.api = api;

        // Add export button
        this.addExportButton();
    },

    addExportButton() {
        // Add button to UI
        const button = document.createElement('button');
        button.textContent = 'Export to Excel';
        button.onclick = () => this.export();
        document.querySelector('.header-actions').appendChild(button);
    },

    async export() {
        const layers = this.api.getAllLayers();
        // Convert to Excel format and download
        // (use a library like xlsx)
    }
};
```

### 2. Real-time Sync Plugin

```javascript
const RealtimeSyncPlugin = {
    id: 'realtime-sync',
    name: 'Real-time Sync',
    version: '1.0.0',

    init(api) {
        this.api = api;

        // Listen to all changes
        api.on('*', (data) => {
            this.syncToServer(data);
        });
    },

    async syncToServer(data) {
        // Send changes to your server
        await fetch('https://your-server.com/sync', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
};
```

### 3. Address Autocomplete Plugin

```javascript
const AutocompletePlugin = {
    id: 'address-autocomplete',
    name: 'Address Autocomplete',
    version: '1.0.0',

    init(api) {
        this.api = api;

        // Enhance search input with autocomplete
        this.setupAutocomplete();
    },

    setupAutocomplete() {
        const searchInput = document.getElementById('addressSearch');
        // Add autocomplete functionality
        // (use Google Places Autocomplete or similar)
    }
};
```

## Best Practices

1. **Unique IDs**: Use unique, descriptive IDs for your plugins
2. **Error Handling**: Always wrap async operations in try-catch
3. **Clean Up**: Implement the `destroy()` method to clean up resources
4. **Events**: Use events for loose coupling between plugins
5. **Hooks**: Use hooks to modify data without breaking other plugins
6. **Documentation**: Document your plugin's configuration options
7. **Testing**: Test your plugin with different data sets
8. **Performance**: Be mindful of performance impact
9. **Dependencies**: Minimize external dependencies
10. **Versioning**: Use semantic versioning for your plugins

## Publishing Plugins

To share your plugin with others:

1. **GitHub**: Host your plugin on GitHub
2. **npm**: Publish to npm for easy installation
3. **CDN**: Host on a CDN for direct loading
4. **Plugin Registry**: Submit to the SalesMapper plugin registry (coming soon)

## Support

For plugin development support:
- GitHub Issues: https://github.com/your-org/SalesMapper/issues
- Documentation: https://salesmapper-docs.example.com
- Community Forum: https://community.salesmapper.com

## License

Plugins can use any license, but we recommend MIT or Apache 2.0 for maximum compatibility.
