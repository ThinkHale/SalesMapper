/**
 * Application Configuration
 * Centralized configuration for all application constants
 */

const AppConfig = {
    // API Keys
    googleMapsApiKey: 'AIzaSyBykC-Ud0Av1cNBFcfelKjBQojtzwC3sws',

    // Supabase Configuration
    supabase: {
        url: 'https://pdrckkufafayrguokdkb.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkcmNra3VmYWZheXJndW9rZGtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MTYzNzQsImV4cCI6MjA5MjI5MjM3NH0.7Z2fEFiEvd1sQ486njjYESZWvKJwuzZxa-E7BzTkz1c'
    },

    // Map Settings
    map: {
        defaultCenter: { lat: 37.0902, lng: -95.7129 }, // Center of USA
        defaultZoom: 4,
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        zoomControl: true,
        fitBoundsPadding: 50 // pixels
    },

    // Color Palette
    colors: {
        primary: [
            '#0078d4', '#d13438', '#107c10', '#ffb900', '#8764b8',
            '#00b7c3', '#f7630c', '#ca5010', '#038387', '#486860'
        ],
        tierMap: {
            1: '#107c10',      // Green
            '1': '#107c10',
            'tier 1': '#107c10',
            2: '#ffb900',      // Yellow
            '2': '#ffb900',
            'tier 2': '#ffb900',
            3: '#d13438',      // Red
            '3': '#d13438',
            'tier 3': '#d13438'
        },
        default: '#cccccc'
    },

    // Marker Settings
    marker: {
        // SVG path for teardrop/pin marker
        pinPath: 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z',
        scale: 0.7,
        strokeWeight: 1.5,
        strokeColor: '#ffffff',
        fillOpacity: 0.9,
        anchor: { x: 0, y: 0 }, // Anchor at bottom point of pin
        labelOrigin: { x: 0, y: -30 }
    },

    // Polygon Settings
    polygon: {
        fillOpacity: 0.5,
        strokeWeight: 2,
        clickable: true
    },

    // Geocoding Settings
    geocoding: {
        delayMs: 200, // Delay between requests
        confidenceScores: {
            ROOFTOP: 1.0,
            RANGE_INTERPOLATED: 0.8,
            GEOMETRIC_CENTER: 0.6,
            APPROXIMATE: 0.4
        }
    },

    // CSV Parser Settings
    csvParser: {
        supportedExtensions: ['csv', 'xlsx', 'xls'],
        supportedColumns: {
            wkt: ['wkt', 'geometry', 'shape', 'geom', 'polygon', 'the_geom'],
            latitude: ['latitude', 'lat', 'latitude_decimal'],
            longitude: ['longitude', 'lon', 'lng', 'longitude_decimal'],
            name: ['name', 'title', 'label', 'account_name', 'business_name'],
            description: ['description', 'desc', 'notes', 'comments'],
            zipCode: ['zip', 'zipcode', 'zip_code', 'postal_code'],
            county: ['county', 'county_name'],
            state: ['state', 'state_name'],
            territory: ['territory', 'sales_territory', 'region'],
            bdm: ['bdm', 'manager', 'sales_rep', 'account_manager'],
            tier: ['tier', 'sales_tier', 'potential_tier', 'priority'],
            revenue: ['revenue', 'sales', 'annual_revenue']
        }
    },

    // Storage Settings
    storage: {
        localStorageKey: 'salesMapperState',
        templateStorageKey: 'columnMappingTemplates',
        autoSaveEnabled: true
    },

    // UI Settings
    ui: {
        toastDuration: 3000, // milliseconds
        toastDurationLong: 8000,
        sidebarWidth: '350px',
        modalMaxWidth: '600px',
        modalLargeMaxWidth: '700px',
        loadingOverlayZIndex: 3000,
        modalZIndex: 2000,
        contextMenuZIndex: 2000,
        toastZIndex: 3000
    },

    // Feature Display Settings
    featureInfo: {
        displayProperties: ['name', 'description', 'tier', 'bdm'],
        propertyLabels: {
            name: 'Name',
            description: 'Description',
            tier: 'Tier',
            bdm: 'BDM'
        },
        systemProperties: ['layerid', 'wkt', 'id', 'latitude', 'longitude']
    },

    // Layer Settings
    layer: {
        defaultOpacity: 1.0,
        defaultVisible: true,
        defaultType: 'point',
        maxFeaturesForList: 1000 // Maximum features to show in expandable list
    },

    // Validation Settings
    validation: {
        maxErrorsToDisplay: 100,
        showValidationModal: true
    },

    // Drawing Settings
    drawing: {
        polygonColor: '#0078d4',
        polygonStrokeOpacity: 0.8,
        polygonStrokeWeight: 2,
        polygonFillOpacity: 0.35,
        vertexMarkerColor: '#FF0000',
        vertexMarkerScale: 4
    }
};

// Freeze configuration to prevent accidental modifications
Object.freeze(AppConfig);
Object.freeze(AppConfig.supabase);
Object.freeze(AppConfig.map);
Object.freeze(AppConfig.colors);
Object.freeze(AppConfig.colors.primary);
Object.freeze(AppConfig.colors.tierMap);
Object.freeze(AppConfig.marker);
Object.freeze(AppConfig.polygon);
Object.freeze(AppConfig.geocoding);
Object.freeze(AppConfig.csvParser);
Object.freeze(AppConfig.storage);
Object.freeze(AppConfig.ui);
Object.freeze(AppConfig.featureInfo);
Object.freeze(AppConfig.layer);
Object.freeze(AppConfig.validation);
Object.freeze(AppConfig.drawing);
