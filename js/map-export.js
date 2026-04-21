/**
 * View-Only Map Export
 *
 * Generates a self-contained, read-only HTML file that renders the
 * currently visible layers (points, polygons, heat maps) on a Google Map.
 *
 * The exported file:
 *  - Embeds all layer data as inline JSON
 *  - Has no edit controls, no Firebase connection, no workspace access
 *  - Can be emailed, uploaded, or opened locally by team members
 *  - Has no way to modify the original workspace
 */

const MapExport = {
    /**
     * Gather the data needed to render the current map in view-only mode.
     * Only visible layers and their features are included.
     * @returns {Object} Serializable snapshot
     */
    buildSnapshot() {
        const allLayers = layerManager.getAllLayers();
        const visibleLayers = allLayers.filter(l => l.visible !== false);

        // Serialize layers. Only keep the properties the viewer needs.
        const layers = visibleLayers.map(layer => ({
            id: layer.id,
            name: layer.name,
            type: layer.type,
            color: layer.color || '#0078d4',
            opacity: layer.opacity !== undefined ? layer.opacity : 1.0,
            features: layer.features || [],
            styleType: layer.styleType || null,
            styleProperty: layer.styleProperty || null,
            colorMap: layer.colorMap || null,
            showLabels: layer.showLabels || false
        }));

        // Preserve layer draw order (back-to-front)
        const layerOrder = layerManager.layerOrder
            .filter(id => visibleLayers.some(l => l.id === id));

        // Map view
        const map = mapManager.map;
        const center = map ? map.getCenter() : null;
        const view = {
            center: center
                ? { lat: center.lat(), lng: center.lng() }
                : AppConfig.map.defaultCenter,
            zoom: map ? map.getZoom() : AppConfig.map.defaultZoom,
            mapTypeId: map ? map.getMapTypeId() : 'roadmap'
        };

        // Heatmap configuration (if plugin is active)
        let heatmap = null;
        try {
            if (typeof pluginManager !== 'undefined' && pluginManager.getPlugin) {
                const plugin = pluginManager.getPlugin('heatmap-overlay');
                if (plugin && plugin.isActive && plugin.isActive()) {
                    heatmap = {
                        radius: plugin.config.radius,
                        opacity: plugin.config.opacity,
                        maxIntensity: plugin.config.maxIntensity,
                        dissipating: plugin.config.dissipating,
                        weightProperty: plugin.config.weightProperty || null,
                        gradient: plugin.config.gradient || null,
                        gradientColors: plugin.config.gradient
                            ? plugin.gradients[plugin.config.gradient] || null
                            : null,
                        hideMarkersWhenActive: plugin.config.hideMarkersWhenActive
                    };
                }
            }
        } catch (e) {
            console.warn('MapExport: could not read heatmap config', e);
        }

        // Workspace name (for title)
        let workspaceName = 'Sales Territory Map';
        try {
            if (typeof stateManager !== 'undefined' && stateManager.getCurrentProfile) {
                const profile = stateManager.getCurrentProfile();
                if (profile && profile.name) {
                    workspaceName = profile.name;
                }
            }
        } catch (e) {
            /* ignore */
        }

        return {
            version: 1,
            generatedAt: new Date().toISOString(),
            workspaceName,
            view,
            layers,
            layerOrder,
            heatmap
        };
    },

    /**
     * Build the complete standalone HTML document for the snapshot.
     * @param {Object} snapshot - Snapshot from buildSnapshot()
     * @returns {string} HTML document source
     */
    buildHtmlDocument(snapshot) {
        const apiKey = AppConfig.googleMapsApiKey;
        // Escape </script> inside the JSON blob to prevent breaking out of the script tag.
        const jsonBlob = JSON.stringify(snapshot)
            .replace(/<\/script>/gi, '<\\/script>');

        const safeTitle = this._escapeHtml(snapshot.workspaceName);
        const generated = this._escapeHtml(snapshot.generatedAt);

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle} - View Only</title>
<style>
  html, body { height: 100%; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  #viewer { display: flex; flex-direction: column; height: 100vh; }
  .viewer-header {
    background: #1f2937; color: #fff; padding: 10px 16px;
    display: flex; justify-content: space-between; align-items: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2); z-index: 5;
  }
  .viewer-header h1 { font-size: 16px; margin: 0; font-weight: 600; }
  .viewer-header .meta { font-size: 12px; opacity: 0.8; }
  .view-only-badge {
    background: #10b981; color: #fff; padding: 3px 10px;
    border-radius: 12px; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px; margin-left: 10px;
  }
  .viewer-body { flex: 1; position: relative; }
  #map { width: 100%; height: 100%; }
  .legend {
    position: absolute; top: 10px; right: 10px; z-index: 3;
    background: #fff; border-radius: 6px; padding: 10px 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15); max-width: 260px;
    max-height: calc(100vh - 100px); overflow-y: auto;
  }
  .legend h3 {
    margin: 0 0 8px 0; font-size: 13px; color: #374151;
    border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;
  }
  .legend-item {
    display: flex; align-items: center; margin: 5px 0; font-size: 12px; color: #374151;
  }
  .legend-swatch {
    display: inline-block; width: 14px; height: 14px; border-radius: 3px;
    margin-right: 8px; border: 1px solid rgba(0,0,0,0.2); flex-shrink: 0;
  }
  .legend-swatch.point { border-radius: 50%; }
  .legend-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .legend-count { color: #9ca3af; margin-left: 6px; font-size: 11px; }
  .legend-toggle {
    position: absolute; top: 10px; right: 10px; z-index: 4;
    background: #fff; border: none; border-radius: 6px; padding: 6px 10px;
    font-size: 12px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    display: none;
  }
  .info-window { font-family: inherit; font-size: 13px; max-width: 260px; }
  .info-window h4 { margin: 0 0 6px 0; color: #1f2937; font-size: 14px; }
  .info-window .prop { margin: 3px 0; }
  .info-window .prop strong { color: #4b5563; }
  .empty-state {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: #fff; padding: 20px 30px; border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15); text-align: center; color: #6b7280;
  }
</style>
</head>
<body>
<div id="viewer">
  <header class="viewer-header">
    <div>
      <h1>${safeTitle}<span class="view-only-badge">View Only</span></h1>
      <div class="meta">Snapshot generated ${generated}</div>
    </div>
  </header>
  <div class="viewer-body">
    <div id="map"></div>
    <button id="legendToggle" class="legend-toggle">Show Legend</button>
    <div id="legend" class="legend">
      <h3>Layers</h3>
      <div id="legendItems"></div>
    </div>
  </div>
</div>

<script type="application/json" id="map-data">${jsonBlob}</script>

<!-- WKT parser for polygon geometry -->
<script src="https://unpkg.com/wellknown@0.5.0/wellknown.js"></script>

<script>
${this._getViewerScript()}
</script>

<!-- Google Maps API -->
<script src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=visualization,geometry&v=weekly&callback=initViewerMap" async defer></script>
</body>
</html>`;
    },

    /**
     * The JavaScript that runs inside the exported viewer.
     * Kept as a plain string so the main app doesn't have to fetch it.
     * @returns {string}
     */
    _getViewerScript() {
        return `
'use strict';

var SNAPSHOT = JSON.parse(document.getElementById('map-data').textContent);
var MAP;
var INFO_WINDOW;
var RENDERED_LAYERS = {};
var HEATMAP_LAYER = null;

function initViewerMap() {
    MAP = new google.maps.Map(document.getElementById('map'), {
        center: SNAPSHOT.view.center,
        zoom: SNAPSHOT.view.zoom,
        mapTypeId: SNAPSHOT.view.mapTypeId || 'roadmap',
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        zoomControl: true
    });
    INFO_WINDOW = new google.maps.InfoWindow();

    renderLayers();
    buildLegend();
    renderHeatmap();
    setupLegendToggle();

    if (!SNAPSHOT.layers || SNAPSHOT.layers.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No visible layers were included in this export.';
        document.querySelector('.viewer-body').appendChild(empty);
    }
}

function renderLayers() {
    // Honor layer order if available, otherwise use array order
    var order = (SNAPSHOT.layerOrder && SNAPSHOT.layerOrder.length)
        ? SNAPSHOT.layerOrder
        : SNAPSHOT.layers.map(function(l) { return l.id; });

    var byId = {};
    SNAPSHOT.layers.forEach(function(l) { byId[l.id] = l; });

    order.forEach(function(layerId, idx) {
        var layer = byId[layerId];
        if (!layer) return;
        renderLayer(layer, idx);
    });
}

function renderLayer(layer, zIndex) {
    var rendered = { markers: [], dataLayer: null, layer: layer };

    var hasPoints = false;
    var hasPolygons = false;
    (layer.features || []).forEach(function(f) {
        if (f.wkt) hasPolygons = true;
        else if (f.latitude !== undefined && f.longitude !== undefined) hasPoints = true;
    });

    // Render polygon features with a Data layer so we can use feature-level styling
    if (hasPolygons) {
        var dataLayer = new google.maps.Data({ map: MAP });
        rendered.dataLayer = dataLayer;

        layer.features.forEach(function(feature, i) {
            if (!feature.wkt) return;
            var geom;
            try {
                geom = wellknown.parse(feature.wkt);
            } catch (e) {
                console.warn('Skipping invalid WKT feature', feature, e);
                return;
            }
            if (!geom) return;

            dataLayer.addGeoJson({
                type: 'Feature',
                id: feature.id || (layer.id + '-' + i),
                geometry: geom,
                properties: Object.assign({}, feature, { __layerName: layer.name })
            });
        });

        dataLayer.setStyle(function(feat) {
            var color = resolveColor(layer, featureProps(feat));
            return {
                fillColor: color,
                fillOpacity: 0.5 * (layer.opacity !== undefined ? layer.opacity : 1),
                strokeColor: color,
                strokeOpacity: (layer.opacity !== undefined ? layer.opacity : 1),
                strokeWeight: 2,
                clickable: true,
                zIndex: zIndex + 1
            };
        });

        dataLayer.addListener('click', function(e) {
            var props = featureProps(e.feature);
            showInfo(e.latLng, layer, props);
        });

        if (layer.showLabels) {
            attachPolygonLabels(dataLayer, rendered);
        }
    }

    // Render point features as Markers
    if (hasPoints) {
        layer.features.forEach(function(feature, i) {
            if (feature.latitude === undefined || feature.longitude === undefined) return;
            var lat = parseFloat(feature.latitude);
            var lng = parseFloat(feature.longitude);
            if (isNaN(lat) || isNaN(lng)) return;

            var color = resolveColor(layer, feature);
            var marker = new google.maps.Marker({
                position: { lat: lat, lng: lng },
                map: MAP,
                title: feature.name || '',
                opacity: layer.opacity !== undefined ? layer.opacity : 1,
                icon: {
                    path: 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z',
                    fillColor: color,
                    fillOpacity: 0.9,
                    strokeColor: '#ffffff',
                    strokeWeight: 1.5,
                    scale: 0.7,
                    anchor: new google.maps.Point(0, 0),
                    labelOrigin: new google.maps.Point(0, -30)
                },
                zIndex: zIndex + 1
            });

            marker.addListener('click', function() {
                showInfo(marker.getPosition(), layer, feature);
            });
            rendered.markers.push(marker);
        });
    }

    RENDERED_LAYERS[layer.id] = rendered;
}

function attachPolygonLabels(dataLayer, rendered) {
    var labels = [];
    dataLayer.forEach(function(feat) {
        var props = featureProps(feat);
        var label = props.name || props.label || '';
        if (!label) return;
        var bounds = new google.maps.LatLngBounds();
        feat.getGeometry().forEachLatLng(function(ll) { bounds.extend(ll); });
        var center = bounds.getCenter();
        var marker = new google.maps.Marker({
            position: center,
            map: MAP,
            label: { text: String(label), color: '#111', fontSize: '11px', fontWeight: '600' },
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0, strokeOpacity: 0, fillOpacity: 0 },
            clickable: false
        });
        labels.push(marker);
    });
    rendered.labels = labels;
}

function featureProps(feat) {
    var out = {};
    feat.forEachProperty(function(value, name) { out[name] = value; });
    return out;
}

function resolveColor(layer, props) {
    // Per-feature explicit color override (SalesMapper stores this on the feature itself)
    if (props && props.color) return props.color;

    // Property-based styling: use colorMap[value]
    if (layer.styleType && layer.styleProperty && layer.colorMap) {
        var val = props ? props[layer.styleProperty] : undefined;
        if (val !== undefined && val !== null) {
            var key = String(val).toLowerCase();
            if (layer.colorMap[key] !== undefined) return layer.colorMap[key];
            if (layer.colorMap[val] !== undefined) return layer.colorMap[val];
        }
    }
    return layer.color || '#0078d4';
}

function showInfo(position, layer, props) {
    var skip = { layerid: 1, wkt: 1, id: 1, latitude: 1, longitude: 1, __layerName: 1, color: 1 };
    var html = '<div class="info-window">';
    html += '<h4>' + escapeHtml(props.name || layer.name) + '</h4>';
    html += '<div class="prop"><strong>Layer:</strong> ' + escapeHtml(layer.name) + '</div>';

    Object.keys(props).forEach(function(key) {
        if (skip[key.toLowerCase()]) return;
        if (key === 'name') return;
        var value = props[key];
        if (value === null || value === undefined || value === '') return;
        if (typeof value === 'object') return;
        html += '<div class="prop"><strong>' + escapeHtml(key) + ':</strong> ' + escapeHtml(String(value)) + '</div>';
    });
    html += '</div>';

    INFO_WINDOW.setContent(html);
    INFO_WINDOW.setPosition(position);
    INFO_WINDOW.open(MAP);
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildLegend() {
    var container = document.getElementById('legendItems');
    container.innerHTML = '';
    if (!SNAPSHOT.layers.length) {
        container.innerHTML = '<div class="legend-item">No layers</div>';
        return;
    }
    SNAPSHOT.layers.forEach(function(layer) {
        var row = document.createElement('div');
        row.className = 'legend-item';
        var swatch = document.createElement('span');
        swatch.className = 'legend-swatch' + (layer.type === 'point' ? ' point' : '');
        swatch.style.background = layer.color || '#0078d4';
        var name = document.createElement('span');
        name.className = 'legend-name';
        name.textContent = layer.name;
        var count = document.createElement('span');
        count.className = 'legend-count';
        count.textContent = '(' + (layer.features ? layer.features.length : 0) + ')';
        row.appendChild(swatch);
        row.appendChild(name);
        row.appendChild(count);
        container.appendChild(row);
    });
}

function renderHeatmap() {
    if (!SNAPSHOT.heatmap) return;
    if (!google.maps.visualization || !google.maps.visualization.HeatmapLayer) {
        console.warn('Google Maps visualization library not available, skipping heatmap');
        return;
    }

    var config = SNAPSHOT.heatmap;
    var heatData = [];
    SNAPSHOT.layers.forEach(function(layer) {
        (layer.features || []).forEach(function(feature) {
            if (feature.latitude === undefined || feature.longitude === undefined) return;
            var lat = parseFloat(feature.latitude);
            var lng = parseFloat(feature.longitude);
            if (isNaN(lat) || isNaN(lng)) return;
            var weight = 1;
            if (config.weightProperty && feature[config.weightProperty] !== undefined) {
                var w = parseFloat(feature[config.weightProperty]);
                if (!isNaN(w)) weight = w;
            }
            heatData.push({ location: new google.maps.LatLng(lat, lng), weight: weight });
        });
    });

    if (!heatData.length) return;

    var opts = {
        data: heatData,
        map: MAP,
        radius: config.radius,
        opacity: config.opacity,
        maxIntensity: config.maxIntensity,
        dissipating: config.dissipating
    };
    if (config.gradientColors) opts.gradient = config.gradientColors;

    HEATMAP_LAYER = new google.maps.visualization.HeatmapLayer(opts);

    // If the original workspace hid markers when heatmap was active, honor that.
    if (config.hideMarkersWhenActive) {
        Object.keys(RENDERED_LAYERS).forEach(function(id) {
            var r = RENDERED_LAYERS[id];
            r.markers.forEach(function(m) { m.setMap(null); });
        });
    }
}

function setupLegendToggle() {
    var legend = document.getElementById('legend');
    var toggle = document.getElementById('legendToggle');
    // On narrow screens, collapse the legend and show a toggle button
    function apply() {
        if (window.innerWidth < 640) {
            legend.style.display = 'none';
            toggle.style.display = 'block';
        } else {
            legend.style.display = '';
            toggle.style.display = 'none';
        }
    }
    toggle.addEventListener('click', function() {
        if (legend.style.display === 'none') {
            legend.style.display = 'block';
            toggle.textContent = 'Hide Legend';
        } else {
            legend.style.display = 'none';
            toggle.textContent = 'Show Legend';
        }
    });
    window.addEventListener('resize', apply);
    apply();
}

// Expose initViewerMap globally for the Google Maps callback
window.initViewerMap = initViewerMap;
`;
    },

    /**
     * Download the current workspace as a view-only HTML file.
     */
    exportViewOnlyMap() {
        try {
            if (typeof layerManager === 'undefined' || typeof mapManager === 'undefined') {
                throw new Error('Map is not ready yet');
            }

            const snapshot = this.buildSnapshot();

            if (!snapshot.layers.length) {
                if (typeof toastManager !== 'undefined') {
                    toastManager.warning('No visible layers to export. Turn on at least one layer first.');
                }
                return;
            }

            const html = this.buildHtmlDocument(snapshot);
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            const filename = this._buildFilename(snapshot.workspaceName);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            const count = snapshot.layers.length;
            if (typeof toastManager !== 'undefined') {
                toastManager.success(
                    `Exported view-only map with ${count} layer${count === 1 ? '' : 's'}`
                );
            }

            if (typeof eventBus !== 'undefined') {
                eventBus.emit('map.exported.view', {
                    layers: count,
                    filename
                });
            }
        } catch (err) {
            console.error('MapExport.exportViewOnlyMap failed:', err);
            if (typeof toastManager !== 'undefined') {
                toastManager.error('Failed to export view-only map: ' + err.message);
            }
        }
    },

    _buildFilename(workspaceName) {
        const safe = (workspaceName || 'map')
            .toLowerCase()
            .replace(/[^a-z0-9-_]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'map';
        const stamp = new Date().toISOString().slice(0, 10);
        return `${safe}-view-${stamp}.html`;
    },

    _escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
};

// Expose globally
window.MapExport = MapExport;
