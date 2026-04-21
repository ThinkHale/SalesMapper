/**
 * Distance Measurement Tool
 * v3.0 Phase 2: Interactive distance measurement on map
 * Part of Analytics & Insights
 */

class DistanceTool {
    constructor(mapManager) {
        this.mapManager = mapManager;
        this.map = mapManager.map;
        this.isActive = false;
        this.mode = 'distance'; // 'distance' or 'radius'
        this.markers = [];
        this.line = null;
        this.circle = null;
        this.measurementListener = null;
        this.measurements = []; // Store all measurements
    }

    /**
     * Activate distance measurement mode
     */
    activate() {
        if (this.isActive) return;

        this.isActive = true;
        this.map.setOptions({ draggableCursor: 'crosshair' });

        // Disable layer clickability so measurements can be made over features
        if (this.mapManager && this.mapManager.updateLayerClickability) {
            this.mapManager.updateLayerClickability(false);
        }

        // Add click listener for placing markers
        this.measurementListener = this.map.addListener('click', (e) => {
            this.addMeasurementPoint(e.latLng);
        });

        // Show instructions
        this.showInstructions();

        console.log('Distance measurement tool activated');
    }

    /**
     * Deactivate distance measurement mode
     */
    deactivate() {
        if (!this.isActive) return;

        this.isActive = false;
        this.map.setOptions({ draggableCursor: null });

        // Re-enable layer clickability
        if (this.mapManager && this.mapManager.updateLayerClickability) {
            this.mapManager.updateLayerClickability(true);
        }

        // Remove click listener
        if (this.measurementListener) {
            google.maps.event.removeListener(this.measurementListener);
            this.measurementListener = null;
        }

        // Clear current measurement
        this.clearCurrent();

        // Hide instructions
        this.hideInstructions();

        console.log('Distance measurement tool deactivated');
    }

    /**
     * Toggle measurement mode
     */
    toggle() {
        if (this.isActive) {
            this.deactivate();
        } else {
            this.activate();
        }
    }

    /**
     * Set measurement mode
     * @param {string} mode - 'distance' or 'radius'
     */
    setMode(mode) {
        if (mode !== 'distance' && mode !== 'radius') {
            console.error('Invalid mode. Use "distance" or "radius"');
            return;
        }
        this.mode = mode;
        this.clearCurrent();
        this.updateInstructions();
    }

    /**
     * Update instructions based on current mode
     */
    updateInstructions() {
        const instructions = document.getElementById('measurementInstructions');
        if (!instructions) return;

        const text = instructions.querySelector('.instructions-text');
        if (!text) return;

        if (this.mode === 'radius') {
            text.textContent = 'Click center point, then click to set radius';
        } else {
            text.textContent = 'Click two points on the map to measure distance';
        }
    }

    /**
     * Add a measurement point
     */
    addMeasurementPoint(latLng) {
        const iconColor = this.mode === 'radius' ? '#2196F3' : '#FF5722';

        // Create marker
        const marker = new google.maps.Marker({
            position: latLng,
            map: this.map,
            draggable: true,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: this.markers.length === 0 && this.mode === 'radius' ? 10 : 8,
                fillColor: iconColor,
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 2
            },
            title: this.mode === 'radius' && this.markers.length === 0 ? 'Center Point' : 'Measurement Point'
        });

        // Add drag listener to update visualization
        marker.addListener('drag', () => {
            if (this.mode === 'radius') {
                this.updateCircle();
                this.updateRadius();
            } else {
                this.updateLine();
                this.updateDistance();
            }
        });

        this.markers.push(marker);

        // Handle second point based on mode
        if (this.markers.length === 2) {
            if (this.mode === 'radius') {
                this.drawCircle();
                this.calculateRadius();
            } else {
                this.drawLine();
                this.calculateDistance();
            }
            this.saveMeasurement();

            // Auto-start new measurement
            setTimeout(() => {
                this.clearCurrent();
            }, 3000);
        }
    }

    /**
     * Draw line between markers
     */
    drawLine() {
        if (this.markers.length < 2) return;

        const path = this.markers.map(m => m.getPosition());

        this.line = new google.maps.Polyline({
            path: path,
            geodesic: true,
            strokeColor: '#FF5722',
            strokeOpacity: 0.8,
            strokeWeight: 3,
            map: this.map
        });
    }

    /**
     * Update line position
     */
    updateLine() {
        if (!this.line || this.markers.length < 2) return;

        const path = this.markers.map(m => m.getPosition());
        this.line.setPath(path);
    }

    /**
     * Calculate and display distance
     */
    calculateDistance() {
        if (this.markers.length < 2) return;

        const point1 = this.markers[0].getPosition();
        const point2 = this.markers[1].getPosition();

        // Calculate distance using Google Maps Geometry library
        const distanceMeters = google.maps.geometry.spherical.computeDistanceBetween(point1, point2);

        // Convert to miles and kilometers
        const distanceMiles = distanceMeters / 1609.34;
        const distanceKm = distanceMeters / 1000;

        // Format for display
        const distanceText = this.formatDistance(distanceMiles, distanceKm);

        // Show in info window
        this.showDistanceInfo(point2, distanceText, distanceMiles, distanceKm);

        return { meters: distanceMeters, miles: distanceMiles, km: distanceKm };
    }

    /**
     * Update distance (for dragging)
     */
    updateDistance() {
        if (this.markers.length === 2 && this.line) {
            const point2 = this.markers[1].getPosition();
            const distance = this.calculateDistance();
            if (distance) {
                const distanceText = this.formatDistance(distance.miles, distance.km);
                this.showDistanceInfo(point2, distanceText, distance.miles, distance.km);
            }
        }
    }

    /**
     * Format distance for display
     */
    formatDistance(miles, km) {
        let text = '';

        if (miles < 0.1) {
            // Show in feet for very short distances
            const feet = miles * 5280;
            text = `${feet.toFixed(0)} ft`;
        } else if (miles < 1) {
            text = `${miles.toFixed(2)} mi`;
        } else {
            text = `${miles.toFixed(2)} mi`;
        }

        // Add km
        if (km < 1) {
            text += ` (${(km * 1000).toFixed(0)} m)`;
        } else {
            text += ` (${km.toFixed(2)} km)`;
        }

        return text;
    }

    /**
     * Show distance in info window
     */
    showDistanceInfo(position, distanceText, miles, km) {
        // Close existing info window
        if (this.infoWindow) {
            this.infoWindow.close();
        }

        const content = `
            <div style="padding: 10px; min-width: 200px;">
                <div style="font-size: 18px; font-weight: bold; color: #FF5722; margin-bottom: 8px;">
                    📏 ${distanceText}
                </div>
                <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                    Click "Save" to keep this measurement
                </div>
                <button onclick="window.distanceTool.saveMeasurement()"
                        style="background: #0078d4; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-right: 8px;">
                    Save
                </button>
                <button onclick="window.distanceTool.clearCurrent()"
                        style="background: #d13438; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">
                    Clear
                </button>
            </div>
        `;

        this.infoWindow = new google.maps.InfoWindow({
            content: content,
            position: position
        });

        this.infoWindow.open(this.map);

        // Store for access from buttons
        window.distanceTool = this;
    }

    /**
     * Draw circle for radius measurement
     */
    drawCircle() {
        if (this.markers.length < 2) return;

        const center = this.markers[0].getPosition();
        const edge = this.markers[1].getPosition();

        // Calculate radius in meters
        const radiusMeters = google.maps.geometry.spherical.computeDistanceBetween(center, edge);

        this.circle = new google.maps.Circle({
            strokeColor: '#2196F3',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#2196F3',
            fillOpacity: 0.15,
            map: this.map,
            center: center,
            radius: radiusMeters
        });
    }

    /**
     * Update circle position
     */
    updateCircle() {
        if (!this.circle || this.markers.length < 2) return;

        const center = this.markers[0].getPosition();
        const edge = this.markers[1].getPosition();

        const radiusMeters = google.maps.geometry.spherical.computeDistanceBetween(center, edge);

        this.circle.setCenter(center);
        this.circle.setRadius(radiusMeters);
    }

    /**
     * Calculate and display radius
     */
    calculateRadius() {
        if (this.markers.length < 2) return;

        const center = this.markers[0].getPosition();
        const edge = this.markers[1].getPosition();

        // Calculate radius using Google Maps Geometry library
        const radiusMeters = google.maps.geometry.spherical.computeDistanceBetween(center, edge);

        // Convert to miles and kilometers
        const radiusMiles = radiusMeters / 1609.34;
        const radiusKm = radiusMeters / 1000;
        const diameterMiles = radiusMiles * 2;
        const diameterKm = radiusKm * 2;

        // Format for display
        const radiusText = this.formatDistance(radiusMiles, radiusKm);
        const diameterText = this.formatDistance(diameterMiles, diameterKm);

        // Show in info window
        this.showRadiusInfo(center, radiusText, diameterText, radiusMiles, radiusKm);

        return { meters: radiusMeters, miles: radiusMiles, km: radiusKm };
    }

    /**
     * Update radius (for dragging)
     */
    updateRadius() {
        if (this.markers.length === 2 && this.circle) {
            const center = this.markers[0].getPosition();
            const radius = this.calculateRadius();
            if (radius) {
                const radiusText = this.formatDistance(radius.miles, radius.km);
                const diameterText = this.formatDistance(radius.miles * 2, radius.km * 2);
                this.showRadiusInfo(center, radiusText, diameterText, radius.miles, radius.km);
            }
        }
    }

    /**
     * Show radius and diameter in info window
     */
    showRadiusInfo(position, radiusText, diameterText, radiusMiles, radiusKm) {
        // Close existing info window
        if (this.infoWindow) {
            this.infoWindow.close();
        }

        const content = `
            <div style="padding: 10px; min-width: 250px;">
                <div style="font-size: 16px; font-weight: bold; color: #2196F3; margin-bottom: 8px;">
                    📏 Radius Circle
                </div>
                <div style="margin-bottom: 8px;">
                    <div style="font-size: 14px; margin-bottom: 4px;">
                        <strong>Radius:</strong> ${radiusText}
                    </div>
                    <div style="font-size: 14px;">
                        <strong>Diameter:</strong> ${diameterText}
                    </div>
                </div>
                <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
                    Click "Save" to keep this measurement
                </div>
                <button onclick="window.distanceTool.saveMeasurement()"
                        style="background: #0078d4; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-right: 8px;">
                    Save
                </button>
                <button onclick="window.distanceTool.clearCurrent()"
                        style="background: #d13438; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">
                    Clear
                </button>
            </div>
        `;

        this.infoWindow = new google.maps.InfoWindow({
            content: content,
            position: position
        });

        this.infoWindow.open(this.map);

        // Store for access from buttons
        window.distanceTool = this;
    }

    /**
     * Save current measurement
     */
    saveMeasurement() {
        if (this.markers.length === 2) {
            let measurement;
            let successMessage;

            if (this.mode === 'radius') {
                const radius = this.calculateRadius();
                measurement = {
                    id: Utils.generateId('measurement'),
                    type: 'radius',
                    center: {
                        lat: this.markers[0].getPosition().lat(),
                        lng: this.markers[0].getPosition().lng()
                    },
                    edge: {
                        lat: this.markers[1].getPosition().lat(),
                        lng: this.markers[1].getPosition().lng()
                    },
                    radius: radius,
                    diameter: {
                        meters: radius.meters * 2,
                        miles: radius.miles * 2,
                        km: radius.km * 2
                    },
                    timestamp: new Date().toISOString()
                };
                successMessage = `Radius measurement saved: ${this.formatDistance(radius.miles, radius.km)}`;
            } else {
                const distance = this.calculateDistance();
                measurement = {
                    id: Utils.generateId('measurement'),
                    type: 'distance',
                    point1: {
                        lat: this.markers[0].getPosition().lat(),
                        lng: this.markers[0].getPosition().lng()
                    },
                    point2: {
                        lat: this.markers[1].getPosition().lat(),
                        lng: this.markers[1].getPosition().lng()
                    },
                    distance: distance,
                    timestamp: new Date().toISOString()
                };
                successMessage = `Measurement saved: ${this.formatDistance(distance.miles, distance.km)}`;
            }

            this.measurements.push(measurement);

            // Emit event
            if (window.eventBus) {
                eventBus.emit('measurement.saved', measurement);
            }

            // Show toast
            if (window.toastManager) {
                toastManager.success(successMessage);
            }

            console.log('Measurement saved:', measurement);
        }
    }

    /**
     * Clear current measurement
     */
    clearCurrent() {
        // Remove markers
        this.markers.forEach(marker => {
            marker.setMap(null);
        });
        this.markers = [];

        // Remove line
        if (this.line) {
            this.line.setMap(null);
            this.line = null;
        }

        // Remove circle
        if (this.circle) {
            this.circle.setMap(null);
            this.circle = null;
        }

        // Close info window
        if (this.infoWindow) {
            this.infoWindow.close();
            this.infoWindow = null;
        }
    }

    /**
     * Clear all measurements
     */
    clearAll() {
        this.clearCurrent();
        this.measurements = [];

        if (window.toastManager) {
            toastManager.success('All measurements cleared');
        }
    }

    /**
     * Get all saved measurements
     */
    getMeasurements() {
        return this.measurements;
    }

    /**
     * Delete a specific measurement
     */
    deleteMeasurement(measurementId) {
        const index = this.measurements.findIndex(m => m.id === measurementId);
        if (index !== -1) {
            this.measurements.splice(index, 1);

            if (window.eventBus) {
                eventBus.emit('measurement.deleted', { measurementId });
            }
        }
    }

    /**
     * Show measurement instructions
     */
    showInstructions() {
        const instructions = document.getElementById('measurementInstructions');
        if (instructions) {
            instructions.style.display = 'block';
            this.updateInstructions();
        }
    }

    /**
     * Hide measurement instructions
     */
    hideInstructions() {
        const instructions = document.getElementById('measurementInstructions');
        if (instructions) {
            instructions.style.display = 'none';
        }
    }

    /**
     * Export measurements as CSV
     */
    exportMeasurements() {
        if (this.measurements.length === 0) {
            if (window.toastManager) {
                toastManager.warning('No measurements to export');
            }
            return;
        }

        const csv = this.measurementsToCSV();
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `measurements-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (window.toastManager) {
            toastManager.success('Measurements exported to CSV');
        }
    }

    /**
     * Convert measurements to CSV
     */
    measurementsToCSV() {
        const headers = ['ID', 'Point 1 Lat', 'Point 1 Lng', 'Point 2 Lat', 'Point 2 Lng', 'Distance (mi)', 'Distance (km)', 'Distance (m)', 'Timestamp'];
        const rows = this.measurements.map(m => [
            m.id,
            m.point1.lat,
            m.point1.lng,
            m.point2.lat,
            m.point2.lng,
            m.distance.miles.toFixed(4),
            m.distance.km.toFixed(4),
            m.distance.meters.toFixed(2),
            m.timestamp
        ]);

        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DistanceTool;
}
