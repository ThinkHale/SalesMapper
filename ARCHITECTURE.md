# SalesMapper Architecture Guide

## Overview

SalesMapper has been refactored into a modern, modular architecture that separates concerns, improves maintainability, and enables extensibility through plugins.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                      User Interface                          │
│                   (index.html + CSS)                         │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                   UI Components Layer                        │
│   Modal Manager │ Toast Manager │ Loading │ Context Menu    │
│                    Event Bus │ Form Manager                  │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                  Application Controller                      │
│                      (app.js - refactored)                   │
└─────────────────────────────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
┌────────▼────────┐ ┌──────▼────────┐ ┌──────▼────────┐
│  State Manager  │ │ Plugin Manager │ │ External API  │
│  (Centralized)  │ │  (Extensible)  │ │ (Integrations)│
└────────┬────────┘ └────────────────┘ └───────────────┘
         │
         ├─────────────────┬─────────────────┬────────────────┐
         │                 │                 │                │
┌────────▼────────┐ ┌─────▼──────┐ ┌────────▼──────┐ ┌──────▼──────┐
│  Layer Manager  │ │ Map Manager│ │ CSV Parser    │ │ Geocoding   │
│                 │ │  (Google)  │ │               │ │  Service    │
└─────────────────┘ └────────────┘ └───────────────┘ └─────────────┘
         │                 │                 │                │
         └─────────────────┴─────────────────┴────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────┐
│                      Data Services Layer                     │
│      Storage Service │ Firebase Service │ Sync Service       │
└─────────────────────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────┐
│                  Infrastructure & Utilities                  │
│     Configuration │ Utilities │ Validation Service           │
└─────────────────────────────────────────────────────────────┘
```

## Core Modules

### 1. Configuration (`config.js`)

**Purpose:** Centralized configuration for all application constants

**Contents:**
- API keys (Google Maps, Firebase)
- Map settings (center, zoom, controls)
- Color palettes
- Marker and polygon styles
- UI settings
- Feature display settings

**Benefits:**
- Single source of truth for configuration
- Easy to update settings without searching through code
- Environment-specific configs possible
- Frozen objects prevent accidental modifications

**Usage:**
```javascript
// Access configuration
const apiKey = AppConfig.googleMapsApiKey;
const colors = AppConfig.colors.primary;
const mapCenter = AppConfig.map.defaultCenter;
```

### 2. Utilities (`utils.js`)

**Purpose:** Shared helper functions used throughout the application

**Functions:**
- ID generation
- String manipulation (camelCase, safe IDs, truncate)
- Data operations (deep clone, group by, sort, filter)
- Validation (coordinates, email)
- File operations (download, format size)
- Date/time formatting
- Distance calculations
- Retry with exponential backoff

**Benefits:**
- Eliminates code duplication
- Consistent behavior across the app
- Well-tested utility functions
- Easy to extend with new utilities

**Usage:**
```javascript
// Generate unique ID
const id = Utils.generateId('feature');

// Calculate distance
const dist = Utils.calculateDistance(lat1, lng1, lat2, lng2);

// Deep clone object
const clone = Utils.deepClone(originalObject);
```

### 3. State Manager (`state-manager.js`)

**Purpose:** Centralized state management with observer pattern

**Features:**
- Single source of truth for application state
- Subscribe to state changes
- Auto-save to localStorage
- Export/import functionality
- Layer and group management

**Benefits:**
- Predictable state updates
- Easy debugging
- Reactive components
- Automatic persistence

**Usage:**
```javascript
// Get state
const layers = stateManager.get('layers');

// Set state
stateManager.set('activeLayer', layerId);

// Subscribe to changes
stateManager.subscribe('layers', (newValue, oldValue) => {
    console.log('Layers changed:', newValue);
});

// Save to localStorage
stateManager.saveToLocalStorage();
```

### 4. UI Components (`ui-components.js`)

**Purpose:** Reusable UI component managers

**Components:**
- **ModalManager:** Show/hide/manage modals
- **ToastManager:** Show toast notifications
- **LoadingManager:** Show/hide loading overlay
- **ContextMenuManager:** Manage context menus
- **EventBus:** Centralized event system
- **FormManager:** Form data operations

**Benefits:**
- Consistent UI behavior
- Centralized event handling
- Reusable across the application
- Easy to extend

**Usage:**
```javascript
// Show modal
modalManager.show('editFeatureModal');

// Show toast
toastManager.success('Feature saved!');

// Show loading
loadingManager.show('Processing...');

// Emit event
eventBus.emit('feature.selected', featureData);

// Listen to event
eventBus.on('layer.created', (data) => {
    console.log('Layer created:', data);
});
```

### 5. Validation Service (`validation-service.js`)

**Purpose:** Centralized validation logic for data integrity

**Features:**
- Built-in rules (coordinates, WKT, features, layers)
- Custom rule registration
- Batch validation
- CSV data validation
- Formatted error messages

**Benefits:**
- Consistent validation across the app
- Easy to add new validation rules
- Detailed error reporting
- Batch processing support

**Usage:**
```javascript
// Validate coordinates
const errors = validationService.validate('coordinates', {
    latitude: 40.7128,
    longitude: -74.0060
});

// Validate batch of features
const results = validationService.validateBatch('feature', features);

// Validate CSV data
const csvResults = validationService.validateCSVData(
    rows, columnMap, 'point'
);
```

### 6. Data Services (`data-services.js`)

**Purpose:** Abstraction layer for data persistence

**Services:**
- **StorageService:** localStorage operations with error handling
- **FirebaseService:** Firebase Realtime Database operations
- **DataSyncService:** Sync between localStorage and Firebase

**Benefits:**
- Abstracted storage operations
- Automatic fallback between storage types
- Error handling and recovery
- Easy to add new storage backends

**Usage:**
```javascript
// Save data
await dataSyncService.save('layers', layersData, true);

// Load data (prefers Firebase)
const data = await dataSyncService.load('layers', true);

// Sync to Firebase
await dataSyncService.syncToFirebase();

// Get sync status
const status = dataSyncService.getStatus();
```

### 7. Plugin Manager (`plugin-api.js`)

**Purpose:** Enable extensibility through plugins

**Features:**
- Plugin registration/unregistration
- Hook system for data transformation
- Custom API endpoints
- Event subscriptions
- Plugin enable/disable

**Benefits:**
- Extend functionality without modifying core code
- Isolated plugin execution
- Easy to add/remove features
- Community plugin support

**Usage:**
```javascript
// Register plugin
pluginManager.register(MyPlugin);

// Execute hook
const modifiedData = await pluginManager.executeHook(
    'before.feature.add',
    featureData
);

// Get all plugins
const plugins = pluginManager.getAllPlugins();
```

### 8. External API (`plugin-api.js`)

**Purpose:** Provide API for external integrations

**Features:**
- Add/update/delete locations
- Create/manage layers
- Webhook support
- Browser console access
- Power Automate integration

**Benefits:**
- Integration with automation tools
- Programmatic access
- Real-time updates via webhooks
- REST-like interface

**Usage:**
```javascript
// Add location from Power Automate
await SalesMapperAPI.addLocation({
    layerId: 'layer_123',
    name: 'Store Location',
    latitude: 40.7128,
    longitude: -74.0060
});

// Register webhook
SalesMapperAPI.registerWebhook(
    'location.added',
    'https://your-server.com/webhook'
);
```

## Data Flow

### Adding a Feature

```
User Action (Upload CSV)
         │
         ▼
    CSV Parser
         │
         ▼
Validation Service ──► Errors? ──► Show to User
         │
         ▼
   State Manager
         │
         ▼
   Layer Manager
         │
         ▼
    Map Manager ──► Render on Map
         │
         ▼
  Data Sync Service
         │
    ┌────┴────┐
    │         │
    ▼         ▼
localStorage  Firebase
```

### Plugin Interaction

```
User Action
     │
     ▼
EventBus.emit('feature.selected')
     │
     ├──► Plugin 1 listens ──► Custom logic
     ├──► Plugin 2 listens ──► Custom logic
     └──► Core App listens ──► Update UI
```

## File Structure

```
SalesMapper/
├── index.html                    # Main HTML
├── css/
│   └── styles.css               # Application styles
├── js/
│   ├── config.js                # Configuration
│   ├── utils.js                 # Utility functions
│   ├── state-manager.js         # State management
│   ├── ui-components.js         # UI managers
│   ├── validation-service.js    # Validation logic
│   ├── data-services.js         # Data persistence
│   ├── plugin-api.js            # Plugin & External API
│   ├── app.js                   # Main application
│   ├── map-manager.js           # Google Maps
│   ├── layer-manager.js         # Layer management
│   ├── csv-parser.js            # CSV parsing
│   ├── geocoding-service.js     # Geocoding
│   └── firebase-config.js       # Firebase setup
├── plugins/
│   └── example-plugin.js        # Example plugin
├── ARCHITECTURE.md              # This file
├── PLUGIN_DEVELOPMENT.md        # Plugin guide
├── EXTERNAL_API.md              # External API guide
└── README.md                    # Project readme
```

## Migration Guide

### Phase 1 ✅ (Completed)
- Created configuration module
- Created utilities module
- Created state manager
- Created UI components
- Existing app.js still works as-is

### Phase 2 ✅ (Completed)
- Created plugin system
- Created external API
- Created validation service
- Created data services layer
- Documentation created

### Phase 3 (Next Steps)
1. **Refactor app.js** into focused controllers:
   - UIController
   - DataController
   - MapController
   - LayerController

2. **Update index.html** to load new modules in correct order

3. **Integrate new modules** with existing code:
   - Replace direct localStorage calls with StorageService
   - Replace validation code with ValidationService
   - Use StateManager for all state operations
   - Use EventBus for component communication

4. **Test thoroughly** to ensure no features are lost

## Best Practices

### State Management
- Always use StateManager for state operations
- Subscribe to state changes instead of polling
- Keep state immutable

### Event Communication
- Use EventBus for loose coupling
- Name events descriptively (noun.verb format)
- Document custom events

### Plugin Development
- Follow the plugin template
- Use hooks for data transformation
- Emit events for plugin-to-plugin communication
- Clean up resources in destroy()

### Data Persistence
- Use DataSyncService for all storage operations
- Handle storage quota exceeded errors
- Implement fallback strategies

### Validation
- Validate early and often
- Use ValidationService for consistency
- Provide clear error messages
- Validate at boundaries (user input, API calls)

## Performance Considerations

1. **Lazy Loading:** Load modules only when needed
2. **Debouncing:** Debounce expensive operations (search, auto-save)
3. **Batch Operations:** Batch API calls and updates
4. **Caching:** Cache computed values
5. **Virtual Scrolling:** For large feature lists

## Security Considerations

1. **API Keys:** Move to environment variables for production
2. **Input Validation:** Validate all user input
3. **XSS Prevention:** Sanitize HTML before rendering
4. **CORS:** Configure CORS properly
5. **Authentication:** Add authentication for external API

## Testing Strategy

1. **Unit Tests:** Test individual modules (utils, validation)
2. **Integration Tests:** Test module interactions
3. **E2E Tests:** Test user workflows
4. **Plugin Tests:** Test plugin loading and execution
5. **Performance Tests:** Monitor render times and memory usage

## Future Enhancements

1. **TypeScript Migration:** Add type safety
2. **Service Workers:** Offline support
3. **Web Workers:** Background processing
4. **GraphQL API:** More efficient data fetching
5. **Real-time Collaboration:** Multi-user editing
6. **Mobile App:** React Native or Flutter
7. **Desktop App:** Electron wrapper
8. **Plugin Marketplace:** Community plugins

## Contributing

See CONTRIBUTING.md for development guidelines.

## License

MIT License - See LICENSE file for details
