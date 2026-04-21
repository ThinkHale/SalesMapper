/**
 * Main Application - Refactored with Modular Architecture
 * Coordinates all components using StateManager, EventBus, and data services
 */

// Global manager instances (initialized in initializeApp)
let mapManager;
let layerManager;
let csvParser;
let geocodingService;
let commandHistory; // v3.0: Undo/Redo functionality
let analyticsPanel; // v3.0: Analytics dashboard
let distanceTool; // v3.0: Distance measurement
let activityLog; // v3.0 Phase 3: Activity tracking
let notificationCenter; // v3.0 Phase 3: Notification system

// Global state for UI interactions
let currentLayerForActions = null;  // Currently selected layer for context menu actions
let currentCSVData = null;          // Currently loaded CSV data for import workflow
let realtimeListenerEnabled = false; // Supabase real-time sync status
// allLayersGroupId is stored in stateManager.get('allLayersGroupId')

// Data services are initialized in initDataServices()
// Access via: storageService, firebaseService, dataSyncService

/**
 * Initialize data services
 */
function initDataServices() {
    storageService = new StorageService(AppConfig.storage.localStorageKey);
    console.log('Data services initialized');
}

/**
 * Save current state.
 * NOTE: In Supabase-only mode, this is a thin wrapper around autoSaveToSupabase.
 * Layer data is only saved to Supabase. Auto-save handles real-time sync.
 */
function saveToLocalStorage() {
    autoSaveToSupabase();
}

/**
 * Simple hash function for state comparison
 */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
}

/**
 * Auto-save to Firebase (for real-time collaboration)
 * Debounced to prevent excessive saves during rapid changes
 */
let autoSaveTimeout = null;
let isSavingToFirebase = false; // alias kept so internal checks don't need renaming
let isImporting = false; // Prevents auto-save during Supabase imports
let lastSaveHash = null; // Hash of last saved state for echo detection
let lastProfileLoadTimestamp = null; // Timestamp of last profile load to ignore stale updates

async function autoSaveToSupabase() {
    // Skip if this workspace is read-only
    if (isReadOnly()) return;

    // Clear any pending auto-save
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }

    // Debounce: wait 500ms after last change before saving
    autoSaveTimeout = setTimeout(async () => {
        const currentProfile = stateManager.getCurrentProfile();

        // Don't auto-save if we're currently importing or already saving
        if (!currentProfile || isSavingToFirebase || isImporting) {
            console.log('⏭️  Skipping auto-save (isImporting:', isImporting, 'isSaving:', isSavingToFirebase, ')');
            return;
        }

        console.log('🔄 Auto-saving to Supabase...');
        isSavingToFirebase = true;

        // Set timestamp to ignore our own echo
        lastSaveHash = Date.now().toString();

        // Temporarily disable listener to prevent feedback loop
        const wasListening = realtimeListenerEnabled;
        if (wasListening) {
            firebaseManager.stopListening();
            realtimeListenerEnabled = false;
        }

        try {
            const layersData = layerManager.exportAllLayers();
            const groupsData = Array.from(layerManager.layerGroups.values());

            const dataToSave = {
                ...layersData,
                _groups: groupsData,
                _timestamp: lastSaveHash // Include timestamp for echo detection
            };

            await firebaseManager.saveAllLayers(dataToSave, currentProfile.name);

            console.log('✅ Auto-save successful at', lastSaveHash);

            // Re-enable listener after save completes
            if (wasListening) {
                setTimeout(() => {
                    enableRealtimeSync();
                }, 3000); // 3 second delay for Supabase to propagate
            }
        } catch (error) {
            console.error('❌ Auto-save error:', error);
        } finally {
            isSavingToFirebase = false;
        }
    }, 500); // 500ms debounce
}

// Alias kept for any internal callers that use the old name
const autoSaveToFirebase = autoSaveToSupabase;

/**
 * Returns true if the current workspace is read-only for this user (viewer role).
 */
function isReadOnly() {
    const profile = stateManager.getCurrentProfile();
    return profile && profile.role === 'viewer';
}

/**
 * Disable or enable editing controls based on read-only status.
 * @param {boolean} readOnly
 */
function _applyReadOnlyUI(readOnly) {
    const uploadBtn = document.getElementById('uploadBtn');
    const drawControls = document.querySelector('.draw-controls');
    const readOnlyBanner = document.getElementById('readOnlyBanner');

    if (uploadBtn) uploadBtn.disabled = readOnly;
    if (drawControls) drawControls.style.opacity = readOnly ? '0.4' : '1';
    if (drawControls) drawControls.style.pointerEvents = readOnly ? 'none' : '';

    // Show/hide a read-only banner (if it exists in the DOM)
    if (readOnlyBanner) readOnlyBanner.style.display = readOnly ? 'block' : 'none';
}

/**
 * Load state from localStorage
 * @returns {boolean} True if data was loaded, false otherwise
 */
function loadFromLocalStorage() {
    try {
        // Load from StateManager
        const loaded = stateManager.loadFromLocalStorage();

        if (!loaded) {
            console.log('No saved state found in localStorage');
            return false;
        }

        // Get restored data from StateManager
        const layers = stateManager.get('layers');
        const layerGroups = stateManager.get('layerGroups');

        // Restore layers if they exist
        if (layers && layers.size > 0) {
            const layersData = {
                layers: Object.fromEntries(layers),
                layerOrder: stateManager.get('layerOrder') || []
            };
            layerManager.importLayers(layersData);

            // Re-apply property-based styling for layers that have it
            layerManager.getAllLayers().forEach(layer => {
                if (layer.styleType && layer.styleProperty) {
                    applyPropertyBasedStyle(layer.id, layer.styleProperty, layer.styleType);
                }
                // Re-apply labels if they were enabled
                if (layer.type === 'polygon' && layer.showLabels) {
                    mapManager.togglePolygonLabels(layer.id, true, layer.features);
                }
            });

            console.log('State loaded successfully from localStorage');
            toastManager.success('Previous session restored');
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error loading from localStorage:', error);
        toastManager.error('Failed to load previous session');
        return false;
    }
}

/**
 * Initialize the application
 */
async function initializeApp() {
    loadingManager.show('Initializing application...');

    try {
        // Initialize data services first
        initDataServices();

        // Initialize StateManager and setup auto-save
        stateManager.setupAutoSave();

        // Initialize components with AppConfig
        mapManager = new MapManager('googleMap');
        await mapManager.initialize();

        layerManager = new LayerManager(mapManager);
        csvParser = new CSVParser();
        geocodingService = new GeocodingService();

        // v3.0: Initialize command history for undo/redo
        commandHistory = new CommandHistory(50); // 50-step history
        console.log('Command history initialized (v3.0)');

        // v3.0: Initialize analytics panel
        analyticsPanel = new AnalyticsPanel(layerManager, stateManager);
        analyticsPanel.initialize();
        console.log('Analytics Panel initialized (v3.0)');

        // v3.0: Initialize distance measurement tool
        distanceTool = new DistanceTool(mapManager);
        console.log('Distance Tool initialized (v3.0)');

        // v3.0 Phase 3: Initialize activity log
        activityLog = new ActivityLog(stateManager);
        activityLog.initialize();
        console.log('Activity Log initialized (v3.0 Phase 3)');

        // v3.0 Phase 3: Initialize notification center
        notificationCenter = new NotificationCenter();
        notificationCenter.initialize();
        console.log('Notification Center initialized (v3.0 Phase 3)');

        // Setup map callbacks for feature selection and drawing
        setupMapCallbacks();

        // Store managers in StateManager for access
        stateManager.set('mapManager', mapManager, true);
        stateManager.set('layerManager', layerManager, true);
        stateManager.set('commandHistory', commandHistory, true);

        // Initialize plugin system
        initializePluginSystem();

        // Setup event listeners (DOM events)
        setupEventListeners();

        // Setup EventBus subscriptions (replaces old callbacks)
        setupEventBusSubscriptions();

        // Initialize undo/redo button states
        updateHistoryButtons();

        // Setup map click handler for clearing selection
        setupMapClickHandler();

        // Initialize profiles and load data (this handles migration, profile selection, and data loading)
        await initializeProfiles();

        // Setup real-time Firebase listener after profile is set
        enableRealtimeSync();

        // Initialize UI after state is ready
        updateLayerGroupList();
        updateLayerList(layerManager.getAllLayers());

        console.log('Application initialized successfully');
        loadingManager.hide();

        toastManager.success('Application ready! Upload a CSV to get started.');
    } catch (error) {
        console.error('Error initializing application:', error);
        loadingManager.hide();
        toastManager.error('Error initializing application: ' + error.message);
    }
}

/**
 * Initialize plugin system
 */
function initializePluginSystem() {
    try {
        // Register the example plugin if it exists
        if (typeof NearbySearchPlugin !== 'undefined') {
            pluginManager.register(NearbySearchPlugin);
            console.log('Example plugin registered');
        }

        // Register the heatmap plugin if it exists
        if (typeof HeatmapOverlayPlugin !== 'undefined') {
            pluginManager.register(HeatmapOverlayPlugin);
            console.log('Heatmap plugin registered');
        }

        // Restore saved plugin enabled/disabled states
        restorePluginStates();

        // External API is already initialized in plugin-api.js
        // and available via window.SalesMapperAPI
        console.log('External API available via window.SalesMapperAPI');
    } catch (error) {
        console.error('Error initializing plugin system:', error);
    }
}

/**
 * Setup EventBus subscriptions (replaces old callback pattern)
 */
function setupEventBusSubscriptions() {
    // v3.0: History events (undo/redo)
    eventBus.on('history.changed', (stats) => {
        updateHistoryButtons();
    });

    // Layer events
    eventBus.on('layer.created', ({ layerId, layer }) => {
        console.log('Layer created:', layerId);
        updateLayerList(layerManager.getAllLayers());
        updateLayerGroupList();
    });

    eventBus.on('layer.deleted', ({ layerId }) => {
        console.log('Layer deleted:', layerId);
        updateLayerList(layerManager.getAllLayers());
        updateLayerGroupList();
    });

    eventBus.on('layer.visibility.changed', ({ layerId, visible }) => {
        console.log('Layer visibility changed:', layerId, visible);
        updateLayerList(layerManager.getAllLayers());
    });

    eventBus.on('features.added', ({ layerId, count }) => {
        console.log('Features added to layer:', layerId, count);
        updateLayerList(layerManager.getAllLayers());
    });

    // Layer reordering event
    eventBus.on('layer.reordered', ({ layerId, direction }) => {
        console.log('Layer reordered:', layerId, direction);
        updateLayerList(layerManager.getAllLayers());
    });

    // Layer renamed event
    eventBus.on('layer.renamed', ({ layerId, oldName, newName }) => {
        console.log('Layer renamed:', oldName, '->', newName);
        updateLayerList(layerManager.getAllLayers());
        updateLayerGroupList();
    });

    // Feature moved event
    eventBus.on('feature.moved', ({ featureId, sourceLayerId, targetLayerId }) => {
        console.log('Feature moved:', featureId, 'from', sourceLayerId, 'to', targetLayerId);
        updateLayerList(layerManager.getAllLayers());
    });

    // Feature events
    eventBus.on('feature.updated', ({ layerId, featureId }) => {
        console.log('Feature updated:', featureId);
        // Refresh feature info if it's the currently selected feature
        const currentFeature = stateManager.get('currentEditingFeature');
        if (currentFeature && currentFeature.id === featureId) {
            const layer = layerManager.getLayer(layerId);
            const feature = layer?.features.find(f => f.id === featureId);
            if (feature) {
                updateFeatureInfo(feature);
            }
        }
    });

    eventBus.on('feature.deleted', ({ layerId, featureId }) => {
        console.log('Feature deleted:', featureId);
        // Clear feature info if it was the currently selected feature
        const currentFeature = stateManager.get('currentEditingFeature');
        if (currentFeature && currentFeature.id === featureId) {
            stateManager.set('currentEditingFeature', null);
            document.getElementById('featureInfo').innerHTML =
                '<p class="empty-state">Click on a feature to see details</p>';
        }
    });

    // Layer group events
    eventBus.on('group.created', ({ groupId, group }) => {
        console.log('Layer group created:', groupId);
        updateLayerGroupList();
    });

    eventBus.on('group.deleted', ({ groupId }) => {
        console.log('Layer group deleted:', groupId);
        updateLayerGroupList();
    });

    // Layer-group membership events
    eventBus.on('layer.grouped', ({ layerId, groupId }) => {
        console.log('Layer added to group:', layerId, groupId);
        updateLayerGroupList();
        updateLayerList(layerManager.getAllLayers());
    });

    eventBus.on('layer.ungrouped', ({ layerId }) => {
        console.log('Layer removed from group:', layerId);
        updateLayerGroupList();
        updateLayerList(layerManager.getAllLayers());
    });

    eventBus.on('group.visibility.changed', ({ groupId, visible }) => {
        console.log('Group visibility changed:', groupId, visible);
        updateLayerList(layerManager.getAllLayers());
    });

    // Layer update notification event
    eventBus.on('layers.updated', ({ layerCount, groupCount }) => {
        console.log('Layers updated:', layerCount, 'layers,', groupCount, 'groups');
        updateLayerList(layerManager.getAllLayers());
        updateLayerGroupList();
    });

    // Layers imported event (from localStorage or file)
    eventBus.on('layers.imported', ({ count }) => {
        console.log('Layers imported:', count);
        updateLayerList(layerManager.getAllLayers());
        updateLayerGroupList();
    });

    // Map events
    eventBus.on('map.initialized', ({ center, zoom }) => {
        console.log('Map initialized at:', center, zoom);
    });

    eventBus.on('feature.selected', (feature) => {
        handleFeatureSelection(feature);
    });

    console.log('EventBus subscriptions setup complete');
}

/**
 * Setup map callbacks for feature selection and drawing completion
 */
function setupMapCallbacks() {
    // Handle feature click (when user clicks on a marker or polygon)
    mapManager.setOnFeatureClick((selectedFeature) => {
        console.log('Feature clicked:', selectedFeature);

        // Store the selected feature in state
        stateManager.set('currentEditingFeature', selectedFeature);

        // Update the feature info panel
        if (selectedFeature && selectedFeature.properties) {
            updateFeatureInfo(selectedFeature.properties);
        }

        // Emit event for any listeners
        eventBus.emit('feature.selected', selectedFeature);
    });

    // Handle drawing completion (when user finishes drawing a shape)
    mapManager.setOnDrawComplete((drawnShape) => {
        console.log('Drawing completed:', drawnShape);
        handleDrawingComplete(drawnShape);
    });

    console.log('Map callbacks setup complete');
}

/**
 * Setup map click handler to clear selection
 */
function setupMapClickHandler() {
    google.maps.event.addListener(mapManager.map, 'click', (e) => {
        // Don't clear selection if in drawing mode
        if (mapManager.drawingMode) {
            return;
        }

        // For Google Maps, we clear selection on map click
        // Feature clicks are handled separately in the data layer
        mapManager.clearSelectedFeature();
        stateManager.set('currentEditingFeature', null);

        // Reset feature info panel
        document.getElementById('featureInfo').innerHTML =
            '<p class="empty-state">Click on a feature to see details</p>';
    });
}

/**
 * Setup event listeners (DOM events only, EventBus subscriptions are in setupEventBusSubscriptions)
 */
function setupEventListeners() {
    // v3.0: Undo/Redo Buttons
    document.getElementById('undoBtn').addEventListener('click', handleUndo);
    document.getElementById('redoBtn').addEventListener('click', handleRedo);

    // v3.0: Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+Z / Cmd+Z: Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            handleUndo();
        }
        // Ctrl+Y / Cmd+Shift+Z: Redo
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            handleRedo();
        }
    });

    // Quick Action Buttons
    document.getElementById('showUploadBtn').addEventListener('click', () => modalManager.show('uploadModal'));

    // Dropdown Menu Toggle Functionality
    const menuButtons = {
        'toolsMenuBtn': 'toolsMenu',
        'pluginsMenuBtn': 'pluginsMenu',
        'settingsMenuBtn': 'settingsMenu'
    };

    // Function to close all menus
    function closeAllMenus() {
        Object.values(menuButtons).forEach(menuId => {
            const menu = document.getElementById(menuId);
            if (menu) menu.style.display = 'none';
        });
    }

    // Setup menu button click handlers
    Object.entries(menuButtons).forEach(([btnId, menuId]) => {
        const btn = document.getElementById(btnId);
        const menu = document.getElementById(menuId);

        if (btn && menu) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isCurrentlyOpen = menu.style.display === 'block';
                closeAllMenus();
                menu.style.display = isCurrentlyOpen ? 'none' : 'block';
            });
        }
    });

    // Close menus when clicking outside
    document.addEventListener('click', () => {
        closeAllMenus();
    });

    // Prevent menu clicks from closing the menu
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });

    // Menu Item Handlers - Tools Menu
    document.getElementById('showSearchBtn').addEventListener('click', () => {
        modalManager.show('searchModal');
        closeAllMenus();
    });
    document.getElementById('showDrawToolsBtn').addEventListener('click', () => {
        updateDrawTargetLayerDropdown();
        modalManager.show('drawToolsModal');
        closeAllMenus();
    });
    document.getElementById('measureDistanceBtn').addEventListener('click', () => {
        if (distanceTool) {
            distanceTool.toggle();
            const btn = document.getElementById('measureDistanceBtn');
            btn.classList.toggle('active', distanceTool.isActive);
            if (distanceTool.isActive) {
                toastManager.info('Click two points on the map to measure distance');
            }
        }
        closeAllMenus();
    });

    // Menu Item Handlers - Settings Menu
    document.getElementById('showFilterBtn').addEventListener('click', () => {
        modalManager.show('filterModal');
        closeAllMenus();
    });

    // Debug Console Toggle
    document.getElementById('toggleDebugConsoleBtn').addEventListener('click', () => {
        const debugPanel = document.getElementById('debugConsole');
        if (debugPanel) {
            const isHidden = debugPanel.style.display === 'none';
            debugPanel.style.display = isHidden ? 'block' : 'none';
            toastManager.success(isHidden ? 'Debug console shown' : 'Debug console hidden');
        }
        closeAllMenus();
    });

    // v3.0: Distance Measurement Controls
    document.getElementById('clearMeasurementBtn').addEventListener('click', () => {
        if (distanceTool) {
            distanceTool.clearCurrent();
        }
    });
    document.getElementById('closeMeasurementBtn').addEventListener('click', () => {
        if (distanceTool) {
            distanceTool.deactivate();
            document.getElementById('measureDistanceBtn').classList.remove('active');
        }
    });

    // Measurement Mode Toggle
    document.getElementById('distanceModeBtn').addEventListener('click', () => {
        if (distanceTool) {
            distanceTool.setMode('distance');
            document.getElementById('distanceModeBtn').classList.remove('btn-secondary');
            document.getElementById('distanceModeBtn').classList.add('btn-primary', 'active');
            document.getElementById('radiusModeBtn').classList.remove('btn-primary', 'active');
            document.getElementById('radiusModeBtn').classList.add('btn-secondary');
            toastManager.info('Distance mode: Measure straight-line distance between two points');
        }
    });
    document.getElementById('radiusModeBtn').addEventListener('click', () => {
        if (distanceTool) {
            distanceTool.setMode('radius');
            document.getElementById('radiusModeBtn').classList.remove('btn-secondary');
            document.getElementById('radiusModeBtn').classList.add('btn-primary', 'active');
            document.getElementById('distanceModeBtn').classList.remove('btn-primary', 'active');
            document.getElementById('distanceModeBtn').classList.add('btn-secondary');
            toastManager.info('Radius mode: Click center then edge to draw a circle');
        }
    });

    // CSV Upload
    document.getElementById('uploadBtn').addEventListener('click', handleCSVUpload);
    document.getElementById('csvFileInput').addEventListener('change', (e) => {
        document.getElementById('uploadBtn').disabled = e.target.files.length === 0;
    });

    // Address Search
    document.getElementById('searchBtn').addEventListener('click', handleAddressSearch);
    document.getElementById('addressSearch').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAddressSearch();
    });

    // Drawing Tools
    document.getElementById('drawPointBtn').addEventListener('click', () => {
        startDrawingMode('point');
        modalManager.close('drawToolsModal');
    });
    document.getElementById('drawPolygonBtn').addEventListener('click', () => {
        startDrawingMode('polygon');
        modalManager.close('drawToolsModal');
    });
    document.getElementById('deleteDrawingBtn').addEventListener('click', handleDeleteDrawing);

    // Layer Group Management
    document.getElementById('addGroupBtn').addEventListener('click', handleAddGroup);

    // Collapse/Expand All Groups
    let allGroupsCollapsed = false;
    document.getElementById('collapseAllGroupsBtn').addEventListener('click', () => {
        const expandedGroups = stateManager.get('expandedGroups') || new Set();
        const layerGroups = layerManager.getAllLayerGroups();

        if (allGroupsCollapsed) {
            // Expand all
            layerGroups.forEach(group => {
                if (expandedGroups.has) {
                    expandedGroups.add(group.id);
                } else {
                    expandedGroups[group.id] = true;
                }
            });
            stateManager.set('expandedGroups', expandedGroups);
            document.getElementById('collapseAllGroupsBtn').textContent = '⬆';
            document.getElementById('collapseAllGroupsBtn').title = 'Collapse all groups';
            allGroupsCollapsed = false;
        } else {
            // Collapse all
            if (expandedGroups.has) {
                expandedGroups.clear();
            } else {
                layerGroups.forEach(group => {
                    delete expandedGroups[group.id];
                });
            }
            stateManager.set('expandedGroups', expandedGroups);
            document.getElementById('collapseAllGroupsBtn').textContent = '⬇';
            document.getElementById('collapseAllGroupsBtn').title = 'Expand all groups';
            allGroupsCollapsed = true;
        }

        updateLayerGroupList();
    });

    // Layer Management
    document.getElementById('addLayerBtn').addEventListener('click', handleAddLayerClick);

    // Bulk Operations
    document.getElementById('massUpdateNamesBtn').addEventListener('click', () => {
        if (confirm('This will update all feature names to match their account names (where available). Continue?')) {
            massUpdateNamesToAccountNames();
        }
        closeAllMenus();
    });

    // Layer Search
    const layerSearchInput = document.getElementById('layerSearchInput');
    const clearLayerSearch = document.getElementById('clearLayerSearch');

    layerSearchInput.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        if (value) {
            clearLayerSearch.style.display = 'flex';
        } else {
            clearLayerSearch.style.display = 'none';
        }
        updateLayerList();
    });

    clearLayerSearch.addEventListener('click', () => {
        layerSearchInput.value = '';
        clearLayerSearch.style.display = 'none';
        updateLayerList();
    });

    // Filtering
    document.getElementById('applyFilterBtn').addEventListener('click', handleApplyFilter);
    document.getElementById('clearFilterBtn').addEventListener('click', handleClearFilter);

    // Sorting
    document.getElementById('sortAscBtn').addEventListener('click', () => handleSort('asc'));
    document.getElementById('sortDescBtn').addEventListener('click', () => handleSort('desc'));

    // Profiles
    document.getElementById('profileSelect').addEventListener('change', handleProfileChange);
    document.getElementById('manageProfilesBtn').addEventListener('click', showProfileManagementModal);
    document.getElementById('createProfileBtn').addEventListener('click', handleCreateProfile);
    document.getElementById('closeProfileManagementBtn').addEventListener('click', () => modalManager.close('profileManagementModal'));

    // Firebase
    document.getElementById('saveToFirebase').addEventListener('click', handleSaveToFirebase);
    document.getElementById('loadFromFirebase').addEventListener('click', handleLoadFromFirebase);

    // Plugins
    // Plugins Menu Handlers
    document.getElementById('showPluginsBtn').addEventListener('click', () => {
        showPluginsModal();
        closeAllMenus();
    });
    document.getElementById('closePluginsBtn').addEventListener('click', () => modalManager.close('pluginsModal'));

    // v3.0: Cluster Settings
    document.getElementById('showClusterSettingsBtn').addEventListener('click', () => {
        if (mapManager && mapManager.clusterManager) {
            mapManager.clusterManager.renderSettingsPanel();
            modalManager.show('clusterSettingsModal');
        } else {
            toastManager.error('Cluster manager not available');
        }
        closeAllMenus();
    });

    // Heatmap Button - connects to heatmap plugin
    const heatmapBtn = document.getElementById('showHeatmapBtn');
    if (heatmapBtn) {
        heatmapBtn.addEventListener('click', () => {
            // Check if heatmap plugin is available
            if (typeof pluginManager !== 'undefined' && pluginManager.getPlugin) {
                const heatmapPlugin = pluginManager.getPlugin('heatmap-overlay');
                if (heatmapPlugin && heatmapPlugin.showConfigModal) {
                    heatmapPlugin.showConfigModal();
                } else {
                    toastManager.warning('Heatmap plugin not loaded');
                }
            } else {
                toastManager.warning('Plugin system not available');
            }
            closeAllMenus();
        });
    }

    // Export View-Only Map - downloads a self-contained, read-only HTML snapshot
    const exportViewOnlyBtn = document.getElementById('exportViewOnlyBtn');
    if (exportViewOnlyBtn) {
        exportViewOnlyBtn.addEventListener('click', () => {
            if (typeof MapExport !== 'undefined' && MapExport.exportViewOnlyMap) {
                MapExport.exportViewOnlyMap();
            } else {
                toastManager.error('View-only export module not loaded');
            }
            closeAllMenus();
        });
    }

    // Map Controls
    document.getElementById('zoomIn').addEventListener('click', () => mapManager.zoomIn());
    document.getElementById('zoomOut').addEventListener('click', () => mapManager.zoomOut());
    document.getElementById('resetView').addEventListener('click', () => mapManager.resetView());

    // Polygon Edit Controls
    document.getElementById('savePolygonEdit').addEventListener('click', savePolygonShapeEdit);
    document.getElementById('cancelPolygonEdit').addEventListener('click', cancelPolygonShapeEdit);

    // Edit Modal
    document.getElementById('cancelEdit').addEventListener('click', () => modalManager.close('editModal'));
    document.getElementById('deleteFeature').addEventListener('click', handleDeleteFeature);
    document.getElementById('editForm').addEventListener('submit', handleEditFormSubmit);

    // Column Mapping Modal
    document.getElementById('columnMapForm').addEventListener('submit', handleColumnMapSubmit);
    document.getElementById('cancelMapping').addEventListener('click', () => modalManager.close('columnMapModal'));

    // Template Controls
    document.getElementById('saveTemplateBtn').addEventListener('click', handleSaveTemplate);
    document.getElementById('loadTemplateBtn').addEventListener('click', handleLoadTemplate);
    document.getElementById('deleteTemplateBtn').addEventListener('click', handleDeleteTemplate);
    document.getElementById('templateSelect').addEventListener('change', handleTemplateSelectChange);

    // Style Modal
    document.getElementById('styleType').addEventListener('change', handleStyleTypeChange);
    document.getElementById('applyStyleBtn').addEventListener('click', handleApplyStyle);
    document.getElementById('cancelStyleBtn').addEventListener('click', () => modalManager.close('styleModal'));

    // Opacity slider in style modal
    const opacitySlider = document.getElementById('layerOpacitySlider');
    opacitySlider.addEventListener('input', (e) => {
        document.getElementById('opacityValue').textContent = e.target.value;
    });

    // Layer Actions Menu
    document.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', handleLayerAction);
    });

    // Import Tabs
    document.querySelectorAll('.import-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            switchImportTab(tabName);
        });
    });

    // Paste Import
    document.getElementById('importPasteBtn').addEventListener('click', handlePasteImport);

    // Validation Modal
    document.getElementById('importValidDataBtn').addEventListener('click', handleImportValidData);
    document.getElementById('downloadErrorsBtn').addEventListener('click', handleDownloadErrors);
    document.getElementById('closeValidationBtn').addEventListener('click', () => modalManager.close('validationModal'));

    // Rename Layer Modal
    document.getElementById('confirmRenameBtn').addEventListener('click', handleRenameLayer);
    document.getElementById('cancelRenameBtn').addEventListener('click', () => modalManager.close('renameLayerModal'));
    document.getElementById('newLayerName').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleRenameLayer();
        }
    });

    // Move Feature Modal
    document.getElementById('confirmMoveBtn').addEventListener('click', handleMoveFeature);
    document.getElementById('cancelMoveBtn').addEventListener('click', () => modalManager.close('moveFeatureModal'));

    // Add Layer Modal
    document.getElementById('createBlankLayerBtn').addEventListener('click', () => {
        modalManager.close('addLayerModal');
        modalManager.show('layerTypeModal');
        // Clear and focus the name input
        document.getElementById('newLayerNameInput').value = 'New Layer';
        setTimeout(() => document.getElementById('newLayerNameInput').select(), 100);
    });
    document.getElementById('uploadDataBtn').addEventListener('click', () => {
        modalManager.close('addLayerModal');
        modalManager.show('uploadModal');
    });

    // Layer Type Modal
    document.getElementById('confirmLayerTypeBtn').addEventListener('click', handleCreateBlankLayer);
    document.getElementById('cancelLayerTypeBtn').addEventListener('click', () => modalManager.close('layerTypeModal'));
    document.getElementById('newLayerNameInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleCreateBlankLayer();
        }
    });

    // v3.0: Sidebar Tab Switching
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.currentTarget.dataset.tab;
            switchTab(tabName);
        });
    });

    // v3.0: Analytics Actions
    document.getElementById('refreshAnalyticsBtn').addEventListener('click', () => {
        if (analyticsPanel) {
            analyticsPanel.render();
            toastManager.success('Analytics refreshed');
        }
    });

    document.getElementById('exportAnalyticsBtn').addEventListener('click', () => {
        if (analyticsPanel) {
            analyticsPanel.exportMetrics();
            toastManager.success('Analytics exported');
        }
    });

    // v3.0: Notification Center Actions
    document.getElementById('notificationBtn').addEventListener('click', () => {
        const panel = document.getElementById('notificationPanel');
        const isVisible = panel.classList.contains('show');

        if (isVisible) {
            panel.classList.remove('show');
        } else {
            panel.classList.add('show');
            // Render notifications when panel is opened
            if (notificationCenter) {
                notificationCenter.render();
                // Mark notifications as read after viewing
                notificationCenter.markAllAsRead();
            }
        }
    });

    document.getElementById('closeNotificationPanel').addEventListener('click', () => {
        document.getElementById('notificationPanel').classList.remove('show');
    });

    // v3.0: Activity Log Actions
    document.getElementById('exportActivityJSONBtn').addEventListener('click', () => {
        if (activityLog) {
            activityLog.exportJSON();
        }
    });

    document.getElementById('exportActivityCSVBtn').addEventListener('click', () => {
        if (activityLog) {
            activityLog.exportCSV();
        }
    });

    document.getElementById('clearActivityBtn').addEventListener('click', () => {
        if (activityLog) {
            if (confirm('Are you sure you want to clear all activity history? This cannot be undone.')) {
                activityLog.clear();
                toastManager.success('Activity history cleared');
            }
        }
    });

    // Modal close buttons
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.target.dataset.modal;
            if (modalId) modalManager.close(modalId);
        });
    });

    // Close modals and menus when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            modalManager.close(e.target.id);
        }
        // Close context menu
        const contextMenu = document.getElementById('layerActionsMenu');
        if (!e.target.closest('.layer-menu-btn') && !e.target.closest('.context-menu')) {
            contextMenu.classList.remove('show');
        }
    });
}

/**
 * Handle add layer button click - offers choice to create blank or upload
 */
function handleAddLayerClick() {
    modalManager.show('addLayerModal');
}

/**
 * Handle creating a blank layer
 */
function handleCreateBlankLayer() {
    // Get values from modal
    const layerName = document.getElementById('newLayerNameInput').value;
    if (!layerName || layerName.trim() === '') {
        toastManager.error('Please enter a layer name');
        return;
    }

    // Get selected layer type from radio buttons
    const selectedType = document.querySelector('input[name="layerType"]:checked');
    if (!selectedType) {
        toastManager.error('Please select a layer type');
        return;
    }
    const layerType = selectedType.value;

    // Close modal
    modalManager.close('layerTypeModal');

    // Create empty layer using command pattern for undo/redo
    const command = new CreateLayerCommand(
        layerManager,
        layerName.trim(),
        [],
        layerType,
        {
            source: 'manual',
            createdAt: new Date().toISOString()
        }
    );
    commandHistory.execute(command);
    const layerId = command.layerId;

    // Add to "All Layers" group
    addLayerToGroup(layerId, stateManager.get('allLayersGroupId'));

    // Also add to active group if one is selected (and it's not "All Layers")
    const currentActiveGroup = stateManager.get('activeGroup');
    if (currentActiveGroup && currentActiveGroup !== stateManager.get('allLayersGroupId')) {
        addLayerToGroup(layerId, currentActiveGroup);
    }

    toastManager.success(`Blank ${layerType} layer "${layerName}" created. Use the layer menu to add features.`);
}

/**
 * Handle layer group creation
 */
function handleAddGroup() {
    const name = prompt('Enter group name:', 'New Group');
    if (!name) return;

    createLayerGroup(name);
    toastManager.success(`Group "${name}" created`);
}

/**
 * Create a layer group
 */
function createLayerGroup(name) {
    // Use command pattern for undo/redo
    const command = new CreateGroupCommand(layerManager, name);
    commandHistory.execute(command);

    // EventBus will trigger updateLayerGroupList via subscription
    return command.groupId;
}

/**
 * Ensure the default "All Layers" group exists
 * Called during initialization to guarantee the group is available
 */
function ensureDefaultLayerGroup() {
    let allLayersGroupId = stateManager.get('allLayersGroupId');

    // Check if the group ID is set and the group actually exists
    if (allLayersGroupId) {
        const existingGroup = layerManager.getLayerGroup(allLayersGroupId);
        if (existingGroup) {
            console.log('Default "All Layers" group found:', allLayersGroupId);
            return allLayersGroupId;
        }
        // Group ID exists but group doesn't - need to create it
        console.log('Default group ID found but group missing, recreating...');
    }

    // Create the default "All Layers" group
    console.log('Creating default "All Layers" group...');
    allLayersGroupId = layerManager.createLayerGroup('All Layers', { isDefault: true });
    stateManager.set('allLayersGroupId', allLayersGroupId, true);

    // Add all existing layers to this group
    const allLayers = layerManager.getAllLayers();
    allLayers.forEach(layer => {
        layerManager.addLayerToGroup(layer.id, allLayersGroupId);
    });

    console.log('Default "All Layers" group created:', allLayersGroupId);
    return allLayersGroupId;
}

/**
 * Update layer group list
 */
function updateLayerGroupList() {
    const groupList = document.getElementById('layerGroupList');
    groupList.innerHTML = '';

    // Get layer groups from LayerManager
    const layerGroups = layerManager.getAllLayerGroups();

    if (layerGroups.length === 0) {
        groupList.innerHTML = '<p class="empty-state">No groups. Click + to add one.</p>';
        return;
    }

    // Track which groups are expanded (persisted in state)
    const expandedGroups = stateManager.get('expandedGroups') || new Set();

    layerManager.getAllLayerGroups().forEach(group => {
        const groupItem = document.createElement('div');
        // Highlight "All Layers" when activeGroup is null, or highlight the active group
        const isActive = (stateManager.get('activeGroup') === group.id) || (stateManager.get('activeGroup') === null && group.id === stateManager.get('allLayersGroupId'));
        const isExpanded = expandedGroups.has ? expandedGroups.has(group.id) : expandedGroups[group.id];
        const isAllLayers = group.id === stateManager.get('allLayersGroupId');

        groupItem.className = 'layer-group-item' + (isActive ? ' active' : '') + (isExpanded ? ' expanded' : '');
        groupItem.dataset.groupId = group.id;

        // For "All Layers", show total count of all layers
        const layerCount = isAllLayers
            ? layerManager.getAllLayers().length
            : (group.layerIds || []).length;

        const groupOpacity = group.opacity !== undefined ? group.opacity : 1.0;
        const groupOpacityPercent = Math.round(groupOpacity * 100);

        groupItem.innerHTML = `
            <div class="layer-group-header">
                <button class="group-expand-btn" title="${isExpanded ? 'Collapse' : 'Expand'}">${isExpanded ? '▼' : '▶'}</button>
                <input type="checkbox" class="layer-group-toggle" ${group.visible ? 'checked' : ''}>
                <span class="layer-group-name">${group.name}</span>
                <span class="layer-group-count">${layerCount}</span>
                <div class="layer-opacity-control">
                    <input type="range" class="group-opacity-slider" min="0" max="100" value="${groupOpacityPercent}" title="Group Opacity: ${groupOpacityPercent}%">
                </div>
                ${!isAllLayers ? `
                    <button class="group-action-btn group-rename-btn" title="Rename Group">✏️</button>
                    <button class="group-action-btn group-delete-btn" title="Delete Group">🗑️</button>
                ` : ''}
            </div>
            <div class="layer-group-layers" style="display: ${isExpanded ? 'block' : 'none'};">
                <!-- Nested layers will be added here -->
            </div>
        `;

        const groupHeader = groupItem.querySelector('.layer-group-header');
        const layersContainer = groupItem.querySelector('.layer-group-layers');
        const expandBtn = groupItem.querySelector('.group-expand-btn');

        // Expand/collapse group to show layers
        expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleGroupExpanded(group.id, layersContainer, expandBtn);
        });

        // Populate nested layers if expanded
        if (isExpanded) {
            populateGroupLayers(layersContainer, group);
        }

        // Toggle group visibility
        groupItem.querySelector('.layer-group-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            console.log(`👆 Group checkbox clicked: group="${group.name}", checked=${e.target.checked}, wasVisible=${group.visible}`);
            group.visible = e.target.checked;
            toggleGroupVisibility(group.id, group.visible);
        });

        // Group opacity slider
        const groupOpacitySlider = groupItem.querySelector('.group-opacity-slider');
        groupOpacitySlider.addEventListener('input', (e) => {
            e.stopPropagation();
            const newOpacity = parseInt(e.target.value) / 100;
            e.target.title = `Group Opacity: ${e.target.value}%`;
            group.opacity = newOpacity;
            setGroupOpacity(group.id, newOpacity);
        });

        // Rename group button
        if (!isAllLayers) {
            const renameBtn = groupItem.querySelector('.group-rename-btn');
            if (renameBtn) {
                renameBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleRenameGroup(group.id, group.name);
                });
            }

            // Delete group button
            const deleteBtn = groupItem.querySelector('.group-delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleDeleteGroup(group.id, group.name);
                });
            }
        }

        // Select group (click on name area)
        groupHeader.addEventListener('click', (e) => {
            if (!e.target.classList.contains('layer-group-toggle') &&
                !e.target.classList.contains('group-opacity-slider') &&
                !e.target.classList.contains('group-expand-btn') &&
                !e.target.classList.contains('group-action-btn')) {
                selectGroup(group.id);
            }
        });

        // Drop zone for dragging layers onto groups (skip "All Layers")
        if (!isAllLayers) {
            groupItem.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                groupItem.classList.add('drag-over');
            });

            groupItem.addEventListener('dragleave', (e) => {
                // Only remove class if we're leaving the group item entirely
                if (!groupItem.contains(e.relatedTarget)) {
                    groupItem.classList.remove('drag-over');
                }
            });

            groupItem.addEventListener('drop', (e) => {
                e.preventDefault();
                groupItem.classList.remove('drag-over');
                const layerId = e.dataTransfer.getData('text/plain');
                if (layerId) {
                    moveLayerToGroup(layerId, group.id);
                }
            });
        }

        groupList.appendChild(groupItem);
    });

    // Auto-save state after group updates
    saveToLocalStorage();
}

/**
 * Toggle group expanded state
 */
function toggleGroupExpanded(groupId, container, expandBtn) {
    let expandedGroups = stateManager.get('expandedGroups');
    if (!expandedGroups || typeof expandedGroups.has !== 'function') {
        expandedGroups = new Set();
    }

    const isCurrentlyExpanded = expandedGroups.has(groupId);

    if (isCurrentlyExpanded) {
        expandedGroups.delete(groupId);
        container.style.display = 'none';
        expandBtn.textContent = '▶';
        expandBtn.title = 'Expand';
        container.parentElement.classList.remove('expanded');
    } else {
        expandedGroups.add(groupId);
        const group = layerManager.layerGroups.get(groupId);
        populateGroupLayers(container, group);
        container.style.display = 'block';
        expandBtn.textContent = '▼';
        expandBtn.title = 'Collapse';
        container.parentElement.classList.add('expanded');
    }

    stateManager.set('expandedGroups', expandedGroups, true);
}

/**
 * Populate layers within a group container
 */
function populateGroupLayers(container, group) {
    container.innerHTML = '';

    if (!group) return;

    const isAllLayers = group.id === stateManager.get('allLayersGroupId');
    const layerIds = isAllLayers
        ? layerManager.getAllLayers().map(l => l.id)
        : (group.layerIds || []);

    if (layerIds.length === 0) {
        container.innerHTML = '<p class="empty-state nested">No layers in this group</p>';
        return;
    }

    layerIds.forEach(layerId => {
        const layer = layerManager.layers.get(layerId);
        if (!layer) return;

        const layerItem = document.createElement('div');
        layerItem.className = 'nested-layer-item';
        layerItem.dataset.layerId = layer.id;
        layerItem.draggable = true;

        layerItem.innerHTML = `
            <span class="drag-handle" title="Drag to reorder or move to group">⠿</span>
            <input type="checkbox" class="layer-checkbox" ${layer.visible ? 'checked' : ''}>
            <span class="layer-name" title="${layer.name}">${layer.name}</span>
            <span class="layer-count">${layer.features?.length || 0}</span>
        `;

        // Visibility toggle
        layerItem.querySelector('.layer-checkbox').addEventListener('change', (e) => {
            e.stopPropagation();
            layerManager.toggleLayerVisibility(layer.id);
        });

        // Drag events for nested layers
        setupLayerDragEvents(layerItem, layer.id);

        container.appendChild(layerItem);
    });
}

/**
 * Move a layer to a different group
 */
function moveLayerToGroup(layerId, targetGroupId) {
    const layer = layerManager.layers.get(layerId);
    if (!layer) return;

    // Remove from current group
    layerManager.layerGroups.forEach((group, groupId) => {
        if (group.layerIds && group.layerIds.includes(layerId)) {
            group.layerIds = group.layerIds.filter(id => id !== layerId);
            layerManager.layerGroups.set(groupId, group);
        }
    });

    // Add to target group
    const targetGroup = layerManager.layerGroups.get(targetGroupId);
    if (targetGroup) {
        if (!targetGroup.layerIds) targetGroup.layerIds = [];
        if (!targetGroup.layerIds.includes(layerId)) {
            targetGroup.layerIds.push(layerId);
        }
        layerManager.layerGroups.set(targetGroupId, targetGroup);
    }

    // Emit event and update UI
    eventBus.emit('layer.grouped', { layerId, groupId: targetGroupId });
    toastManager.success(`Moved "${layer.name}" to "${targetGroup?.name || 'group'}"`);
    updateLayerGroupList();
    updateLayerList(layerManager.getAllLayers());
}

/**
 * Select a layer group
 */
function selectGroup(groupId) {
    const currentActiveGroup = stateManager.get('activeGroup');
    const allLayersGroupId = stateManager.get('allLayersGroupId');

    // If clicking "All Layers" or clicking the currently active group, show all layers
    if (groupId === allLayersGroupId || groupId === currentActiveGroup) {
        stateManager.set('activeGroup', null);
    } else {
        stateManager.set('activeGroup', groupId);
    }
    updateLayerGroupList();
    updateLayerList(layerManager.getAllLayers());
}

/**
 * Handle renaming a layer group
 */
function handleRenameGroup(groupId, currentName) {
    const newName = prompt('Enter new group name:', currentName);
    if (!newName || newName.trim() === '' || newName === currentName) {
        return;
    }

    // Use command pattern for undo/redo
    const command = new RenameGroupCommand(layerManager, groupId, newName.trim());
    commandHistory.execute(command);
    toastManager.success(`Renamed group to "${newName}"`);
    updateLayerGroupList();
    autoSaveToFirebase();
}

/**
 * Handle deleting a layer group
 */
function handleDeleteGroup(groupId, groupName) {
    const group = layerManager.getLayerGroup(groupId);
    if (!group) return;

    const layerCount = (group.layerIds || []).length;
    const message = layerCount > 0
        ? `Delete group "${groupName}"?\n\nThis will ungroup ${layerCount} layer(s). The layers will not be deleted.`
        : `Delete group "${groupName}"?`;

    if (!confirm(message)) {
        return;
    }

    // If this was the active group, clear selection
    if (stateManager.get('activeGroup') === groupId) {
        stateManager.set('activeGroup', null);
    }

    // Use command pattern for undo/redo
    const command = new DeleteGroupCommand(layerManager, groupId);
    commandHistory.execute(command);
    toastManager.success(`Deleted group "${groupName}"`);
    updateLayerGroupList();
    updateLayerList(layerManager.getAllLayers());
    autoSaveToFirebase();
}

/**
 * v3.0: Handle undo action
 */
function handleUndo() {
    if (!commandHistory || !commandHistory.canUndo()) return;

    const description = commandHistory.getUndoDescription();
    if (commandHistory.undo()) {
        toastManager.success(`Undone: ${description}`);
        updateLayerGroupList();
        updateLayerList(layerManager.getAllLayers());
        saveToLocalStorage(); // Trigger auto-save
    }
}

/**
 * v3.0: Handle redo action
 */
function handleRedo() {
    if (!commandHistory || !commandHistory.canRedo()) return;

    const description = commandHistory.getRedoDescription();
    if (commandHistory.redo()) {
        toastManager.success(`Redone: ${description}`);
        updateLayerGroupList();
        updateLayerList(layerManager.getAllLayers());
        saveToLocalStorage(); // Trigger auto-save
    }
}

/**
 * v3.0: Update undo/redo button states
 */
function updateHistoryButtons() {
    if (!commandHistory) return;

    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    if (undoBtn) {
        undoBtn.disabled = !commandHistory.canUndo();
        undoBtn.title = commandHistory.canUndo()
            ? `Undo: ${commandHistory.getUndoDescription()} (Ctrl+Z)`
            : 'Undo (Ctrl+Z)';
    }

    if (redoBtn) {
        redoBtn.disabled = !commandHistory.canRedo();
        redoBtn.title = commandHistory.canRedo()
            ? `Redo: ${commandHistory.getRedoDescription()} (Ctrl+Y)`
            : 'Redo (Ctrl+Y)';
    }
}

/**
 * v3.0: Switch between sidebar tabs
 */
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    const targetTab = document.getElementById(`${tabName}Tab`);
    if (targetTab) {
        targetTab.classList.add('active');
    }

    // Update state
    stateManager.set('activeTab', tabName);

    // Render analytics if switching to analytics tab
    if (tabName === 'analytics' && analyticsPanel) {
        analyticsPanel.render();
    }

    // Render activity log if switching to activity tab
    if (tabName === 'activity' && activityLog) {
        activityLog.render();
    }
}

/**
 * Toggle group visibility
 */
function toggleGroupVisibility(groupId, visible) {
    console.log(`🔘 toggleGroupVisibility called: groupId=${groupId}, visible=${visible}`);

    const layerGroups = layerManager.layerGroups;
    const group = layerGroups.get(groupId);
    if (!group) {
        console.log(`❌ Group not found: ${groupId}`);
        return;
    }

    console.log(`📋 Group found: name="${group.name}", currentVisible=${group.visible}`);

    // Update group visibility in state
    group.visible = visible;
    layerGroups.set(groupId, group);
    layerManager.layerGroups = layerGroups;

    // Get layer IDs based on group type
    let layerIds;
    if (groupId === stateManager.get('allLayersGroupId')) {
        // For "All Layers", apply to all layers
        layerIds = layerManager.getAllLayers().map(l => l.id);
        console.log(`📍 "All Layers" group detected - processing ${layerIds.length} layers`);
    } else {
        layerIds = group.layerIds || [];
        console.log(`📍 Regular group - processing ${layerIds.length} layers in group`);
    }

    console.log(`🔄 About to toggle ${layerIds.length} layers to visible=${visible}`);

    // Update each layer's visibility and persist to state
    const layers = layerManager.layers;
    layerIds.forEach((layerId, index) => {
        const layer = layers.get(layerId);
        if (layer) {
            console.log(`  [${index + 1}/${layerIds.length}] Toggling layer "${layer.name}" (${layerId}) from ${layer.visible} to ${visible}`);
            layer.visible = visible;
            layers.set(layerId, layer);
            mapManager.toggleLayerVisibility(layerId, visible);
        } else {
            console.log(`  [${index + 1}/${layerIds.length}] ⚠️ Layer not found: ${layerId}`);
        }
    });
    layerManager.layers = layers;

    console.log(`✅ toggleGroupVisibility complete - updated ${layerIds.length} layers`);

    // Update UI without triggering full refresh (avoid layer list filtering issues)
    updateLayerGroupList();
    updateLayerList(layerManager.getAllLayers());
}

/**
 * Set opacity for all layers in a group
 */
function setGroupOpacity(groupId, opacity) {
    const group = layerManager.layerGroups.get(groupId);
    if (!group) return;

    // Get layer IDs based on group type
    let layerIds;
    if (groupId === stateManager.get('allLayersGroupId')) {
        // For "All Layers", apply to all layers
        layerIds = layerManager.getAllLayers().map(l => l.id);
    } else {
        layerIds = group.layerIds || [];
    }

    // Set opacity for each layer in the group
    layerIds.forEach(layerId => {
        layerManager.setLayerOpacity(layerId, opacity);
    });
}

/**
 * Handle address search
 */
async function handleAddressSearch() {
    const searchInput = document.getElementById('addressSearch');
    const query = searchInput.value.trim();

    if (!query) {
        toastManager.warning('Please enter an address to search');
        return;
    }

    loadingManager.show('Searching for address...');

    try {
        const result = await mapManager.searchAddress(query);
        loadingManager.hide();

        if (result.success) {
            toastManager.success(`Found: ${result.address}`);
            searchInput.value = '';
            modalManager.close('searchModal');
        } else {
            toastManager.error(`No results found for "${query}"`);
        }
    } catch (error) {
        loadingManager.hide();
        toastManager.error('Error searching address: ' + error.message);
    }
}

/**
 * Start drawing mode
 */
function startDrawingMode(type) {
    // Get selected target layer from dropdown
    const dropdown = document.getElementById('drawTargetLayer');
    const selectedLayerId = dropdown?.value;

    if (selectedLayerId) {
        window.targetLayerForNewFeature = selectedLayerId;
    }

    const mode = type === 'point' ? 'draw-point' : 'draw-polygon';
    mapManager.startDrawing(mode);

    const statusText = type === 'point' ? 'Click on the map to add a point' : 'Click to draw polygon vertices. Double-click to finish.';
    document.getElementById('drawingStatus').textContent = statusText;

    // Get layer name for better message
    let layerName = 'first available layer';
    if (selectedLayerId) {
        const layer = layerManager.getLayer(selectedLayerId);
        if (layer) layerName = layer.name;
    }

    toastManager.show(`Drawing ${type} on "${layerName}". ${statusText}`, 'info');
}

/**
 * Handle drawing complete
 */
function handleDrawingComplete(drawingData) {
    mapManager.stopDrawing();
    document.getElementById('drawingStatus').textContent = 'Select a tool to start drawing';

    const name = prompt('Enter a name for this feature:', 'New Feature');
    if (!name) {
        // Remove the drawn shape from map
        if (drawingData.shape) {
            drawingData.shape.setMap(null);
        }
        window.targetLayerForNewFeature = null;
        return;
    }

    let targetLayerId;

    // Check if we're adding to a specific layer
    if (window.targetLayerForNewFeature) {
        targetLayerId = window.targetLayerForNewFeature;
        window.targetLayerForNewFeature = null;
    } else {
        // Original behavior: add to first layer or create new one
        const layers = layerManager.getAllLayers();
        if (layers.length === 0) {
            targetLayerId = layerManager.createLayer('Drawn Features', [], drawingData.type === 'Point' ? 'point' : 'polygon');
            // Always add to "All Layers" group
            addLayerToGroup(targetLayerId, stateManager.get('allLayersGroupId'));
        } else {
            targetLayerId = layers[0].id;
        }
    }

    const layer = layerManager.getLayer(targetLayerId);
    if (!layer) {
        toastManager.error('Error: Target layer not found');
        if (drawingData.shape) {
            drawingData.shape.setMap(null);
        }
        return;
    }

    // Build feature properties based on drawing type (layers can contain mixed types)
    const featureId = `drawn_${Date.now()}`;
    let feature;
    let featureType;

    if (drawingData.type === 'Point') {
        // Point feature
        featureType = 'point';
        feature = {
            id: featureId,
            name: name,
            latitude: drawingData.coordinates[1],
            longitude: drawingData.coordinates[0],
            source: 'manual',
            createdAt: new Date().toISOString()
        };
    } else if (drawingData.type === 'Polygon') {
        // Polygon feature
        featureType = 'polygon';
        const coords = drawingData.coordinates[0].map(c => `${c[0]} ${c[1]}`).join(', ');
        const wkt = `POLYGON((${coords}))`;
        feature = {
            id: featureId,
            name: name,
            wkt: wkt,
            source: 'manual',
            createdAt: new Date().toISOString()
        };
    } else {
        toastManager.error(`Unsupported drawing type: ${drawingData.type}`);
        if (drawingData.shape) {
            drawingData.shape.setMap(null);
        }
        return;
    }

    // Remove the temporary drawn shape from map
    if (drawingData.shape) {
        drawingData.shape.setMap(null);
    }

    // Add feature to layer using the layer manager's method
    // Pass the feature type so layer-manager can handle mixed types
    layerManager.addFeaturesToLayer(targetLayerId, [feature], featureType);

    toastManager.success(`Feature "${name}" added to "${layer.name}"`);
}

/**
 * Handle delete drawing
 */
function handleDeleteDrawing() {
    const deleted = mapManager.deleteSelectedDrawing();
    if (deleted) {
        toastManager.success('Drawing deleted');
    } else {
        toastManager.warning('No drawing selected. Click on a drawn feature first.');
    }
}

/**
 * Handle CSV file upload
 */
async function handleCSVUpload() {
    const fileInput = document.getElementById('csvFileInput');
    const files = Array.from(fileInput.files);

    if (files.length === 0) {
        toastManager.warning('Please select at least one file');
        return;
    }

    modalManager.close('uploadModal');

    let successCount = 0;
    let errorCount = 0;

    // Process each file
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileNum = files.length > 1 ? ` (${i + 1}/${files.length})` : '';

        loadingManager.show(`Parsing ${file.name}${fileNum}...`);

        try {
            const parsed = await csvParser.parseFile(file);
            console.log(`File parsed: ${file.name}`, parsed);

            if (parsed.needsGeocoding) {
                // For multi-file uploads with geocoding needed, pause and ask user
                if (files.length > 1) {
                    loadingManager.hide();
                    const proceed = confirm(`File "${file.name}" contains addresses and needs geocoding. Skip this file and continue with remaining files?`);
                    if (!proceed) {
                        // Process this file for geocoding
                        currentCSVData = parsed;
                        currentCSVData.fileName = file.name;
                        const detectedMapping = geocodingService.detectAddressColumns(parsed.originalColumns);
                        showColumnMapModal(parsed.originalColumns, detectedMapping);
                        fileInput.value = '';
                        document.getElementById('uploadBtn').disabled = true;
                        return;
                    }
                    continue; // Skip this file
                } else {
                    // Single file needing geocoding
                    loadingManager.hide();
                    currentCSVData = parsed;
                    currentCSVData.fileName = file.name;
                    const detectedMapping = geocodingService.detectAddressColumns(parsed.originalColumns);
                    showColumnMapModal(parsed.originalColumns, detectedMapping);
                    fileInput.value = '';
                    document.getElementById('uploadBtn').disabled = true;
                    return;
                }
            }

            // Validate data before creating layer
            loadingManager.show(`Validating ${file.name}${fileNum}...`);

            // Get raw data from the parsed result
            const rawData = parsed.rawData || parsed.features;
            const validation = csvParser.validateData(rawData, parsed.columnMap, parsed.type);

            console.log(`Validation results for ${file.name}:`, validation);

            // If there are validation errors, show validation modal for single file
            // For multi-file, we'll just skip invalid rows automatically
            if (validation.invalidCount > 0) {
                if (files.length === 1) {
                    // Single file - show validation modal and let user decide
                    loadingManager.hide();
                    showValidationResults(validation, file.name);
                    fileInput.value = '';
                    document.getElementById('uploadBtn').disabled = true;
                    return;
                } else {
                    // Multi-file - use only valid rows and continue
                    console.log(`Skipping ${validation.invalidCount} invalid rows from ${file.name}`);
                    if (validation.validCount === 0) {
                        errorCount++;
                        toastManager.warning(`${file.name}: All rows invalid, skipping file`);
                        continue;
                    }
                    // Extract features from valid rows only
                    parsed.features = csvParser.extractFeatures(
                        validation.validRows,
                        validation.columnMap,
                        validation.dataType
                    );
                }
            }

            // Auto-generate layer name from file name
            const defaultName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
            const layerName = files.length === 1
                ? (prompt('Enter layer name:', defaultName) || defaultName)
                : defaultName; // Auto-name for multi-file uploads

            if (!layerName && files.length === 1) {
                loadingManager.hide();
                fileInput.value = '';
                document.getElementById('uploadBtn').disabled = true;
                return;
            }

            const layerId = layerManager.createLayer(layerName, parsed.features, parsed.type, {
                sourceFile: file.name,
                columnMap: parsed.columnMap,
                importDate: new Date().toISOString()
            });

            // Always add to "All Layers" group
            addLayerToGroup(layerId, stateManager.get('allLayersGroupId'));

            // Also add to active group if one is selected (and it's not "All Layers")
            const uploadActiveGroup = stateManager.get('activeGroup');
            if (uploadActiveGroup && uploadActiveGroup !== stateManager.get('allLayersGroupId')) {
                addLayerToGroup(layerId, uploadActiveGroup);
            }

            successCount++;
            console.log(`Layer "${layerName}" created from ${file.name}`);
        } catch (error) {
            console.error(`Error parsing ${file.name}:`, error);
            errorCount++;

            if (files.length === 1) {
                // For single file, show detailed error
                loadingManager.hide();
                const errorMsg = error.message || 'Unknown error occurred';
                toastManager.error(`Error parsing ${file.name}: ${errorMsg}`);

                if (errorMsg.includes('\n')) {
                    setTimeout(() => {
                        alert(`File Parsing Error:\n\n${errorMsg}`);
                    }, 500);
                }
            }
            // For multi-file, continue with next file
        }
    }

    loadingManager.hide();

    // Show summary for multi-file uploads
    if (files.length > 1) {
        if (successCount > 0 && errorCount > 0) {
            toastManager.warning(`Imported ${successCount} file(s). ${errorCount} file(s) failed.`);
        } else if (successCount > 0) {
            toastManager.success(`Successfully imported ${successCount} file(s)`);
        } else {
            toastManager.error(`Failed to import all files`);
        }
    } else if (successCount > 0) {
        toastManager.success(`Layer created successfully`);
    }

    fileInput.value = '';
    document.getElementById('uploadBtn').disabled = true;
    updateColumnSelects();
}

/**
 * Switch import tab
 */
function switchImportTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.import-tab').forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Update tab content
    document.querySelectorAll('.import-tab-content').forEach(content => {
        content.classList.remove('active');
    });

    if (tabName === 'file') {
        document.getElementById('fileTab').classList.add('active');
    } else if (tabName === 'paste') {
        document.getElementById('pasteTab').classList.add('active');
    }
}

/**
 * Handle paste import
 */
async function handlePasteImport() {
    const pasteInput = document.getElementById('pasteInput');
    const pastedData = pasteInput.value.trim();

    if (!pastedData) {
        toastManager.warning('Please paste some data first');
        return;
    }

    modalManager.close('uploadModal');
    loadingManager.show('Parsing pasted data...');

    try {
        // Parse pasted data using PapaParse
        const parsed = await new Promise((resolve, reject) => {
            Papa.parse(pastedData, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
                delimiter: '', // Auto-detect delimiter (tab or comma)
                complete: (results) => {
                    try {
                        const processedData = csvParser.processData(results.data, results.meta.fields);
                        resolve(processedData);
                    } catch (error) {
                        reject(error);
                    }
                },
                error: (error) => {
                    reject(error);
                }
            });
        });

        console.log('Pasted data parsed:', parsed);

        if (parsed.needsGeocoding) {
            loadingManager.hide();
            currentCSVData = parsed;
            currentCSVData.fileName = 'Pasted Data';
            const detectedMapping = geocodingService.detectAddressColumns(parsed.originalColumns);
            showColumnMapModal(parsed.originalColumns, detectedMapping);
            return;
        }

        // Validate data before creating layer
        loadingManager.show('Validating pasted data...');

        const rawData = parsed.rawData || parsed.features;
        const validation = csvParser.validateData(rawData, parsed.columnMap, parsed.type);

        console.log('Validation results for pasted data:', validation);

        // If there are validation errors, show validation modal
        if (validation.invalidCount > 0) {
            loadingManager.hide();
            showValidationResults(validation, 'Pasted Data');
            return;
        }

        const layerName = prompt('Enter layer name:', 'Pasted Data');
        if (!layerName) {
            loadingManager.hide();
            return;
        }

        const layerId = layerManager.createLayer(layerName, parsed.features, parsed.type, {
            sourceFile: 'Pasted from clipboard',
            columnMap: parsed.columnMap,
            importDate: new Date().toISOString()
        });

        // Always add to "All Layers" group
        addLayerToGroup(layerId, stateManager.get('allLayersGroupId'));

        // Also add to active group if one is selected (and it's not "All Layers")
        const pasteActiveGroup = stateManager.get('activeGroup');
        if (pasteActiveGroup && pasteActiveGroup !== stateManager.get('allLayersGroupId')) {
            addLayerToGroup(layerId, pasteActiveGroup);
        }

        loadingManager.hide();
        toastManager.success(`Layer "${layerName}" created with ${parsed.features.length} features`);

        // Clear the textarea
        pasteInput.value = '';
        updateColumnSelects();
    } catch (error) {
        console.error('Error parsing pasted data:', error);
        loadingManager.hide();
        toastManager.error('Error parsing pasted data: ' + error.message);
    }
}

/**
 * Validate and show validation results
 * @param {Array} data - Raw data rows
 * @param {Object} columnMap - Column mappings
 * @param {string} dataType - Data type
 * @param {string} fileName - File name for reference
 * @returns {Object} Validation results
 */
function validateAndShowResults(data, columnMap, dataType, fileName) {
    // Run validation
    const validation = csvParser.validateData(data, columnMap, dataType);

    // If there are errors, show validation modal
    if (validation.invalidCount > 0) {
        showValidationResults(validation, fileName);
        return validation;
    }

    // If all valid, return validation results
    return validation;
}

/**
 * Show validation results in modal
 */
function showValidationResults(validation, fileName) {
    // Update summary
    const summaryHtml = `
        <p><strong>File:</strong> ${fileName || 'Imported Data'}</p>
        <p>Data validation completed. Review the results below:</p>
        <div class="validation-stats">
            <div class="validation-stat">
                <span class="validation-stat-value">${validation.totalRows}</span>
                <span class="validation-stat-label">Total Rows</span>
            </div>
            <div class="validation-stat">
                <span class="validation-stat-value success">${validation.validCount}</span>
                <span class="validation-stat-label">Valid</span>
            </div>
            <div class="validation-stat">
                <span class="validation-stat-value error">${validation.invalidCount}</span>
                <span class="validation-stat-label">Errors</span>
            </div>
        </div>
    `;
    document.getElementById('validationSummary').innerHTML = summaryHtml;

    // Show errors if any
    const errorsSection = document.getElementById('validationErrors');
    const errorList = document.getElementById('errorList');

    if (validation.errors.length > 0) {
        errorsSection.style.display = 'block';

        // Group errors by row
        const errorsByRow = new Map();
        validation.invalidRows.forEach(invalidRow => {
            errorsByRow.set(invalidRow.rowNum, invalidRow);
        });

        // Build error list HTML
        let errorsHtml = '';
        errorsByRow.forEach((invalidRow, rowNum) => {
            errorsHtml += `
                <div class="error-item">
                    <div class="error-item-header">
                        <span class="error-item-row">Row ${rowNum}</span>
                        <span class="error-item-type">${invalidRow.errors[0].type.replace('_', ' ')}</span>
                    </div>
                    ${invalidRow.errors.map(err => `
                        <div class="error-item-message">
                            <strong>${err.field}:</strong> ${err.message}
                            ${err.value ? `<div class="error-item-details">Value: "${err.value}"</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        });

        errorList.innerHTML = errorsHtml;
    } else {
        errorsSection.style.display = 'none';
    }

    // Show/hide action buttons
    const importValidBtn = document.getElementById('importValidDataBtn');
    const downloadErrorsBtn = document.getElementById('downloadErrorsBtn');

    if (validation.validCount > 0 && validation.invalidCount > 0) {
        importValidBtn.style.display = 'inline-block';
        importValidBtn.onclick = () => handleImportValidData(validation);
    } else {
        importValidBtn.style.display = 'none';
    }

    if (validation.invalidCount > 0) {
        downloadErrorsBtn.style.display = 'inline-block';
        downloadErrorsBtn.onclick = () => handleDownloadErrors(validation);
    } else {
        downloadErrorsBtn.style.display = 'none';
    }

    // Show modal
    modalManager.show('validationModal');
}

/**
 * Import only valid data from validation results
 */
function handleImportValidData(validation) {
    if (!validation || validation.validCount === 0) {
        toastManager.warning('No valid data to import');
        return;
    }

    modalManager.close('validationModal');
    loadingManager.show('Processing valid data...');

    try {
        // Process only valid rows
        const features = csvParser.extractFeatures(
            validation.validRows,
            validation.columnMap,
            validation.dataType
        );

        // Create layer with valid data
        const layerName = prompt('Enter layer name:', 'Imported Data (validated)');
        if (layerName) {
            const layerId = layerManager.createLayer(layerName, features, validation.dataType, {
                sourceFile: 'Validated Import',
                columnMap: validation.columnMap,
                importDate: new Date().toISOString(),
                validatedRows: validation.validCount,
                skippedRows: validation.invalidCount
            });

            addLayerToGroup(layerId, stateManager.get('allLayersGroupId'));

            toastManager.success(
                `Layer "${layerName}" created with ${features.length} valid features. ${validation.invalidCount} rows skipped.`
            );
        }
    } catch (error) {
        console.error('Error importing valid data:', error);
        toastManager.error('Error importing valid data: ' + error.message);
    } finally {
        loadingManager.hide();
    }
}

/**
 * Download validation errors as CSV
 */
function handleDownloadErrors(validation) {
    if (!validation || validation.errors.length === 0) {
        toastManager.warning('No errors to download');
        return;
    }

    try {
        // Build error report CSV
        const errorReport = validation.errors.map(err => ({
            'Row Number': err.rowNum,
            'Error Type': err.type,
            'Field': err.field,
            'Message': err.message,
            'Invalid Value': err.value || ''
        }));

        // Convert to CSV
        const csv = Papa.unparse(errorReport);

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `validation_errors_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toastManager.success('Error report downloaded');
    } catch (error) {
        console.error('Error downloading error report:', error);
        toastManager.error('Error downloading report: ' + error.message);
    }
}

/**
 * Add layer to group
 */
function addLayerToGroup(layerId, groupId) {
    // Use layerManager's method to properly add layer to group
    layerManager.addLayerToGroup(layerId, groupId);
    // EventBus will trigger updateLayerGroupList via subscription
}

/**
 * Show column mapping modal
 */
function showColumnMapModal(columns, detectedMapping) {
    const modal = document.getElementById('columnMapModal');
    const selects = ['street1Column', 'street2Column', 'cityColumn', 'stateColumn', 'zipColumn'];

    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        select.innerHTML = ['street1Column', 'cityColumn', 'zipColumn'].includes(selectId)
            ? '<option value="">-- Select Column --</option>'
            : '<option value="">-- None --</option>';

        columns.forEach(col => {
            const option = document.createElement('option');
            option.value = col;
            option.textContent = col;
            select.appendChild(option);
        });

        const mappingKey = selectId.replace('Column', '');
        if (detectedMapping[mappingKey]) {
            select.value = detectedMapping[mappingKey];
        }
    });

    // Update template dropdown
    updateTemplateSelect();

    modalManager.show('columnMapModal');
}

/**
 * Handle column mapping form submission
 */
async function handleColumnMapSubmit(e) {
    e.preventDefault();

    if (!currentCSVData) {
        toastManager.error('No CSV data available');
        return;
    }

    const columnMapping = {
        street1: document.getElementById('street1Column').value,
        street2: document.getElementById('street2Column').value,
        city: document.getElementById('cityColumn').value,
        state: document.getElementById('stateColumn').value,
        zip: document.getElementById('zipColumn').value
    };

    if (!columnMapping.street1 || !columnMapping.city || !columnMapping.zip) {
        toastManager.warning('Please select at least Street, City, and Zip columns');
        return;
    }

    modalManager.close('columnMapModal');
    modalManager.show('geocodingModal');

    try {
        const geocodedFeatures = await geocodingService.geocodeBatch(
            currentCSVData.rawData,
            columnMapping,
            updateGeocodingProgress
        );

        const stats = geocodingService.getStatistics(geocodedFeatures);
        modalManager.close('geocodingModal');

        const layerName = prompt(
            `Geocoding complete! ${stats.successful} of ${stats.total} addresses geocoded.\nEnter layer name:`,
            'Geocoded Locations'
        );

        if (!layerName) {
            currentCSVData = null;
            return;
        }

        const validFeatures = geocodedFeatures.filter(f => f.latitude && f.longitude);
        const layerId = layerManager.createLayer(layerName, validFeatures, 'point', {
            geocoded: true,
            geocodingStats: stats,
            columnMapping: columnMapping,
            importDate: new Date().toISOString()
        });

        // Always add to "All Layers" group
        addLayerToGroup(layerId, stateManager.get('allLayersGroupId'));

        // Also add to active group if one is selected (and it's not "All Layers")
        const geocodeActiveGroup = stateManager.get('activeGroup');
        if (geocodeActiveGroup && geocodeActiveGroup !== stateManager.get('allLayersGroupId')) {
            addLayerToGroup(layerId, geocodeActiveGroup);
        }

        toastManager.success(`Layer "${layerName}" created with ${validFeatures.length} geocoded locations`);
        updateColumnSelects();

        currentCSVData = null;
        document.getElementById('csvFileInput').value = '';
        document.getElementById('uploadBtn').disabled = true;

    } catch (error) {
        console.error('Error geocoding:', error);
        modalManager.close('geocodingModal');
        toastManager.error('Error geocoding addresses: ' + error.message);
    }
}

/**
 * Update geocoding progress
 */
function updateGeocodingProgress(progress) {
    const progressBar = document.getElementById('geocodingProgress');
    const statusText = document.getElementById('geocodingStatus');
    const statsText = document.getElementById('geocodingStats');

    progressBar.style.width = progress.percentage + '%';
    progressBar.textContent = Math.round(progress.percentage) + '%';

    statusText.textContent = `Geocoding: ${progress.current} of ${progress.total}`;
    statsText.textContent = `Success: ${progress.successCount} | Failed: ${progress.errorCount}`;
}

/**
 * Template Management Functions
 */

/**
 * Get all saved templates from localStorage
 */
function getTemplates() {
    try {
        const templates = localStorage.getItem('columnMappingTemplates');
        return templates ? JSON.parse(templates) : {};
    } catch (error) {
        console.error('Error loading templates:', error);
        return {};
    }
}

/**
 * Save templates to localStorage
 */
function saveTemplates(templates) {
    try {
        localStorage.setItem('columnMappingTemplates', JSON.stringify(templates));
    } catch (error) {
        console.error('Error saving templates:', error);
        toastManager.error('Error saving templates');
    }
}

/**
 * Update template select dropdown
 */
function updateTemplateSelect() {
    const templates = getTemplates();
    const templateSelect = document.getElementById('templateSelect');

    // Clear existing options except the first one
    templateSelect.innerHTML = '<option value="">-- No Template --</option>';

    // Add template options
    Object.keys(templates).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        templateSelect.appendChild(option);
    });
}

/**
 * Handle template select change
 */
function handleTemplateSelectChange() {
    const templateSelect = document.getElementById('templateSelect');
    const deleteBtn = document.getElementById('deleteTemplateBtn');

    // Show/hide delete button based on selection
    if (templateSelect.value) {
        deleteBtn.style.display = 'inline-block';
    } else {
        deleteBtn.style.display = 'none';
    }
}

/**
 * Handle save template button click
 */
function handleSaveTemplate() {
    const columnMapping = {
        street1: document.getElementById('street1Column').value,
        street2: document.getElementById('street2Column').value,
        city: document.getElementById('cityColumn').value,
        state: document.getElementById('stateColumn').value,
        zip: document.getElementById('zipColumn').value
    };

    // Validate that at least required fields are filled
    if (!columnMapping.street1 || !columnMapping.city || !columnMapping.zip) {
        toastManager.warning('Please select at least Street, City, and Zip columns before saving');
        return;
    }

    // Prompt for template name
    const templateName = prompt('Enter a name for this template:');
    if (!templateName || templateName.trim() === '') {
        return;
    }

    // Save template
    const templates = getTemplates();
    templates[templateName.trim()] = columnMapping;
    saveTemplates(templates);

    // Update dropdown
    updateTemplateSelect();

    // Select the newly saved template
    document.getElementById('templateSelect').value = templateName.trim();
    handleTemplateSelectChange();

    toastManager.success(`Template "${templateName}" saved`);
}

/**
 * Handle load template button click
 */
function handleLoadTemplate() {
    const templateSelect = document.getElementById('templateSelect');
    const templateName = templateSelect.value;

    if (!templateName) {
        toastManager.warning('Please select a template to load');
        return;
    }

    const templates = getTemplates();
    const template = templates[templateName];

    if (!template) {
        toastManager.error('Template not found');
        return;
    }

    // Apply template to form
    document.getElementById('street1Column').value = template.street1 || '';
    document.getElementById('street2Column').value = template.street2 || '';
    document.getElementById('cityColumn').value = template.city || '';
    document.getElementById('stateColumn').value = template.state || '';
    document.getElementById('zipColumn').value = template.zip || '';

    toastManager.success(`Template "${templateName}" loaded`);
}

/**
 * Handle delete template button click
 */
function handleDeleteTemplate() {
    const templateSelect = document.getElementById('templateSelect');
    const templateName = templateSelect.value;

    if (!templateName) {
        toastManager.warning('Please select a template to delete');
        return;
    }

    if (!confirm(`Are you sure you want to delete template "${templateName}"?`)) {
        return;
    }

    // Delete template
    const templates = getTemplates();
    delete templates[templateName];
    saveTemplates(templates);

    // Update dropdown
    updateTemplateSelect();

    // Reset selection
    templateSelect.value = '';
    handleTemplateSelectChange();

    toastManager.success(`Template "${templateName}" deleted`);
}

/**
 * Update layer list in sidebar
 */
function updateLayerList(layers) {
    const layerList = document.getElementById('layerList');
    layerList.innerHTML = '';

    // Ensure layers is defined
    if (!layers) {
        layers = layerManager.getAllLayers();
    }

    // Filter layers by active group
    let displayLayers = layers;
    const currentActiveGroup = stateManager.get('activeGroup');
    if (currentActiveGroup) {
        const group = layerManager.layerGroups.get(currentActiveGroup);
        if (group) {
            displayLayers = layers.filter(l => (group.layerIds || []).includes(l.id));
        }
    }

    // Apply search filter if there's a search term
    const searchInput = document.getElementById('layerSearchInput');
    if (searchInput && searchInput.value.trim()) {
        const searchTerm = searchInput.value.trim().toLowerCase();
        displayLayers = displayLayers.filter(layer => {
            return layer.name.toLowerCase().includes(searchTerm) ||
                   layer.id.toLowerCase().includes(searchTerm) ||
                   (layer.metadata && layer.metadata.description &&
                    layer.metadata.description.toLowerCase().includes(searchTerm));
        });
    }

    if (displayLayers.length === 0) {
        const searchTerm = searchInput && searchInput.value.trim();
        if (searchTerm) {
            layerList.innerHTML = `<p class="empty-state">No layers match "${searchTerm}"</p>`;
        } else {
            layerList.innerHTML = '<p class="empty-state">No layers in this group. Upload a CSV to add one.</p>';
        }
        return;
    }

    displayLayers.forEach(layer => {
        const layerItem = createLayerItem(layer);
        layerList.appendChild(layerItem);
    });

    // Setup layer list as drop zone for reordering
    setupLayerListDropZone(layerList);

    updateLegend(layers.filter(l => l.visible));

    // Auto-save state after layer updates
    saveToLocalStorage();
}

/**
 * Setup layer list as a drop zone for drag-and-drop reordering
 */
function setupLayerListDropZone(layerList) {
    layerList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingItem = document.querySelector('.layer-item.dragging');
        if (!draggingItem) return;

        const afterElement = getDragAfterElement(layerList, e.clientY);
        if (afterElement) {
            layerList.insertBefore(draggingItem, afterElement);
        } else {
            layerList.appendChild(draggingItem);
        }
    });

    layerList.addEventListener('drop', (e) => {
        e.preventDefault();
        const layerId = e.dataTransfer.getData('text/plain');
        if (!layerId) return;

        // Get new order from DOM
        const newOrder = Array.from(layerList.querySelectorAll('.layer-item'))
            .map(item => item.dataset.layerId);

        // Update layer order in manager
        reorderLayers(newOrder);
    });
}

/**
 * Get the element after which to insert the dragged item
 */
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.layer-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

/**
 * Setup drag events for a layer item
 */
function setupLayerDragEvents(element, layerId) {
    element.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', layerId);
        e.dataTransfer.effectAllowed = 'move';
        element.classList.add('dragging');

        // Create a custom drag image
        const dragImage = element.cloneNode(true);
        dragImage.style.opacity = '0.8';
        dragImage.style.position = 'absolute';
        dragImage.style.top = '-1000px';
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, 0, 0);

        // Remove the temporary drag image after drag starts
        setTimeout(() => {
            document.body.removeChild(dragImage);
        }, 0);
    });

    element.addEventListener('dragend', (e) => {
        element.classList.remove('dragging');
        // Remove any lingering drag-over classes
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    element.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
}

/**
 * Reorder layers based on new order array
 */
function reorderLayers(newOrder) {
    // Update the layer order in layerManager
    const orderedLayers = new Map();

    newOrder.forEach((layerId, index) => {
        const layer = layerManager.layers.get(layerId);
        if (layer) {
            layer.order = index;
            orderedLayers.set(layerId, layer);
        }
    });

    // Add any layers not in newOrder (shouldn't happen but just in case)
    layerManager.layers.forEach((layer, id) => {
        if (!orderedLayers.has(id)) {
            orderedLayers.set(id, layer);
        }
    });

    layerManager.layers = orderedLayers;

    // Update z-index on map
    mapManager.updateLayerOrder(newOrder);

    // Emit event
    eventBus.emit('layer.reordered', { order: newOrder });

    // Save state
    saveToLocalStorage();
}

/**
 * Create layer item element (compact version)
 */
function createLayerItem(layer) {
    const div = document.createElement('div');
    div.className = 'layer-item';
    div.dataset.layerId = layer.id;
    div.draggable = true;

    const opacity = layer.opacity !== undefined ? layer.opacity : 1.0;
    const opacityPercent = Math.round(opacity * 100);

    // Determine layer type icon
    let typeIcon = '';
    let typeTitle = '';
    if (layer.type === 'point') {
        typeIcon = '📍';
        typeTitle = 'Point layer';
    } else if (layer.type === 'polygon') {
        typeIcon = '🗺️';
        typeTitle = 'Polygon layer';
    } else if (layer.type === 'mixed') {
        typeIcon = '📍🗺️';
        typeTitle = 'Mixed layer (points & polygons)';
    }

    // v3.0: Calculate area for polygon layers
    let areaDisplay = '';
    if ((layer.type === 'polygon' || layer.type === 'mixed') && layer.features.length > 0) {
        const totalArea = Utils.calculateTotalArea(layer.features);
        if (totalArea > 0) {
            areaDisplay = `<span class="layer-area" title="Total area">📐 ${Utils.formatArea(totalArea)}</span>`;
        }
    }

    div.innerHTML = `
        <div class="layer-header">
            <span class="drag-handle" title="Drag to reorder or move to group">⠿</span>
            <button class="layer-expand-btn" title="Expand layer">▶</button>
            <div class="layer-info">
                <input type="checkbox" class="layer-checkbox" ${layer.visible ? 'checked' : ''}>
                <span class="layer-type-icon" title="${typeTitle}">${typeIcon}</span>
                <span class="layer-name" title="${layer.name}">${layer.name}</span>
                <span class="layer-count">${layer.features.length}</span>
                ${areaDisplay}
            </div>
            <div class="layer-opacity-control">
                <input type="range" class="opacity-slider" min="0" max="100" value="${opacityPercent}" title="Opacity: ${opacityPercent}%">
            </div>
            <button class="layer-menu-btn">⋮</button>
        </div>
        <div class="layer-features-list" style="display: none;"></div>
    `;

    const layerHeader = div.querySelector('.layer-header');
    const featuresContainer = div.querySelector('.layer-features-list');
    const expandBtn = div.querySelector('.layer-expand-btn');

    // Expand/collapse layer
    expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = featuresContainer.style.display !== 'none';

        if (isExpanded) {
            featuresContainer.style.display = 'none';
            expandBtn.textContent = '▶';
            expandBtn.title = 'Expand layer';
            div.classList.remove('expanded');
        } else {
            // Populate features list
            populateFeaturesList(featuresContainer, layer);
            featuresContainer.style.display = 'block';
            expandBtn.textContent = '▼';
            expandBtn.title = 'Collapse layer';
            div.classList.add('expanded');
        }
    });

    // Visibility toggle
    div.querySelector('.layer-checkbox').addEventListener('change', (e) => {
        e.stopPropagation();
        layerManager.toggleLayerVisibility(layer.id);
    });

    // Setup drag events for layer reordering
    setupLayerDragEvents(div, layer.id);

    // Opacity slider
    const opacitySlider = div.querySelector('.opacity-slider');
    opacitySlider.addEventListener('input', (e) => {
        e.stopPropagation();
        const newOpacity = parseInt(e.target.value) / 100;
        e.target.title = `Opacity: ${e.target.value}%`;
        layerManager.setLayerOpacity(layer.id, newOpacity);
    });

    // Layer menu button
    div.querySelector('.layer-menu-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        showLayerActionsMenu(e.target, layer.id);
    });

    return div;
}

/**
 * Populate the features list for a layer
 */
function populateFeaturesList(container, layer) {
    container.innerHTML = '';

    if (!layer.features || layer.features.length === 0) {
        container.innerHTML = '<p class="empty-state">No features in this layer.<br><small>Use the layer menu (⋮) to add features.</small></p>';
        return;
    }

    layer.features.forEach((feature, index) => {
        const featureItem = document.createElement('div');
        featureItem.className = 'feature-item';
        featureItem.dataset.featureId = feature.id;

        // Get feature name or create a default one
        const featureName = feature.name || feature.Name ||
                           feature.description || feature.Description ||
                           `Feature ${index + 1}`;

        // Add shape edit button only for polygon layers
        const shapeEditBtn = layer.type === 'polygon' && feature.wkt
            ? '<button class="feature-shape-btn" title="Edit polygon shape">🔷</button>'
            : '';

        featureItem.innerHTML = `
            <input type="checkbox" class="feature-checkbox" ${!feature.hidden ? 'checked' : ''} title="Toggle visibility">
            <span class="feature-name" title="${featureName}">${featureName}</span>
            ${shapeEditBtn}
            <button class="feature-edit-btn" title="Edit feature">✏️</button>
            <button class="feature-move-btn" title="Move to another layer">↗️</button>
            <button class="feature-delete-btn" title="Delete feature">🗑️</button>
        `;

        // Feature visibility toggle
        const checkbox = featureItem.querySelector('.feature-checkbox');
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            toggleFeatureVisibility(layer.id, feature.id, checkbox.checked);
        });

        // Feature name click - select and show in info panel
        const nameSpan = featureItem.querySelector('.feature-name');
        nameSpan.style.cursor = 'pointer';
        nameSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            selectFeature(layer.id, feature);
        });

        // Shape edit button (for polygons)
        const shapeBtn = featureItem.querySelector('.feature-shape-btn');
        if (shapeBtn) {
            shapeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                startPolygonShapeEdit(layer.id, feature);
            });
        }

        // Edit button
        featureItem.querySelector('.feature-edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            editFeature(layer.id, feature);
        });

        // Move button
        featureItem.querySelector('.feature-move-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            showMoveFeatureModal(layer.id, feature.id, featureName);
        });

        // Delete button
        featureItem.querySelector('.feature-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteFeature(layer.id, feature);
        });

        container.appendChild(featureItem);
    });
}

/**
 * Toggle individual feature visibility
 */
function toggleFeatureVisibility(layerId, featureId, visible) {
    const layer = mapManager.layers.get(layerId);
    if (!layer) return;

    // Find the marker for this feature
    if (layer.markers) {
        const marker = layer.markers.find(m => {
            const mFeature = m.feature;
            return mFeature && (mFeature.getId() === featureId ||
                               (mFeature.getProperty && mFeature.getProperty('id') === featureId));
        });

        if (marker) {
            marker.setVisible(visible);
        }
    }

    // Update feature hidden property
    const layerData = layerManager.getLayer(layerId);
    if (layerData) {
        const feature = layerData.features.find(f => f.id === featureId);
        if (feature) {
            feature.hidden = !visible;
        }
    }
}

/**
 * Select a feature and show its info
 */
function selectFeature(layerId, feature) {
    stateManager.set('currentEditingFeature', {
        layerId: layerId,
        id: feature.id,
        properties: feature
    });
    updateFeatureInfo(feature);
}

/**
 * Edit a feature
 */
function editFeature(layerId, feature) {
    stateManager.set('currentEditingFeature', {
        layerId: layerId,
        id: feature.id,
        properties: feature
    });
    openEditModal();
}

/**
 * Delete a feature
 */
function deleteFeature(layerId, feature) {
    const featureName = feature.name || feature.Name || 'this feature';
    if (!confirm(`Delete ${featureName}?`)) {
        return;
    }

    layerManager.deleteFeature(layerId, feature.id);
    toastManager.success('Feature deleted');

    // Refresh the expanded layer if it's still open
    const layerItem = document.querySelector(`[data-layer-id="${layerId}"]`);
    if (layerItem) {
        const featuresContainer = layerItem.querySelector('.layer-features-list');
        if (featuresContainer && featuresContainer.style.display !== 'none') {
            const layer = layerManager.getLayer(layerId);
            populateFeaturesList(featuresContainer, layer);
        }
    }
}

/**
 * Show layer actions context menu
 */
function showLayerActionsMenu(button, layerId) {
    const menu = document.getElementById('layerActionsMenu');
    const rect = button.getBoundingClientRect();

    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.left = `${rect.left - 150}px`;
    menu.classList.add('show');

    currentLayerForActions = layerId;
}

/**
 * Handle layer action
 */
function handleLayerAction(e) {
    const action = e.currentTarget.dataset.action;
    const layerId = currentLayerForActions;
    const layer = layerManager.getLayer(layerId);

    if (!layer) return;

    document.getElementById('layerActionsMenu').classList.remove('show');

    switch (action) {
        case 'add':
            handleAddFeatureToLayer(layerId, layer);
            break;

        case 'zoom':
            const dataSource = mapManager.dataSources.get(layerId);
            if (dataSource) {
                mapManager.fitMapToDataSource(dataSource);
            }
            break;

        case 'style':
            showStyleModal(layerId);
            break;

        case 'export':
            csvParser.exportToCSV(layer.features, `${layer.name}.csv`);
            toastManager.success(`Layer "${layer.name}" exported`);
            break;

        case 'rename':
            showRenameLayerModal(layerId, layer.name);
            break;

        case 'group':
            showMoveToGroupDialog(layerId);
            break;

        case 'delete':
            if (confirm(`Delete layer "${layer.name}"?`)) {
                // Use command pattern for undo/redo
                const command = new DeleteLayerCommand(layerManager, layerId);
                commandHistory.execute(command);
                removeLayerFromAllGroups(layerId);
                toastManager.success(`Layer "${layer.name}" deleted`);
            }
            break;
    }
}

/**
 * Show rename layer modal
 */
function showRenameLayerModal(layerId, currentName) {
    currentLayerForActions = layerId;
    const input = document.getElementById('newLayerName');
    input.value = currentName;
    modalManager.show('renameLayerModal');
    // Focus the input after modal is shown
    setTimeout(() => input.select(), 100);
}

/**
 * Handle rename layer confirmation
 */
function handleRenameLayer() {
    const layerId = currentLayerForActions;
    const newName = document.getElementById('newLayerName').value.trim();

    if (!newName) {
        toastManager.warning('Please enter a valid name');
        return;
    }

    const layer = layerManager.getLayer(layerId);
    if (!layer) return;

    // Use command pattern for undo/redo
    const command = new RenameLayerCommand(layerManager, layerId, newName);
    commandHistory.execute(command);
    toastManager.success(`Layer renamed to "${newName}"`);
    updateLayerList(layerManager.getAllLayers());

    modalManager.close('renameLayerModal');
}

/**
 * Show move feature to layer modal
 */
function showMoveFeatureModal(sourceLayerId, featureId, featureName) {
    window.moveFeatureContext = { sourceLayerId, featureId };

    // Update info text
    document.getElementById('moveFeatureInfo').textContent =
        `Moving "${featureName}" to another layer:`;

    // Populate target layer dropdown
    const select = document.getElementById('targetLayerSelect');
    select.innerHTML = '';

    const sourceLayer = layerManager.getLayer(sourceLayerId);
    const allLayers = layerManager.getAllLayers();

    // Filter to same type layers (point -> point, polygon -> polygon)
    const compatibleLayers = allLayers.filter(l =>
        l.id !== sourceLayerId && l.type === sourceLayer.type
    );

    if (compatibleLayers.length === 0) {
        select.innerHTML = '<option value="">No compatible layers available</option>';
        document.getElementById('confirmMoveBtn').disabled = true;
    } else {
        compatibleLayers.forEach(layer => {
            const option = document.createElement('option');
            option.value = layer.id;
            option.textContent = `${layer.name} (${layer.features.length} features)`;
            select.appendChild(option);
        });
        document.getElementById('confirmMoveBtn').disabled = false;
    }

    modalManager.show('moveFeatureModal');
}

/**
 * Handle move feature confirmation
 */
function handleMoveFeature() {
    const { sourceLayerId, featureId } = window.moveFeatureContext || {};
    const targetLayerId = document.getElementById('targetLayerSelect').value;

    if (!sourceLayerId || !featureId || !targetLayerId) {
        toastManager.warning('Please select a target layer');
        return;
    }

    const sourceLayer = layerManager.getLayer(sourceLayerId);
    const targetLayer = layerManager.getLayer(targetLayerId);
    const feature = sourceLayer?.features.find(f => f.id === featureId);

    if (layerManager.moveFeatureToLayer(sourceLayerId, featureId, targetLayerId)) {
        const featureName = feature?.name || feature?.Name || 'Feature';
        toastManager.success(`"${featureName}" moved to "${targetLayer.name}"`);
        updateLayerList(layerManager.getAllLayers());
    } else {
        toastManager.error('Failed to move feature');
    }

    modalManager.close('moveFeatureModal');
    window.moveFeatureContext = null;
}

/**
 * Handle adding a new feature to a specific layer
 */
function handleAddFeatureToLayer(layerId, layer) {
    // Store the target layer for when drawing completes
    window.targetLayerForNewFeature = layerId;

    // Determine drawing mode based on layer type
    const mode = layer.type === 'point' ? 'draw-point' : 'draw-polygon';
    mapManager.startDrawing(mode);

    const statusText = layer.type === 'point'
        ? `Click on the map to add a point to "${layer.name}"`
        : `Click to draw polygon vertices for "${layer.name}". Double-click to finish.`;

    toastManager.show(statusText, 'info');
}

/**
 * Show style modal for layer
 */
function showStyleModal(layerId) {
    currentLayerForActions = layerId;
    const layer = layerManager.getLayer(layerId);

    // Populate custom property dropdown
    const columns = layerManager.getAllColumnNames();
    const select = document.getElementById('customProperty');
    select.innerHTML = '<option value="">Select property...</option>';
    columns.forEach(col => {
        const option = document.createElement('option');
        option.value = col;
        option.textContent = col;
        select.appendChild(option);
    });

    // Set current layer opacity
    const currentOpacity = layer.opacity !== undefined ? layer.opacity : 1.0;
    const opacityPercent = Math.round(currentOpacity * 100);
    document.getElementById('layerOpacitySlider').value = opacityPercent;
    document.getElementById('opacityValue').textContent = opacityPercent;

    // Show/hide labels toggle based on layer type
    const showLabelsGroup = document.getElementById('showLabelsGroup');
    const showLabelsToggle = document.getElementById('showLabelsToggle');
    if (layer.type === 'polygon') {
        showLabelsGroup.style.display = 'block';
        showLabelsToggle.checked = layer.showLabels || false;
    } else {
        showLabelsGroup.style.display = 'none';
        showLabelsToggle.checked = false;
    }

    modalManager.show('styleModal');
}

/**
 * Handle style type change
 */
function handleStyleTypeChange(e) {
    const styleType = e.target.value;
    const customGroup = document.getElementById('customPropertyGroup');
    const colorGroup = document.getElementById('singleColorGroup');

    if (styleType === 'custom') {
        customGroup.style.display = 'block';
        colorGroup.style.display = 'none';
    } else if (styleType === 'single') {
        customGroup.style.display = 'none';
        colorGroup.style.display = 'block';
    } else {
        customGroup.style.display = 'none';
        colorGroup.style.display = 'none';
    }
}

/**
 * Apply style to layer
 */
function handleApplyStyle() {
    const layerId = currentLayerForActions;
    const layer = layerManager.getLayer(layerId);
    if (!layer) return;

    const styleType = document.getElementById('styleType').value;
    let property = null;

    switch (styleType) {
        case 'tier':
            property = 'tier';
            break;
        case 'zone':
            property = 'name'; // or territory, zone, etc.
            break;
        case 'bdm':
            property = 'bdm';
            break;
        case 'custom':
            property = document.getElementById('customProperty').value;
            if (!property) {
                toastManager.warning('Please select a property');
                return;
            }
            break;
    }

    // Get opacity value
    const opacityPercent = parseInt(document.getElementById('layerOpacitySlider').value);
    const opacity = opacityPercent / 100;

    // Get labels toggle value (for polygon layers)
    const showLabels = layer.type === 'polygon' ? document.getElementById('showLabelsToggle').checked : false;

    modalManager.close('styleModal');
    loadingManager.show('Applying style...');

    try {
        if (styleType === 'single') {
            const color = document.getElementById('singleColor').value;
            applySingleColorStyle(layerId, color);
        } else {
            applyPropertyBasedStyle(layerId, property, styleType);
        }

        // Apply opacity to the layer
        layerManager.setLayerOpacity(layerId, opacity);

        // Apply labels setting for polygon layers
        if (layer.type === 'polygon') {
            layer.showLabels = showLabels;
            mapManager.togglePolygonLabels(layerId, showLabels, layer.features);
        }

        loadingManager.hide();
        toastManager.success('Style applied successfully');
    } catch (error) {
        loadingManager.hide();
        toastManager.error('Error applying style: ' + error.message);
    }
}

/**
 * Apply single color style
 */
function applySingleColorStyle(layerId, color) {
    const layer = layerManager.getLayer(layerId);
    if (!layer) return;

    layer.color = color;

    // Re-render layer with new color
    mapManager.removeLayer(layerId);
    mapManager.createDataSource(layerId, layer.type === 'point');
    mapManager.addFeaturesToLayer(layerId, layer.features, layer.type, color);

    // Re-apply labels if they were enabled
    if (layer.type === 'polygon' && layer.showLabels) {
        mapManager.togglePolygonLabels(layerId, true, layer.features);
    }

    layerManager.notifyUpdate();
}

/**
 * Apply property-based style (Tier Map, Zone Map, etc.)
 */
function applyPropertyBasedStyle(layerId, property, styleType) {
    try {
        const layer = layerManager.getLayer(layerId);
        if (!layer) return;

        // IMPORTANT: Save the layer's visibility state before removing it
        // This prevents layers from becoming visible during real-time sync
        const wasVisible = layer.visible !== undefined ? layer.visible : true;
        const layerOpacity = layer.opacity !== undefined ? layer.opacity : 1.0;

        console.log(`🎨 Property styling for ${layer.name}: wasVisible = ${wasVisible}`);

        // Find the actual property name (case-insensitive)
        let actualPropertyName = property;
        if (layer.features.length > 0) {
            const firstFeature = layer.features[0];
            const foundKey = Object.keys(firstFeature).find(
                key => key.toLowerCase() === property.toLowerCase()
            );
            if (foundKey) {
                actualPropertyName = foundKey;
            }
        }

        // Get unique values for the property (filter out null, undefined, and empty strings)
        const uniqueValues = [...new Set(layer.features.map(f => f[actualPropertyName]))]
            .filter(v => v != null && v !== '');

        console.log('=== PROPERTY STYLING DEBUG ===');
        console.log('Property to style by:', property);
        console.log('Actual property name (case-matched):', actualPropertyName);
        console.log('Unique values found:', uniqueValues);
        console.log('Sample features (first 3):', layer.features.slice(0, 3).map(f => ({
            id: f.id,
            [actualPropertyName]: f[actualPropertyName],
            allProps: Object.keys(f)
        })));

        if (uniqueValues.length === 0) {
            toastManager.warning(`No values found for property "${property}"`);
            return;
        }

        // Define color schemes (support both number and string keys)
        const tierColors = {
            1: '#107c10',      // Green (number)
            '1': '#107c10',    // Green (string)
            'tier 1': '#107c10',
            2: '#ffb900',      // Yellow (number)
            '2': '#ffb900',    // Yellow (string)
            'tier 2': '#ffb900',
            3: '#d13438',      // Red (number)
            '3': '#d13438',    // Red (string)
            'tier 3': '#d13438'
        };

        const defaultColors = [
            '#0078d4', '#d13438', '#107c10', '#ffb900', '#8764b8',
            '#00b7c3', '#f7630c', '#ca5010', '#038387', '#486860'
        ];

        // Create color mapping
        const colorMap = {};
        uniqueValues.forEach((value, index) => {
            if (styleType === 'tier') {
                // Check direct match first (for numbers), then try string conversion
                const color = tierColors[value] || tierColors[String(value).toLowerCase()];
                if (color) {
                    colorMap[value] = color;
                } else {
                    colorMap[value] = defaultColors[index % defaultColors.length];
                }
            } else {
                colorMap[value] = defaultColors[index % defaultColors.length];
            }
        });

        console.log('Color map created:', colorMap);

        // Remove existing layer
        mapManager.removeLayer(layerId);

        // Enable clustering for point and mixed layers
        const enableClustering = layer.type === 'point' || layer.type === 'mixed';
        const dataLayer = mapManager.createDataSource(layerId, enableClustering, wasVisible);

        // Add all features to data source
        // For mixed layers, check individual feature types
        const geoJsonFeatures = layer.features.map((feature, index) => {
            let geometry;

            // Check feature type by presence of wkt (polygon) or lat/lng (point)
            if (feature.wkt) {
                geometry = mapManager.parseWKT(feature.wkt);
            } else if (feature.latitude !== undefined && feature.longitude !== undefined) {
                geometry = {
                    type: 'Point',
                    coordinates: [parseFloat(feature.longitude), parseFloat(feature.latitude)]
                };
            } else {
                return null;
            }

            return {
                type: 'Feature',
                id: feature.id || `${layerId}-${index}`,
                geometry: geometry,
                properties: { ...feature, layerId: layerId }
            };
        }).filter(f => f !== null);

        console.log('GeoJSON features created (first 3):', geoJsonFeatures.slice(0, 3).map(f => ({
            id: f.id,
            geometry: f.geometry.type,
            properties: f.properties
        })));

        // Add features to data layer
        geoJsonFeatures.forEach(geoJsonFeature => {
            dataLayer.addGeoJson(geoJsonFeature);
        });

        console.log('=== END PROPERTY STYLING DEBUG ===');

        // Apply data-driven styling for Google Maps
        // Handle polygon and mixed layers (both need polygon styling)
        const hasPolygons = layer.type === 'polygon' || layer.type === 'mixed';
        const hasPoints = layer.type === 'point' || layer.type === 'mixed';

        if (hasPolygons) {
            // For polygons and mixed layers, use data layer styling
            dataLayer.setStyle((feature) => {
                const geometry = feature.getGeometry();
                const propValue = feature.getProperty(actualPropertyName);
                const color = colorMap[propValue] || '#cccccc';

                // For mixed layers, hide points (they'll be shown as markers)
                if (layer.type === 'mixed' && geometry.getType() === 'Point') {
                    return { visible: false };
                }

                return {
                    fillColor: color,
                    fillOpacity: 0.5,
                    strokeColor: color,
                    strokeWeight: 2,
                    clickable: true
                };
            });

            // Add click event
            dataLayer.addListener('click', (event) => {
                mapManager.handleFeatureClick(event, layerId);
            });
        }

        if (hasPoints) {
            // For points and mixed layers, create markers with appropriate colors
            const markers = [];

            // For pure point layers, hide all data layer features
            // For mixed layers, we've already set conditional styling above
            if (layer.type === 'point') {
                dataLayer.setStyle({ visible: false });
            }

            // SVG path for teardrop/pin marker
            const pinPath = 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z';

            dataLayer.forEach((feature) => {
                const geometry = feature.getGeometry();
                if (geometry.getType() === 'Point') {
                    const position = geometry.get();
                    const propValue = feature.getProperty(actualPropertyName);
                    const color = colorMap[propValue] || '#cccccc';

                    // Create marker with teardrop icon
                    // Don't set map if clustering, or if layer should be hidden
                    const marker = new google.maps.Marker({
                        position: { lat: position.lat(), lng: position.lng() },
                        map: (enableClustering || !wasVisible) ? null : mapManager.map,
                        title: feature.getProperty('name') || '',
                        icon: {
                            path: pinPath,
                            fillColor: color,
                            fillOpacity: 0.9,
                            strokeColor: '#ffffff',
                            strokeWeight: 1.5,
                            scale: 0.7, // Smaller size
                            anchor: new google.maps.Point(0, 0), // Anchor at bottom point of pin
                            labelOrigin: new google.maps.Point(0, -30)
                        }
                    });

                    // Store feature reference in marker
                    marker.feature = feature;
                    marker.layerId = layerId;

                    // Add click listener
                    marker.addListener('click', () => {
                        mapManager.handleMarkerClick(marker, layerId);
                    });

                    markers.push(marker);
                }
            });

            // Store markers for later reference
            if (!mapManager.markers.has(layerId)) {
                mapManager.markers.set(layerId, []);
            }
            mapManager.markers.get(layerId).push(...markers);

            // Setup clustering if enabled
            let clusterer = null;
            if (enableClustering && markers.length > 0) {
                // Use enhanced cluster manager if available
                if (mapManager.clusterManager) {
                    clusterer = mapManager.clusterManager.initializeForLayer(layerId, markers, 'data-driven', wasVisible);
                    console.log(`Enhanced clustering initialized for ${layerId} with ${markers.length} markers`);
                } else if (typeof markerClusterer !== 'undefined' && markerClusterer.MarkerClusterer) {
                    // Fallback to basic MarkerClusterer
                    clusterer = new markerClusterer.MarkerClusterer({
                        map: wasVisible ? mapManager.map : null,
                        markers: markers
                    });
                    console.log(`MarkerClusterer initialized for ${layerId} with ${markers.length} markers`);
                } else {
                    console.warn(`Clustering requested for ${layerId} but MarkerClusterer library not loaded yet`);
                    // Fallback: add markers to map manually only if layer should be visible
                    if (wasVisible) {
                        markers.forEach(m => m.setMap(mapManager.map));
                    }
                }
            }

            // Store markers and clusterer (will be merged with layer config below)
            var pointLayerData = {
                markers: markers,
                clusterer: clusterer
            };
        }

        // Store unified layer reference (preserves original type)
        mapManager.layers.set(layerId, {
            dataLayer: dataLayer,
            ...(pointLayerData || {}), // Include markers/clusterer if hasPoints
            type: layer.type, // Preserve original type (point, polygon, or mixed)
            color: 'data-driven'
        });

        // IMPORTANT: Restore the layer's visibility state
        // This prevents layers from becoming visible during real-time sync
        if (!wasVisible) {
            mapManager.toggleLayerVisibility(layerId, false);
        }

        // Restore opacity
        if (layerOpacity !== 1.0) {
            layerManager.setLayerOpacity(layerId, layerOpacity);
        }

        // Only fit map to data source if the layer is visible
        if (wasVisible) {
            mapManager.fitMapToDataSource(dataLayer);
        }

        // Store style info
        layer.styleType = styleType;
        layer.styleProperty = actualPropertyName;
        layer.colorMap = colorMap;

        // Re-apply labels if they were enabled
        if (layer.type === 'polygon' && layer.showLabels) {
            mapManager.togglePolygonLabels(layerId, true, layer.features);
        }

        layerManager.notifyUpdate();

        toastManager.success(`Styled by ${property}`);
    } catch (error) {
        console.error('Error applying style:', error);
        toastManager.error('Error applying style: ' + error.message);
    }
}

/**
 * Show move to group dialog
 */
function showMoveToGroupDialog(layerId) {
    const groups = layerManager.getAllLayerGroups();
    const groupNames = groups.map(g => g.name);

    const groupName = prompt('Move to group:\n' + groupNames.join('\n') + '\n\nEnter group name:');
    if (!groupName) return;

    // Find group by name and get its ID
    const targetGroup = groups.find(g => g.name === groupName);

    if (!targetGroup) {
        toastManager.error('Group not found');
        return;
    }

    // Remove from all groups first
    removeLayerFromAllGroups(layerId);

    // Add to target group using the actual group ID
    addLayerToGroup(layerId, targetGroup.id);

    // Update UI
    updateLayerGroupList();
    updateLayerList(layerManager.getAllLayers());

    toastManager.success(`Layer moved to "${groupName}"`);
}

/**
 * Remove layer from all groups
 */
function removeLayerFromAllGroups(layerId) {
    layerManager.getAllLayerGroups().forEach(group => {
        if (!group.layerIds) {
            group.layerIds = [];
        }
        const index = group.layerIds.indexOf(layerId);
        if (index > -1) {
            group.layerIds.splice(index, 1);
        }
    });
    updateLayerGroupList();
}

/**
 * Update map legend
 */
function updateLegend(layers) {
    const legendContent = document.getElementById('legendContent');
    legendContent.innerHTML = '';

    const visibleLayers = layers.filter(l => l.visible);

    if (visibleLayers.length === 0) {
        legendContent.innerHTML = '<p class="empty-state">No visible layers</p>';
        return;
    }

    visibleLayers.forEach(layer => {
        // If layer has property-based styling, show color map
        if (layer.colorMap) {
            const legendSection = document.createElement('div');
            legendSection.style.marginBottom = '1rem';

            const title = document.createElement('div');
            title.style.fontWeight = '600';
            title.style.marginBottom = '0.5rem';
            title.textContent = layer.name;
            legendSection.appendChild(title);

            Object.entries(layer.colorMap).forEach(([value, color]) => {
                const item = document.createElement('div');
                item.className = 'legend-item';
                item.innerHTML = `
                    <div class="legend-color" style="background-color: ${color}"></div>
                    <span>${value}</span>
                `;
                legendSection.appendChild(item);
            });

            legendContent.appendChild(legendSection);
        } else {
            // Standard legend item
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `
                <div class="legend-color" style="background-color: ${layer.color}"></div>
                <span>${layer.name} (${layer.features.length})</span>
            `;
            legendContent.appendChild(item);
        }
    });
}

/**
 * Handle feature selection on map
 */
function handleFeatureSelection(selectedFeature) {
    stateManager.set('currentEditingFeature', selectedFeature);
    updateFeatureInfo(selectedFeature.properties);
    console.log('Feature selected:', selectedFeature);
}

/**
 * Update feature info panel - Show all CSV properties
 */
function updateFeatureInfo(properties) {
    const featureInfo = document.getElementById('featureInfo');
    featureInfo.innerHTML = '';

    // Handle null/undefined properties
    if (!properties || typeof properties !== 'object') {
        featureInfo.innerHTML = '<p class="empty-state">No details available</p>';
        return;
    }

    // Internal/technical properties to skip (not useful for display)
    const skipProps = ['layerId', 'wkt', 'geometry', 'latitude', 'longitude', 'lat', 'lng', 'id'];

    // Priority properties to show first (if they exist)
    const priorityProps = ['name', 'Name', 'NAME', 'description', 'Description', 'DESCRIPTION',
                           'tier', 'Tier', 'TIER', 'bdm', 'BDM', 'Bdm'];

    // Helper to format property labels nicely
    const formatLabel = (key) => {
        // Convert camelCase or snake_case to Title Case
        return key
            .replace(/([A-Z])/g, ' $1') // Add space before capitals
            .replace(/_/g, ' ')          // Replace underscores with spaces
            .replace(/^\s+/, '')         // Remove leading space
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    let hasData = false;
    const displayedKeys = new Set();

    // First, display priority properties in order (if they exist)
    priorityProps.forEach(key => {
        if (properties.hasOwnProperty(key) && !displayedKeys.has(key.toLowerCase())) {
            const value = properties[key];
            if (value !== null && value !== undefined && value !== '') {
                hasData = true;
                displayedKeys.add(key.toLowerCase());
                const propDiv = document.createElement('div');
                propDiv.className = 'feature-property';
                propDiv.innerHTML = `
                    <span class="property-label">${formatLabel(key)}:</span>
                    <span class="property-value">${value}</span>
                `;
                featureInfo.appendChild(propDiv);
            }
        }
    });

    // Then display all remaining properties
    Object.entries(properties).forEach(([key, value]) => {
        // Skip internal properties, already displayed properties, and empty values
        if (skipProps.includes(key) || skipProps.includes(key.toLowerCase())) return;
        if (displayedKeys.has(key.toLowerCase())) return;
        if (value === null || value === undefined || value === '') return;

        hasData = true;
        displayedKeys.add(key.toLowerCase());
        const propDiv = document.createElement('div');
        propDiv.className = 'feature-property';
        propDiv.innerHTML = `
            <span class="property-label">${formatLabel(key)}:</span>
            <span class="property-value">${value}</span>
        `;
        featureInfo.appendChild(propDiv);
    });

    if (!hasData) {
        featureInfo.innerHTML = '<p class="empty-state">No details available</p>';
        return;
    }

    // Add color picker (only if layer has no property-based styling)
    if (mapManager.selectedFeature) {
        const layerId = mapManager.selectedFeature.layerId;
        const layer = layerManager.layers.get(layerId);

        // Only show color picker if layer doesn't have property-based styling
        if (layer && !layer.styleType) {
            const colorContainer = document.createElement('div');
            colorContainer.style.marginTop = '1rem';
            colorContainer.style.padding = '0.75rem';
            colorContainer.style.backgroundColor = '#f5f5f5';
            colorContainer.style.borderRadius = '4px';
            colorContainer.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <label style="font-weight: 500; margin: 0;">Feature Color:</label>
                    <input type="color" id="featureColorPicker" value="${properties.color || layer.color || '#3388ff'}"
                           style="width: 50px; height: 30px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">
                    <button id="clearFeatureColor" class="btn btn-secondary" style="font-size: 0.875rem; padding: 0.25rem 0.5rem;">
                        Reset
                    </button>
                </div>
                <div style="font-size: 0.75rem; color: #666;">
                    Set a custom color for this feature
                </div>
            `;
            featureInfo.appendChild(colorContainer);

            // Add event listeners
            const colorPicker = colorContainer.querySelector('#featureColorPicker');
            const clearBtn = colorContainer.querySelector('#clearFeatureColor');

            colorPicker.addEventListener('change', (e) => {
                const featureId = mapManager.selectedFeature.feature.getId();
                mapManager.setFeatureColor(layerId, featureId, e.target.value);

                // Update feature data in layerManager
                const featureIndex = layer.features.findIndex(f => f.id === featureId);
                if (featureIndex !== -1) {
                    layer.features[featureIndex].color = e.target.value;
                    layerManager.layers.set(layerId, layer);
                }

                toastManager.success('Feature color updated');
            });

            clearBtn.addEventListener('click', () => {
                const featureId = mapManager.selectedFeature.feature.getId();
                mapManager.clearFeatureColor(layerId, featureId);

                // Remove color from feature data
                const featureIndex = layer.features.findIndex(f => f.id === featureId);
                if (featureIndex !== -1) {
                    delete layer.features[featureIndex].color;
                    layerManager.layers.set(layerId, layer);
                }

                colorPicker.value = layer.color || '#3388ff';
                toastManager.success('Feature color reset to layer default');
            });
        }
    }

    // Add button container
    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '0.5rem';
    btnContainer.style.marginTop = '1rem';

    // Add edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-primary';
    editBtn.textContent = 'Edit';
    editBtn.style.flex = '1';
    editBtn.addEventListener('click', openEditModal);
    btnContainer.appendChild(editBtn);

    // Add delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.flex = '1';
    deleteBtn.addEventListener('click', handleDeleteFeatureFromInfo);
    btnContainer.appendChild(deleteBtn);

    featureInfo.appendChild(btnContainer);
}

/**
 * Handle deleting a feature from the info panel
 */
function handleDeleteFeatureFromInfo() {
    const currentEditingFeature = stateManager.get('currentEditingFeature');
    if (!currentEditingFeature) return;

    const featureName = currentEditingFeature.properties?.name || 'this feature';
    if (!confirm(`Delete ${featureName}?`)) {
        return;
    }

    layerManager.deleteFeature(currentEditingFeature.layerId, currentEditingFeature.id);

    // Clear selection
    mapManager.clearSelectedFeature();
    stateManager.set('currentEditingFeature', null);

    // Reset feature info panel
    document.getElementById('featureInfo').innerHTML =
        '<p class="empty-state">Click on a feature to see details</p>';

    toastManager.success('Feature deleted');
}

/**
 * Open edit modal
 */
function openEditModal() {
    const currentEditingFeature = stateManager.get('currentEditingFeature');
    if (!currentEditingFeature) {
        toastManager.warning('No feature selected');
        return;
    }

    const formFields = document.getElementById('editFormFields');
    formFields.innerHTML = '';

    const properties = currentEditingFeature.properties || {};

    // Helper function to create form field
    const createFormField = (key, value = '') => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';

        const label = document.createElement('label');
        label.textContent = key.charAt(0).toUpperCase() + key.slice(1);
        label.setAttribute('for', `edit_${key}`);

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `edit_${key}`;
        input.name = key;
        input.value = value || '';

        formGroup.appendChild(label);
        formGroup.appendChild(input);
        formFields.appendChild(formGroup);
    };

    // Priority fields that should always be shown first
    const priorityFields = ['name', 'description', 'territory', 'bdm', 'tier'];
    const systemFields = ['layerid', 'wkt', 'id'];
    const addedFields = new Set();

    // Add priority fields first (always visible)
    priorityFields.forEach(field => {
        const value = properties[field] || properties[field.toLowerCase()] ||
                     properties[field.toUpperCase()] ||
                     properties[field.charAt(0).toUpperCase() + field.slice(1)] || '';

        createFormField(field, value);
        addedFields.add(field.toLowerCase());
    });

    // Add remaining properties (except system fields and already added)
    for (let [key, value] of Object.entries(properties)) {
        const keyLower = key.toLowerCase();
        if (systemFields.includes(keyLower) || addedFields.has(keyLower)) continue;

        createFormField(key, value);
    }

    modalManager.show('editModal');
}

/**
 * Handle edit form submission
 */
function handleEditFormSubmit(e) {
    e.preventDefault();

    const currentEditingFeature = stateManager.get('currentEditingFeature');
    if (!currentEditingFeature) return;

    const formData = new FormData(e.target);
    const updatedProperties = {};

    for (let [key, value] of formData.entries()) {
        updatedProperties[key] = value;
    }

    // Get the feature ID from properties or the feature itself
    const featureId = currentEditingFeature.properties?.id || currentEditingFeature.id;

    layerManager.updateFeature(
        currentEditingFeature.layerId,
        featureId,
        updatedProperties
    );

    // Update the stored feature with new properties
    const updatedFeature = {
        ...currentEditingFeature,
        properties: { ...currentEditingFeature.properties, ...updatedProperties }
    };
    stateManager.set('currentEditingFeature', updatedFeature);

    updateFeatureInfo(updatedFeature.properties);

    modalManager.close('editModal');
    toastManager.success('Feature updated');
}

/**
 * Handle delete feature
 */
function handleDeleteFeature() {
    const currentEditingFeature = stateManager.get('currentEditingFeature');
    if (!currentEditingFeature) return;

    if (confirm('Delete this feature?')) {
        const featureId = currentEditingFeature.properties?.id || currentEditingFeature.id;

        layerManager.deleteFeature(
            currentEditingFeature.layerId,
            featureId
        );

        modalManager.close('editModal');
        mapManager.clearSelectedFeature();

        document.getElementById('featureInfo').innerHTML =
            '<p class="empty-state">Click on a feature to see details</p>';

        stateManager.set('currentEditingFeature', null);

        toastManager.success('Feature deleted');
    }
}

/**
 * Handle apply filter
 */
function handleApplyFilter() {
    const column = document.getElementById('filterColumn').value;
    const value = document.getElementById('filterValue').value;

    if (!column || !value) {
        toastManager.warning('Please select a column and enter a filter value');
        return;
    }

    const layers = layerManager.getAllLayers();
    layers.forEach(layer => {
        if (layer.visible) {
            layerManager.applyFilter(layer.id, column, value);
        }
    });

    toastManager.success(`Filter applied: ${column} contains "${value}"`);
    modalManager.close('filterModal');
}

/**
 * Handle clear filter
 */
function handleClearFilter() {
    const layers = layerManager.getAllLayers();
    layers.forEach(layer => {
        layerManager.clearFilter(layer.id);
    });

    document.getElementById('filterValue').value = '';
    toastManager.success('Filters cleared');
}

/**
 * Handle sort
 */
function handleSort(direction) {
    const column = document.getElementById('sortColumn').value;

    if (!column) {
        toastManager.warning('Please select a column to sort by');
        return;
    }

    const layers = layerManager.getAllLayers();
    layers.forEach(layer => {
        layerManager.sortLayer(layer.id, column, direction);
    });

    toastManager.success(`Sorted by ${column} (${direction})`);
    modalManager.close('filterModal');
}

/**
 * Update column selects
 */
function updateColumnSelects() {
    const columns = layerManager.getAllColumnNames();

    const filterSelect = document.getElementById('filterColumn');
    const sortSelect = document.getElementById('sortColumn');

    const currentFilter = filterSelect.value;
    const currentSort = sortSelect.value;

    filterSelect.innerHTML = '<option value="">Select column...</option>';
    sortSelect.innerHTML = '<option value="">Sort by...</option>';

    columns.forEach(col => {
        const option1 = document.createElement('option');
        option1.value = col;
        option1.textContent = col;
        filterSelect.appendChild(option1);

        const option2 = document.createElement('option');
        option2.value = col;
        option2.textContent = col;
        sortSelect.appendChild(option2);
    });

    if (columns.includes(currentFilter)) filterSelect.value = currentFilter;
    if (columns.includes(currentSort)) sortSelect.value = currentSort;
}

/**
 * Handle save to Firebase
 */
async function handleSaveToFirebase() {
    if (isReadOnly()) {
        toastManager.error('This workspace is read-only. You do not have permission to save.');
        return;
    }

    const currentProfile = stateManager.getCurrentProfile();

    if (!currentProfile) {
        toastManager.error('No workspace selected');
        return;
    }

    loadingManager.show('Saving to Supabase...');

    // Temporarily disable real-time listener to prevent feedback loop
    const wasListening = realtimeListenerEnabled;
    if (wasListening) {
        firebaseManager.stopListening();
        realtimeListenerEnabled = false;
    }

    try {
        const layersData = layerManager.exportAllLayers();
        const groupsData = Array.from(layerManager.layerGroups.values());

        const dataToSave = {
            ...layersData,
            _groups: groupsData
        };

        // Calculate hash of data being saved (for echo detection)
        lastSaveHash = simpleHash(JSON.stringify(dataToSave));
        console.log('💾 Manual save with hash:', lastSaveHash);

        await firebaseManager.saveAllLayers(dataToSave, currentProfile.name);

        loadingManager.hide();
        toastManager.success(`Data saved to Supabase for workspace: ${currentProfile.name}`);

        // Re-enable listener after save completes
        // Listener will ignore echoes of this save using hash comparison
        if (wasListening) {
            setTimeout(() => {
                enableRealtimeSync();
            }, 2000); // 2 second delay for Supabase to propagate
        }
    } catch (error) {
        console.error('Error saving to Supabase:', error);
        loadingManager.hide();
        toastManager.error('Error saving to Supabase: ' + error.message);

        // Re-enable listener even on error (hash will prevent issues)
        if (wasListening) {
            setTimeout(() => {
                enableRealtimeSync();
            }, 2000);
        }
    }
}

/**
 * Handle load from Firebase
 */
async function handleLoadFromFirebase() {
    const currentProfile = stateManager.getCurrentProfile();

    if (!currentProfile) {
        toastManager.error('No workspace selected');
        return;
    }

    if (layerManager.getAllLayers().length > 0) {
        if (!confirm('Loading from Supabase will replace current data. Continue?')) {
            return;
        }
    }

    loadingManager.show(`Loading from Supabase for workspace: ${currentProfile.name}...`);

    try {
        const result = await firebaseManager.loadAllLayers();

        if (result.layers && Object.keys(result.layers).length > 0) {
            // Store the timestamp of this data load to ignore stale real-time updates
            lastProfileLoadTimestamp = result.layers._timestamp ? parseInt(result.layers._timestamp) : Date.now();
            console.log('📌 Manual load timestamp set to:', lastProfileLoadTimestamp);

            // Load groups if available
            if (result.layers._groups) {
                layerManager.layerGroups.clear();
                result.layers._groups.forEach(g => {
                    layerManager.layerGroups.set(g.id, g);
                });
                delete result.layers._groups;
            }

            layerManager.importLayers(result.layers);

            // Ensure "All Layers" group exists
            let currentAllLayersGroupId = stateManager.get('allLayersGroupId');
            if (!currentAllLayersGroupId || !layerManager.layerGroups.has(currentAllLayersGroupId)) {
                // Try to find existing "All Layers" group by name
                let foundGroupId = null;
                layerManager.getAllLayerGroups().forEach(group => {
                    if (group.name === 'All Layers') {
                        foundGroupId = group.id;
                    }
                });

                if (foundGroupId) {
                    // Found existing group, update stateManager
                    stateManager.set('allLayersGroupId', foundGroupId, true);
                    currentAllLayersGroupId = foundGroupId;
                } else {
                    // Create a new one
                    currentAllLayersGroupId = createLayerGroup('All Layers');
                }
            }

            // Ensure all layers are in the "All Layers" group
            const allLayersGroup = layerManager.layerGroups.get(currentAllLayersGroupId);
            if (allLayersGroup) {
                layerManager.getAllLayers().forEach(layer => {
                    addLayerToGroup(layer.id, currentAllLayersGroupId);
                });
            }

            // Re-apply property-based styling for layers that have it
            layerManager.getAllLayers().forEach(layer => {
                if (layer.styleType && layer.styleProperty) {
                    applyPropertyBasedStyle(layer.id, layer.styleProperty, layer.styleType);
                }
                // Re-apply labels if they were enabled
                if (layer.type === 'polygon' && layer.showLabels) {
                    mapManager.togglePolygonLabels(layer.id, true, layer.features);
                }
            });

            loadingManager.hide();
            toastManager.success('Data loaded from Supabase successfully');
        } else {
            loadingManager.hide();
            toastManager.show('No data found in Supabase', 'info');
        }
    } catch (error) {
        console.error('Error loading from Supabase:', error);
        loadingManager.hide();
        toastManager.error('Error loading from Supabase: ' + error.message);
    }
}

/**
 * Enable real-time Supabase sync
 */
function enableRealtimeSync() {
    if (realtimeListenerEnabled) return;

    firebaseManager.listenForUpdates((updatedLayers) => {
        console.log('📥 Real-time update received from Supabase');

        // Check timestamp to detect echoes
        const incomingTimestamp = updatedLayers._timestamp;
        console.log('   Incoming timestamp:', incomingTimestamp);
        console.log('   Last save timestamp:', lastSaveHash);
        console.log('   Last profile load timestamp:', lastProfileLoadTimestamp);

        // Ignore if this is an echo of our own save
        if (incomingTimestamp === lastSaveHash && lastSaveHash !== null) {
            console.log('⏭️  Ignoring echo of own save');
            return;
        }

        // Ignore stale updates that are older than or equal to our last profile load
        // This prevents old Firebase updates from overwriting fresh data after profile switch
        if (lastProfileLoadTimestamp && incomingTimestamp && parseInt(incomingTimestamp) <= lastProfileLoadTimestamp) {
            console.log('⏭️  Ignoring stale/duplicate update (not newer than current profile data)');
            return;
        }

        if (Object.keys(updatedLayers).length > 0 && !document.getElementById('editModal').classList.contains('show')) {
            console.log('🔄 Processing real-time update from another user/session');

            // Set importing flag to prevent auto-save during import
            isImporting = true;

            if (updatedLayers._groups) {
                layerManager.layerGroups.clear();
                updatedLayers._groups.forEach(g => {
                    layerManager.layerGroups.set(g.id, g);
                });
                delete updatedLayers._groups;
            }

            layerManager.importLayers(updatedLayers);

            // Ensure "All Layers" group exists
            let currentAllLayersGroupId = stateManager.get('allLayersGroupId');
            if (!currentAllLayersGroupId || !layerManager.layerGroups.has(currentAllLayersGroupId)) {
                // Try to find existing "All Layers" group by name
                let foundGroupId = null;
                layerManager.getAllLayerGroups().forEach(group => {
                    if (group.name === 'All Layers') {
                        foundGroupId = group.id;
                    }
                });

                if (foundGroupId) {
                    // Found existing group, update stateManager
                    stateManager.set('allLayersGroupId', foundGroupId, true);
                    currentAllLayersGroupId = foundGroupId;
                } else {
                    // Create a new one
                    currentAllLayersGroupId = createLayerGroup('All Layers');
                }
            }

            // Ensure all layers are in the "All Layers" group
            const allLayersGroup = layerManager.layerGroups.get(currentAllLayersGroupId);
            if (allLayersGroup) {
                layerManager.getAllLayers().forEach(layer => {
                    addLayerToGroup(layer.id, currentAllLayersGroupId);
                });
            }

            // Re-apply property-based styling for layers that have it
            layerManager.getAllLayers().forEach(layer => {
                if (layer.styleType && layer.styleProperty) {
                    applyPropertyBasedStyle(layer.id, layer.styleProperty, layer.styleType);
                }
                // Re-apply labels if they were enabled
                if (layer.type === 'polygon' && layer.showLabels) {
                    mapManager.togglePolygonLabels(layer.id, true, layer.features);
                }
            });

            toastManager.show('Data synced from Supabase', 'info');

            // Update our load timestamp to this incoming data so we don't reprocess it
            if (incomingTimestamp) {
                lastProfileLoadTimestamp = parseInt(incomingTimestamp);
                console.log('📌 Updated profile load timestamp to:', lastProfileLoadTimestamp);
            }

            // Clear importing flag after rendering completes
            // Use requestAnimationFrame to ensure map rendering has finished
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    isImporting = false;
                    console.log('✅ Import complete, auto-save re-enabled');
                });
            });
        }
    });

    realtimeListenerEnabled = true;
    console.log('🔄 Real-time Firebase sync enabled with echo detection');
}

// ==================== BULK OPERATIONS ====================

/**
 * Mass update all feature names to use account names where applicable
 */
function massUpdateNamesToAccountNames() {
    let updatedCount = 0;
    const layers = layerManager.getAllLayers();

    layers.forEach(layer => {
        let layerUpdated = false;

        layer.features.forEach(feature => {
            // Try to find account name property in various formats (case-insensitive)
            let accountName = null;

            // List of possible property names for account name (in order of priority)
            const accountNameKeys = [
                'accountName',       // camelCase
                'AccountName',       // PascalCase
                'account_name',      // snake_case
                'Account Name',      // Title Case with space
                'account name',      // lowercase with space
                'ACCOUNT NAME',      // uppercase with space
                'Account_Name'       // Title_Snake_Case
            ];

            // Find first matching key (case-sensitive exact match first)
            for (const key of accountNameKeys) {
                if (feature[key]) {
                    accountName = feature[key];
                    break;
                }
            }

            // If no exact match, try case-insensitive search
            if (!accountName) {
                const featureKeys = Object.keys(feature);
                const matchKey = featureKeys.find(k =>
                    k.toLowerCase().replace(/[_\s]/g, '') === 'accountname'
                );
                if (matchKey) {
                    accountName = feature[matchKey];
                }
            }

            // Update name if account name found and it differs from current name
            if (accountName && accountName !== feature.name) {
                feature.name = accountName;
                updatedCount++;
                layerUpdated = true;
            }
        });

        // If layer was updated, refresh it on the map
        if (layerUpdated) {
            // Remove and re-add layer to map to reflect name changes
            mapManager.removeLayer(layer.id);
            const color = mapManager.addFeaturesToLayer(
                layer.id,
                layer.features,
                layer.type,
                layer.color,
                layer.visible
            );
            layer.color = color;

            // Reapply any special styling
            if (layer.styleType && layer.styleProperty) {
                applyPropertyBasedStyle(layer.id, layer.styleProperty, layer.styleType);
            }

            // Reapply labels if enabled
            if (layer.type === 'polygon' && layer.showLabels) {
                mapManager.togglePolygonLabels(layer.id, true, layer.features);
            }
        }
    });

    // Save changes
    saveToLocalStorage();

    if (updatedCount > 0) {
        toastManager.success(`Updated ${updatedCount} feature name(s) to account names`);
    } else {
        toastManager.show('No features found with account names to update', 'info');
    }

    return updatedCount;
}

// ==================== PROFILE MANAGEMENT ====================

/**
 * Initialize profiles on app start
 */
async function initializeProfiles() {
    try {
        loadingManager.show('Loading workspaces...');

        // First, try to migrate old data if needed
        const migrationResult = await firebaseManager.migrateToProfiles('Default Workspace');

        if (migrationResult.migrated) {
            console.log('Migrated old data to default profile');
            toastManager.success('Your data has been migrated to the new workspace system');
        }

        // Load all profiles
        const profiles = await firebaseManager.getAllProfiles();
        stateManager.updateProfiles(profiles);

        // Check for saved profile preference
        let currentProfile = stateManager.loadCurrentProfilePreference();

        // If no saved preference or saved profile doesn't exist, use first available or create new
        if (!currentProfile || !profiles.find(p => p.id === currentProfile.id)) {
            if (profiles.length > 0) {
                currentProfile = profiles[0];
            } else {
                // No profiles exist, create default one
                const result = await firebaseManager.createProfile('Default Workspace');
                currentProfile = {
                    id: result.profileId,
                    name: result.profileName,
                    createdAt: result.createdAt
                };
                stateManager.updateProfiles([currentProfile]);
            }
        }

        // Set current profile
        await switchProfile(currentProfile.id, false);

        // Update profile selector UI
        updateProfileSelector();

        loadingManager.hide();
    } catch (error) {
        console.error('Error initializing profiles:', error);
        loadingManager.hide();
        toastManager.error('Error loading workspaces: ' + error.message);
    }
}

/**
 * Update the drawing target layer dropdown
 */
function updateDrawTargetLayerDropdown() {
    const dropdown = document.getElementById('drawTargetLayer');
    if (!dropdown) return;

    const layers = layerManager.getAllLayers();

    // Clear existing options except the first one
    dropdown.innerHTML = '<option value="">First available layer (create new if none)</option>';

    // Add each layer as an option
    layers.forEach(layer => {
        const option = document.createElement('option');
        option.value = layer.id;
        option.textContent = `${layer.name} (${layer.type})`;
        dropdown.appendChild(option);
    });

    // If there's only one layer, select it by default
    if (layers.length === 1) {
        dropdown.value = layers[0].id;
    }
}

/**
 * Update profile selector dropdown
 */
function updateProfileSelector() {
    const profileSelect = document.getElementById('profileSelect');
    const profiles = stateManager.getProfiles();
    const currentProfile = stateManager.getCurrentProfile();

    profileSelect.innerHTML = '';

    if (profiles.length === 0) {
        profileSelect.innerHTML = '<option value="">No Workspaces</option>';
        return;
    }

    profiles.forEach(profile => {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = profile.name;
        option.selected = currentProfile && profile.id === currentProfile.id;
        profileSelect.appendChild(option);
    });
}

/**
 * Switch to a different profile
 * @param {string} profileId - Profile ID to switch to
 * @param {boolean} showLoading - Show loading indicator
 */
async function switchProfile(profileId, showLoading = true) {
    try {
        if (showLoading) {
            loadingManager.show('Switching workspace...');
        }

        // IMPORTANT: Disable real-time sync BEFORE switching to prevent race conditions
        if (realtimeListenerEnabled) {
            firebaseManager.stopListening();
            realtimeListenerEnabled = false;
            console.log('⏸️  Real-time sync temporarily disabled for profile switch');
        }

        // Find profile in list
        const profiles = stateManager.getProfiles();
        const profile = profiles.find(p => p.id === profileId);

        if (!profile) {
            throw new Error('Profile not found');
        }

        // Note: In Supabase-only mode, no need to save to localStorage before switching
        // All data is managed through Supabase and real-time sync

        // Clear current map and layers
        layerManager.clearAllLayers();
        mapManager.clearMap();

        // Clear layer groups
        layerManager.layerGroups.clear();
        stateManager.set('allLayersGroupId', null, true);

        // Set current profile in state and supabase manager (role from workspace_members is included)
        stateManager.setCurrentProfile(profile);
        firebaseManager.setCurrentProfile(profileId);

        // Reflect read-only state in the UI
        _applyReadOnlyUI(isReadOnly());

        // Save profile preference
        stateManager.saveCurrentProfilePreference();

        // Load data for this profile from Firebase
        const result = await firebaseManager.loadAllLayers();

        if (result.layers && Object.keys(result.layers).length > 0) {
            // Store the timestamp of this data load to ignore stale real-time updates
            // Use the data's timestamp if available, otherwise use current time
            lastProfileLoadTimestamp = result.layers._timestamp ? parseInt(result.layers._timestamp) : Date.now();
            console.log('📌 Profile load timestamp set to:', lastProfileLoadTimestamp);

            // Load groups if available
            if (result.layers._groups) {
                result.layers._groups.forEach(g => {
                    layerManager.layerGroups.set(g.id, g);
                    // If this is the default "All Layers" group, set it in state
                    if (g.metadata && g.metadata.isDefault) {
                        stateManager.set('allLayersGroupId', g.id, true);
                    }
                });
                delete result.layers._groups;
            }

            layerManager.importLayers(result.layers);

            // Ensure "All Layers" group exists (will use existing if found above)
            ensureDefaultLayerGroup();

            // Re-apply styling
            layerManager.getAllLayers().forEach(layer => {
                if (layer.styleType && layer.styleProperty) {
                    applyPropertyBasedStyle(layer.id, layer.styleProperty, layer.styleType);
                }
                if (layer.type === 'polygon' && layer.showLabels) {
                    mapManager.togglePolygonLabels(layer.id, true, layer.features);
                }
            });
        } else {
            // No data for this profile, create fresh default group
            ensureDefaultLayerGroup();
        }

        // Update UI
        updateProfileSelector();
        updateLayerGroupList();
        updateLayerList(layerManager.getAllLayers());

        // Re-enable real-time sync for the new profile
        enableRealtimeSync();

        // Emit profile.switched event for activity log
        eventBus.emit('profile.switched', {
            profileId: profileId,
            profileName: profile.name
        });

        if (showLoading) {
            loadingManager.hide();
            toastManager.success(`Switched to workspace: ${profile.name}`);
        }

        console.log(`Switched to profile: ${profile.name} (${profileId})`);
    } catch (error) {
        console.error('Error switching profile:', error);
        if (showLoading) {
            loadingManager.hide();
        }
        toastManager.error('Error switching workspace: ' + error.message);
    }
}

/**
 * Handle profile selection change
 */
async function handleProfileChange() {
    const profileSelect = document.getElementById('profileSelect');
    const selectedProfileId = profileSelect.value;
    const currentProfile = stateManager.getCurrentProfile();

    if (!selectedProfileId || selectedProfileId === currentProfile?.id) {
        return;
    }

    // Auto-save if there are unsaved changes
    if (stateManager.get('isDirty')) {
        console.log('🔄 Auto-saving before workspace switch...');
        loadingManager.show('Saving current workspace...');

        try {
            // Save immediately (bypass debounce)
            if (autoSaveTimeout) {
                clearTimeout(autoSaveTimeout);
            }

            // Set timestamp to ignore our own echo
            lastSaveHash = Date.now().toString();

            // Temporarily disable listener to prevent feedback loop
            const wasListening = realtimeListenerEnabled;
            if (wasListening) {
                firebaseManager.stopListening();
                realtimeListenerEnabled = false;
            }

            isSavingToFirebase = true;

            const layersData = layerManager.exportAllLayers();
            const groupsData = Array.from(layerManager.layerGroups.values());

            const dataToSave = {
                ...layersData,
                _groups: groupsData,
                _timestamp: lastSaveHash
            };

            await firebaseManager.saveAllLayers(dataToSave, currentProfile.name);

            console.log('✅ Workspace saved before switch');

            // Re-enable listener will happen after profile switch loads new data
            isSavingToFirebase = false;
            stateManager.set('isDirty', false);

            loadingManager.hide();
        } catch (error) {
            console.error('❌ Error saving before switch:', error);
            isSavingToFirebase = false;
            loadingManager.hide();
            toastManager.error('Failed to save workspace: ' + error.message);
            profileSelect.value = currentProfile.id;
            return;
        }
    }

    await switchProfile(selectedProfileId);
}

/**
 * Show profile management modal
 */
async function showProfileManagementModal() {
    try {
        // Refresh profiles list from Firebase
        const profiles = await firebaseManager.getAllProfiles();
        stateManager.updateProfiles(profiles);

        // Update profile list in modal
        updateProfileList();

        modalManager.show('profileManagementModal');
    } catch (error) {
        console.error('Error loading profiles:', error);
        toastManager.error('Error loading workspaces: ' + error.message);
    }
}

/**
 * Update profile list in modal
 */
function updateProfileList() {
    const profileList = document.getElementById('profileList');
    const profiles = stateManager.getProfiles();
    const currentProfile = stateManager.getCurrentProfile();

    if (profiles.length === 0) {
        profileList.innerHTML = '<p class="empty-state">No workspaces yet. Create one above!</p>';
        return;
    }

    profileList.innerHTML = '';

    profiles.forEach(profile => {
        const div = document.createElement('div');
        div.className = `profile-item ${profile.id === currentProfile?.id ? 'current' : ''}`;

        const roleBadge = profile.role && profile.role !== 'admin'
            ? `<span class="role-badge" style="font-size:11px; padding:2px 6px; background:#f0f0f0; border-radius:10px; margin-left:6px; text-transform:capitalize;">${profile.role}</span>`
            : '';
        const membersBtn = profile.role === 'admin'
            ? `<button class="btn btn-small btn-secondary" onclick="handleManageMembers('${profile.id}')">Members</button>`
            : '';

        div.innerHTML = `
            <div class="profile-item-info">
                <div class="profile-item-name">${profile.name}${roleBadge}</div>
                <div class="profile-item-meta">
                    ${profile.layerCount} layer${profile.layerCount !== 1 ? 's' : ''} •
                    Created: ${new Date(profile.createdAt).toLocaleDateString()}
                </div>
            </div>
            <div class="profile-item-actions">
                ${profile.role !== 'viewer' ? `<button class="btn btn-small btn-secondary" onclick="handleRenameProfile('${profile.id}')">Rename</button>` : ''}
                ${membersBtn}
                ${profile.id !== currentProfile?.id && profile.role === 'admin' ? `<button class="btn btn-small btn-danger" onclick="handleDeleteProfile('${profile.id}')">Delete</button>` : ''}
            </div>
        `;

        profileList.appendChild(div);
    });
}

/**
 * Handle create new profile
 */
async function handleCreateProfile() {
    const input = document.getElementById('newProfileName');
    const profileName = input.value.trim();

    if (!profileName) {
        toastManager.error('Please enter a workspace name');
        return;
    }

    try {
        loadingManager.show('Creating workspace...');

        const result = await firebaseManager.createProfile(profileName);

        // Refresh profiles list
        const profiles = await firebaseManager.getAllProfiles();
        stateManager.updateProfiles(profiles);

        // Update UI
        updateProfileList();
        updateProfileSelector();

        input.value = '';

        loadingManager.hide();
        toastManager.success(`Workspace "${profileName}" created successfully`);
    } catch (error) {
        console.error('Error creating profile:', error);
        loadingManager.hide();
        toastManager.error('Error creating workspace: ' + error.message);
    }
}

/**
 * Handle rename profile
 * @param {string} profileId - Profile ID to rename
 */
async function handleRenameProfile(profileId) {
    const profiles = stateManager.getProfiles();
    const profile = profiles.find(p => p.id === profileId);

    if (!profile) {
        return;
    }

    const newName = prompt('Enter new workspace name:', profile.name);

    if (!newName || newName.trim() === '' || newName === profile.name) {
        return;
    }

    try {
        loadingManager.show('Renaming workspace...');

        await firebaseManager.renameProfile(profileId, newName.trim());

        // Refresh profiles
        const updatedProfiles = await firebaseManager.getAllProfiles();
        stateManager.updateProfiles(updatedProfiles);

        // Update current profile if this is the active one
        const currentProfile = stateManager.getCurrentProfile();
        if (currentProfile && currentProfile.id === profileId) {
            stateManager.setCurrentProfile({ ...currentProfile, name: newName.trim() });
            stateManager.saveCurrentProfilePreference();
        }

        // Update UI
        updateProfileList();
        updateProfileSelector();

        loadingManager.hide();
        toastManager.success('Workspace renamed successfully');
    } catch (error) {
        console.error('Error renaming profile:', error);
        loadingManager.hide();
        toastManager.error('Error renaming workspace: ' + error.message);
    }
}

/**
 * Handle delete profile
 * @param {string} profileId - Profile ID to delete
 */
async function handleDeleteProfile(profileId) {
    const profiles = stateManager.getProfiles();
    const profile = profiles.find(p => p.id === profileId);
    const currentProfile = stateManager.getCurrentProfile();

    if (!profile) {
        return;
    }

    // Can't delete current profile
    if (currentProfile && profileId === currentProfile.id) {
        toastManager.error('Cannot delete the active workspace. Switch to another workspace first.');
        return;
    }

    if (!confirm(`Are you sure you want to delete the workspace "${profile.name}"? This action cannot be undone.`)) {
        return;
    }

    try {
        loadingManager.show('Deleting workspace...');

        await firebaseManager.deleteProfile(profileId);

        // Refresh profiles
        const updatedProfiles = await firebaseManager.getAllProfiles();
        stateManager.updateProfiles(updatedProfiles);

        // Update UI
        updateProfileList();
        updateProfileSelector();

        loadingManager.hide();
        toastManager.success('Workspace deleted successfully');
    } catch (error) {
        console.error('Error deleting profile:', error);
        loadingManager.hide();
        toastManager.error('Error deleting workspace: ' + error.message);
    }
}

/**
 * Handle managing workspace members (admin only).
 * Opens a simple modal built from the existing modal system.
 * @param {string} profileId
 */
async function handleManageMembers(profileId) {
    const profiles = stateManager.getProfiles();
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;

    // Fetch current members
    let members = [];
    try {
        members = await supabaseManager.getWorkspaceMembers(profileId);
    } catch (err) {
        toastManager.error('Failed to load members: ' + err.message);
        return;
    }

    const currentUser = authManager.getCurrentUser();
    const membersHtml = members.map(m => `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid #eee;">
            <span style="font-size:13px;">${m.user_id === currentUser?.id ? '(you) ' : ''}${m.user_id}</span>
            <div style="display:flex; gap:6px; align-items:center;">
                <select onchange="supabaseManager.updateMemberRole('${profileId}','${m.user_id}',this.value)" style="font-size:12px; padding:2px 4px;">
                    <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="editor" ${m.role === 'editor' ? 'selected' : ''}>Editor</option>
                    <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                </select>
                ${m.user_id !== currentUser?.id ? `<button class="btn btn-small btn-danger" onclick="supabaseManager.removeMember('${profileId}','${m.user_id}').then(()=>handleManageMembers('${profileId}'))">Remove</button>` : ''}
            </div>
        </div>
    `).join('');

    // Build or reuse a dynamic members modal
    let membersModal = document.getElementById('membersModal');
    if (!membersModal) {
        membersModal = document.createElement('div');
        membersModal.id = 'membersModal';
        membersModal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:3500;';
        document.body.appendChild(membersModal);
    }

    membersModal.innerHTML = `
        <div class="modal-content" style="max-width:480px;width:100%;margin:0 16px;max-height:80vh;overflow-y:auto;">
            <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;">
                <h2 style="margin:0;">Members — ${profile.name}</h2>
                <button onclick="document.getElementById('membersModal').style.display='none'" class="btn btn-icon" style="font-size:18px;line-height:1;">&times;</button>
            </div>
            <div class="modal-body">
                <div style="margin-bottom:16px;">${membersHtml || '<p style="color:#888;">No members found.</p>'}</div>
                <div style="border-top:1px solid #eee;padding-top:12px;">
                    <p style="font-weight:600;margin:0 0 8px;">Invite by Email</p>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <input type="email" id="inviteEmail" class="form-input" placeholder="colleague@example.com" style="flex:1;min-width:160px;" />
                        <select id="inviteRole" class="form-input" style="width:90px;">
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                            <option value="admin">Admin</option>
                        </select>
                        <button class="btn btn-primary btn-small" onclick="handleInviteMember('${profileId}')">Invite</button>
                    </div>
                    <p id="inviteMsg" style="font-size:12px;margin:6px 0 0;"></p>
                </div>
            </div>
        </div>
    `;
    membersModal.style.display = 'flex';
}

/**
 * Invite a member to a workspace.
 * @param {string} profileId
 */
async function handleInviteMember(profileId) {
    const email = document.getElementById('inviteEmail')?.value?.trim();
    const role = document.getElementById('inviteRole')?.value || 'viewer';
    const msgEl = document.getElementById('inviteMsg');

    if (!email) {
        if (msgEl) { msgEl.textContent = 'Please enter an email.'; msgEl.style.color = '#d13438'; }
        return;
    }

    try {
        const result = await supabaseManager.inviteMember(profileId, email, role);
        if (result.error) {
            if (msgEl) { msgEl.textContent = result.error; msgEl.style.color = '#d13438'; }
        } else {
            if (msgEl) { msgEl.textContent = `${email} added as ${role}.`; msgEl.style.color = '#107c10'; }
            if (document.getElementById('inviteEmail')) document.getElementById('inviteEmail').value = '';
        }
    } catch (err) {
        if (msgEl) { msgEl.textContent = 'Error: ' + err.message; msgEl.style.color = '#d13438'; }
    }
}

/**
 * Show the plugins management modal
 */
function showPluginsModal() {
    const pluginsList = document.getElementById('pluginsList');
    const noPluginsMessage = document.getElementById('noPluginsMessage');
    const pluginsStats = document.getElementById('pluginsStats');

    // Get all plugins
    const plugins = pluginManager.getAllPlugins();

    if (plugins.length === 0) {
        pluginsList.style.display = 'none';
        noPluginsMessage.style.display = 'block';
        pluginsStats.style.display = 'none';
    } else {
        pluginsList.style.display = 'flex';
        noPluginsMessage.style.display = 'none';
        pluginsStats.style.display = 'flex';

        // Populate plugins list
        pluginsList.innerHTML = '';
        plugins.forEach(plugin => {
            const pluginItem = createPluginItem(plugin);
            pluginsList.appendChild(pluginItem);
        });

        // Update stats
        const stats = pluginManager.getStatistics();
        pluginsStats.innerHTML = `
            <div class="stat-item">
                <span>Total:</span>
                <span class="stat-value">${stats.total}</span>
            </div>
            <div class="stat-item">
                <span>Active:</span>
                <span class="stat-value">${stats.enabled}</span>
            </div>
            <div class="stat-item">
                <span>Hooks:</span>
                <span class="stat-value">${stats.hooks}</span>
            </div>
        `;
    }

    modalManager.show('pluginsModal');
}

/**
 * Create a plugin item element
 * @param {Object} plugin - Plugin object
 * @returns {HTMLElement} Plugin item element
 */
function createPluginItem(plugin) {
    const div = document.createElement('div');
    div.className = `plugin-item ${plugin.enabled ? '' : 'disabled'}`;
    div.dataset.pluginId = plugin.id;

    div.innerHTML = `
        <div class="plugin-info">
            <div class="plugin-name">
                ${plugin.name}
                ${plugin.version ? `<span class="plugin-version">v${plugin.version}</span>` : ''}
            </div>
            <div class="plugin-description">${plugin.description || 'No description'}</div>
        </div>
        <label class="toggle-switch">
            <input type="checkbox" ${plugin.enabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
        </label>
    `;

    // Add toggle handler
    const toggle = div.querySelector('input[type="checkbox"]');
    toggle.addEventListener('change', (e) => {
        handlePluginToggle(plugin.id, e.target.checked);
        div.classList.toggle('disabled', !e.target.checked);
    });

    return div;
}

/**
 * Handle plugin toggle
 * @param {string} pluginId - Plugin ID
 * @param {boolean} enabled - Whether to enable the plugin
 */
function handlePluginToggle(pluginId, enabled) {
    if (enabled) {
        pluginManager.enable(pluginId);
        toastManager.success(`Plugin enabled: ${pluginManager.getPlugin(pluginId).name}`);
    } else {
        pluginManager.disable(pluginId);
        toastManager.show(`Plugin disabled: ${pluginManager.getPlugin(pluginId).name}`, 'info');
    }

    // Update stats
    const stats = pluginManager.getStatistics();
    const pluginsStats = document.getElementById('pluginsStats');
    pluginsStats.innerHTML = `
        <div class="stat-item">
            <span>Total:</span>
            <span class="stat-value">${stats.total}</span>
        </div>
        <div class="stat-item">
            <span>Active:</span>
            <span class="stat-value">${stats.enabled}</span>
        </div>
        <div class="stat-item">
            <span>Hooks:</span>
            <span class="stat-value">${stats.hooks}</span>
        </div>
    `;

    // Save plugin states to localStorage
    savePluginStates();
}

/**
 * Save plugin enabled/disabled states to localStorage
 */
function savePluginStates() {
    const plugins = pluginManager.getAllPlugins();
    const states = {};
    plugins.forEach(plugin => {
        states[plugin.id] = plugin.enabled;
    });
    localStorage.setItem('pluginStates', JSON.stringify(states));
}

/**
 * Restore plugin states from localStorage
 */
function restorePluginStates() {
    const savedStates = localStorage.getItem('pluginStates');
    if (!savedStates) return;

    try {
        const states = JSON.parse(savedStates);
        Object.entries(states).forEach(([pluginId, enabled]) => {
            if (pluginManager.hasPlugin(pluginId)) {
                if (enabled) {
                    pluginManager.enable(pluginId);
                } else {
                    pluginManager.disable(pluginId);
                }
            }
        });
    } catch (error) {
        console.warn('Failed to restore plugin states:', error);
    }
}

/**
 * Start editing a polygon shape
 * @param {string} layerId - Layer ID
 * @param {Object} feature - Feature object with wkt property
 */
function startPolygonShapeEdit(layerId, feature) {
    if (!feature.wkt) {
        toastManager.error('This feature does not have polygon data');
        return;
    }

    // Check if already editing
    if (mapManager.isEditingPolygon()) {
        toastManager.warning('Already editing a polygon. Please save or cancel first.');
        return;
    }

    // Store current editing info
    stateManager.set('editingPolygonInfo', {
        layerId,
        featureId: feature.id,
        featureName: feature.name || feature.Name || 'Polygon'
    });

    // Start the edit mode
    const success = mapManager.startPolygonEdit(
        layerId,
        feature.id,
        feature.wkt,
        (newWkt) => handlePolygonShapeSaved(layerId, feature.id, newWkt),
        () => handlePolygonShapeCancelled()
    );

    if (success) {
        // Show edit controls
        const controls = document.getElementById('polygonEditControls');
        const label = controls.querySelector('.edit-label');
        label.textContent = `Editing: ${feature.name || feature.Name || 'Polygon'}`;
        controls.style.display = 'flex';

        toastManager.show('Drag vertices to adjust the polygon shape. Click Save when done.', 'info');
    } else {
        toastManager.error('Failed to start polygon editing');
    }
}

/**
 * Handle polygon shape saved
 * @param {string} layerId - Layer ID
 * @param {string} featureId - Feature ID
 * @param {string} newWkt - New WKT string
 */
function handlePolygonShapeSaved(layerId, featureId, newWkt) {
    // Update the feature with new WKT
    layerManager.updateFeature(layerId, featureId, { wkt: newWkt });

    // Re-render the layer to show updated polygon
    const layer = layerManager.getLayer(layerId);
    if (layer) {
        layerManager.rerenderLayer(layerId, layer.features);

        // Re-apply labels if they were enabled
        if (layer.showLabels) {
            mapManager.togglePolygonLabels(layerId, true, layer.features);
        }
    }

    // Hide edit controls
    document.getElementById('polygonEditControls').style.display = 'none';
    stateManager.set('editingPolygonInfo', null);

    toastManager.success('Polygon shape updated');
}

/**
 * Handle polygon shape edit cancelled
 */
function handlePolygonShapeCancelled() {
    // Hide edit controls
    document.getElementById('polygonEditControls').style.display = 'none';
    stateManager.set('editingPolygonInfo', null);

    toastManager.show('Polygon editing cancelled', 'info');
}

/**
 * Save current polygon edit from controls
 */
function savePolygonShapeEdit() {
    if (!mapManager.isEditingPolygon()) {
        return;
    }
    mapManager.savePolygonEdit();
}

/**
 * Cancel current polygon edit from controls
 */
function cancelPolygonShapeEdit() {
    if (!mapManager.isEditingPolygon()) {
        return;
    }
    mapManager.cancelPolygonEdit();
}

// Wait for DOM, Google Maps, and Supabase Auth to all be ready
let domReady = false;
let mapsReady = false;
let authReady = false;

function tryInitialize() {
    if (domReady && mapsReady && authReady) {
        initializeApp();
    }
}

// Auth gate: fired by auth-manager.js once a session is confirmed
document.addEventListener('auth:signed-in', () => {
    authReady = true;
    tryInitialize();
});

// Handle sign-out: reset auth gate and clear app state
document.addEventListener('auth:signed-out', () => {
    authReady = false;
    // Stop any active realtime listener
    if (typeof firebaseManager !== 'undefined') {
        firebaseManager.stopListening();
    }
    realtimeListenerEnabled = false;
});

// Handle DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        domReady = true;
        tryInitialize();
    });
} else {
    domReady = true;
}

// Handle Google Maps ready (callback for async loading)
window.initMap = function() {
    mapsReady = true;
    tryInitialize();
};

// Fallback: If Google Maps is already loaded (non-async scenario)
if (typeof google !== 'undefined' && google.maps) {
    mapsReady = true;
    tryInitialize();
}
