/**
 * Activity Log System
 * v3.0 Phase 3: Track all changes for audit trail and collaboration
 * Part of Collaboration 2.0
 */

class ActivityLog {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.activities = [];
        this.maxActivities = 500; // Keep last 500 activities
        this.sessionId = Utils.generateId('session');

        // Load persisted activities
        this.loadActivities();
    }

    /**
     * Initialize activity log
     */
    initialize() {
        this.setupEventListeners();
        console.log('Activity Log initialized (v3.0)');
    }

    /**
     * Log an activity
     */
    log(type, action, details = {}) {
        const activity = {
            id: Utils.generateId('activity'),
            type: type, // 'layer', 'feature', 'group', 'workspace', 'system'
            action: action, // 'created', 'updated', 'deleted', 'renamed', etc.
            details: details,
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            user: this.getCurrentUser()
        };

        // Add to beginning of array (newest first)
        this.activities.unshift(activity);

        // Limit size
        if (this.activities.length > this.maxActivities) {
            this.activities = this.activities.slice(0, this.maxActivities);
        }

        // Persist
        this.saveActivities();

        // Emit event
        if (window.eventBus) {
            eventBus.emit('activity.logged', activity);
        }

        return activity;
    }

    /**
     * Get current user from Supabase Auth session.
     */
    getCurrentUser() {
        if (typeof authManager !== 'undefined' && authManager.getCurrentUser()) {
            const user = authManager.getCurrentUser();
            return {
                id: user.id,
                name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
                email: user.email,
                isAnonymous: false
            };
        }

        // Fallback for pre-auth state
        return {
            id: this.sessionId,
            name: 'Anonymous',
            email: null,
            isAnonymous: true
        };
    }

    /**
     * Get all activities
     */
    getActivities(filter = {}) {
        let filtered = [...this.activities];

        // Filter by type
        if (filter.type) {
            filtered = filtered.filter(a => a.type === filter.type);
        }

        // Filter by action
        if (filter.action) {
            filtered = filtered.filter(a => a.action === filter.action);
        }

        // Filter by date range
        if (filter.startDate) {
            const start = new Date(filter.startDate);
            filtered = filtered.filter(a => new Date(a.timestamp) >= start);
        }

        if (filter.endDate) {
            const end = new Date(filter.endDate);
            filtered = filtered.filter(a => new Date(a.timestamp) <= end);
        }

        // Filter by user
        if (filter.userId) {
            filtered = filtered.filter(a => a.user && a.user.id === filter.userId);
        }

        // Limit results
        if (filter.limit) {
            filtered = filtered.slice(0, filter.limit);
        }

        return filtered;
    }

    /**
     * Get recent activities
     */
    getRecent(count = 50) {
        return this.activities.slice(0, count);
    }

    /**
     * Get activities by entity
     */
    getByEntity(entityType, entityId) {
        return this.activities.filter(a =>
            a.details.entityType === entityType &&
            a.details.entityId === entityId
        );
    }

    /**
     * Clear all activities
     */
    clear() {
        this.activities = [];
        this.saveActivities();

        if (window.eventBus) {
            eventBus.emit('activity.cleared');
        }
    }

    /**
     * Setup event listeners for automatic logging
     */
    setupEventListeners() {
        if (!window.eventBus) return;

        // Layer events
        eventBus.on('layer.created', ({ layerId, layer }) => {
            this.log('layer', 'created', {
                entityType: 'layer',
                entityId: layerId,
                entityName: layer.name,
                layerType: layer.type
            });
        });

        eventBus.on('layer.deleted', ({ layerId, layerName }) => {
            this.log('layer', 'deleted', {
                entityType: 'layer',
                entityId: layerId,
                entityName: layerName
            });
        });

        eventBus.on('layer.renamed', ({ layerId, oldName, newName }) => {
            this.log('layer', 'renamed', {
                entityType: 'layer',
                entityId: layerId,
                oldName: oldName,
                newName: newName
            });
        });

        // Feature events
        eventBus.on('features.added', ({ layerId, count, layerName }) => {
            this.log('feature', 'created', {
                entityType: 'layer',
                entityId: layerId,
                entityName: layerName,
                count: count
            });
        });

        eventBus.on('feature.deleted', ({ layerId, featureId, layerName }) => {
            this.log('feature', 'deleted', {
                entityType: 'feature',
                entityId: featureId,
                layerId: layerId,
                layerName: layerName
            });
        });

        eventBus.on('feature.updated', ({ layerId, featureId, layerName }) => {
            this.log('feature', 'updated', {
                entityType: 'feature',
                entityId: featureId,
                layerId: layerId,
                layerName: layerName
            });
        });

        // Group events
        eventBus.on('group.created', ({ groupId, groupName }) => {
            this.log('group', 'created', {
                entityType: 'group',
                entityId: groupId,
                entityName: groupName
            });
        });

        eventBus.on('group.deleted', ({ groupId, groupName }) => {
            this.log('group', 'deleted', {
                entityType: 'group',
                entityId: groupId,
                entityName: groupName
            });
        });

        eventBus.on('group.renamed', ({ groupId, oldName, newName }) => {
            this.log('group', 'renamed', {
                entityType: 'group',
                entityId: groupId,
                oldName: oldName,
                newName: newName
            });
        });

        // Measurement events
        eventBus.on('measurement.saved', (measurement) => {
            this.log('measurement', 'created', {
                entityType: 'measurement',
                entityId: measurement.id,
                distance: measurement.distance
            });
        });

        eventBus.on('measurement.deleted', ({ measurementId }) => {
            this.log('measurement', 'deleted', {
                entityType: 'measurement',
                entityId: measurementId
            });
        });

        // Workspace events
        eventBus.on('profile.switched', ({ profileName }) => {
            this.log('workspace', 'switched', {
                entityType: 'workspace',
                entityName: profileName
            });
        });

        eventBus.on('profile.created', ({ profileName }) => {
            this.log('workspace', 'created', {
                entityType: 'workspace',
                entityName: profileName
            });
        });
    }

    /**
     * Save activities to localStorage
     */
    saveActivities() {
        try {
            localStorage.setItem('salesMapper_activityLog', JSON.stringify(this.activities));
        } catch (error) {
            console.error('Error saving activities:', error);
        }
    }

    /**
     * Load activities from localStorage
     */
    loadActivities() {
        try {
            const stored = localStorage.getItem('salesMapper_activityLog');
            if (stored) {
                this.activities = JSON.parse(stored);
            }
        } catch (error) {
            console.error('Error loading activities:', error);
            this.activities = [];
        }
    }

    /**
     * Export activities as JSON
     */
    exportJSON() {
        const data = {
            exportDate: new Date().toISOString(),
            activityCount: this.activities.length,
            activities: this.activities
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-log-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Export activities as CSV
     */
    exportCSV() {
        const headers = ['Timestamp', 'Type', 'Action', 'Entity', 'User', 'Details'];
        const rows = this.activities.map(a => [
            a.timestamp,
            a.type,
            a.action,
            a.details.entityName || a.details.entityId || '',
            a.user ? a.user.name : 'Unknown',
            this.formatDetailsForCSV(a.details)
        ]);

        const csv = [headers, ...rows].map(row =>
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-log-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Format details for CSV export
     */
    formatDetailsForCSV(details) {
        const parts = [];
        for (const [key, value] of Object.entries(details)) {
            if (key !== 'entityType' && key !== 'entityId' && key !== 'entityName') {
                parts.push(`${key}: ${value}`);
            }
        }
        return parts.join('; ');
    }

    /**
     * Get activity statistics
     */
    getStatistics() {
        const stats = {
            total: this.activities.length,
            byType: {},
            byAction: {},
            byUser: {},
            today: 0,
            thisWeek: 0,
            thisMonth: 0
        };

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        this.activities.forEach(activity => {
            const timestamp = new Date(activity.timestamp);

            // By type
            stats.byType[activity.type] = (stats.byType[activity.type] || 0) + 1;

            // By action
            stats.byAction[activity.action] = (stats.byAction[activity.action] || 0) + 1;

            // By user
            const userName = activity.user ? activity.user.name : 'Unknown';
            stats.byUser[userName] = (stats.byUser[userName] || 0) + 1;

            // Time-based
            if (timestamp >= today) stats.today++;
            if (timestamp >= weekAgo) stats.thisWeek++;
            if (timestamp >= monthAgo) stats.thisMonth++;
        });

        return stats;
    }

    /**
     * Render activity log UI
     */
    render() {
        const container = document.getElementById('activityLogContent');
        if (!container) {
            console.error('Activity log container not found');
            return;
        }

        const recent = this.getRecent(50);
        const stats = this.getStatistics();

        container.innerHTML = `
            <div class="activity-stats">
                <div class="stat-card">
                    <div class="stat-value">${stats.today}</div>
                    <div class="stat-label">Today</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.thisWeek}</div>
                    <div class="stat-label">This Week</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.total}</div>
                    <div class="stat-label">All Time</div>
                </div>
            </div>

            <div class="activity-list">
                <h4>Recent Activity</h4>
                ${recent.length === 0 ? '<p class="empty-state">No activity yet</p>' : ''}
                ${recent.map(activity => this.renderActivity(activity)).join('')}
            </div>
        `;
    }

    /**
     * Render single activity item
     */
    renderActivity(activity) {
        const icon = this.getActivityIcon(activity.type);
        const time = this.formatTimeAgo(activity.timestamp);
        const description = this.getActivityDescription(activity);

        return `
            <div class="activity-item" data-activity-id="${activity.id}">
                <div class="activity-icon">${icon}</div>
                <div class="activity-content">
                    <div class="activity-description">${description}</div>
                    <div class="activity-meta">
                        <span class="activity-user">${activity.user ? activity.user.name : 'Unknown'}</span>
                        <span class="activity-time">${time}</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Get icon for activity type
     */
    getActivityIcon(type) {
        const icons = {
            layer: '📁',
            feature: '📍',
            group: '📂',
            measurement: '📏',
            workspace: '🏢',
            system: '⚙️'
        };
        return icons[type] || '•';
    }

    /**
     * Get human-readable description
     */
    getActivityDescription(activity) {
        const { type, action, details } = activity;
        const name = details.entityName || 'Unknown';

        const descriptions = {
            layer: {
                created: `Created layer <strong>${name}</strong>`,
                deleted: `Deleted layer <strong>${name}</strong>`,
                renamed: `Renamed layer from <strong>${details.oldName}</strong> to <strong>${details.newName}</strong>`
            },
            feature: {
                created: `Added ${details.count} feature(s) to <strong>${name}</strong>`,
                deleted: `Deleted feature from <strong>${details.layerName}</strong>`,
                updated: `Updated feature in <strong>${details.layerName}</strong>`
            },
            group: {
                created: `Created group <strong>${name}</strong>`,
                deleted: `Deleted group <strong>${name}</strong>`,
                renamed: `Renamed group from <strong>${details.oldName}</strong> to <strong>${details.newName}</strong>`
            },
            measurement: {
                created: `Saved measurement (${details.distance?.miles?.toFixed(2)} mi)`,
                deleted: `Deleted measurement`
            },
            workspace: {
                created: `Created workspace <strong>${name}</strong>`,
                switched: `Switched to workspace <strong>${name}</strong>`
            }
        };

        return descriptions[type]?.[action] || `${type} ${action}`;
    }

    /**
     * Format time ago
     */
    formatTimeAgo(timestamp) {
        const now = new Date();
        const then = new Date(timestamp);
        const seconds = Math.floor((now - then) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;

        return then.toLocaleDateString();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActivityLog;
}
