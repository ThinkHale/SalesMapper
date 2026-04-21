/**
 * Notification Center
 * v3.0 Phase 3: Real-time notifications and alerts
 * Part of Collaboration 2.0
 */

class NotificationCenter {
    constructor() {
        this.notifications = [];
        this.maxNotifications = 100;
        this.unreadCount = 0;
        this.preferences = this.loadPreferences();

        // Load persisted notifications
        this.loadNotifications();
    }

    /**
     * Initialize notification center
     */
    initialize() {
        this.setupEventListeners();
        this.updateBadge();
        console.log('Notification Center initialized (v3.0)');
    }

    /**
     * Setup event listeners for activity logging
     */
    setupEventListeners() {
        if (!window.eventBus) return;

        // Listen to all activity events
        eventBus.on('activity.logged', (activity) => {
            this.handleActivity(activity);
        });

        // Listen to specific high-priority events
        eventBus.on('layer.deleted', ({ layerId, layerName }) => {
            this.notify({
                type: 'warning',
                title: 'Layer Deleted',
                message: `Layer "${layerName}" has been deleted`,
                priority: 'high',
                action: null
            });
        });

        eventBus.on('profile.switched', ({ profileName }) => {
            this.notify({
                type: 'info',
                title: 'Profile Switched',
                message: `Switched to workspace "${profileName}"`,
                priority: 'normal',
                action: null
            });
        });
    }

    /**
     * Handle activity and create notification if needed
     */
    handleActivity(activity) {
        // Check if this type of activity should trigger a notification
        if (!this.shouldNotify(activity)) {
            return;
        }

        const notification = {
            id: Utils.generateId('notification'),
            activityId: activity.id,
            type: this.getNotificationType(activity),
            title: this.getNotificationTitle(activity),
            message: this.getNotificationMessage(activity),
            timestamp: activity.timestamp,
            read: false,
            priority: this.getNotificationPriority(activity),
            action: this.getNotificationAction(activity)
        };

        this.addNotification(notification);

        // Show toast for high-priority notifications
        if (notification.priority === 'high' && window.toastManager) {
            toastManager.show(notification.message, notification.type, 5000);
        }
    }

    /**
     * Check if activity should trigger a notification
     */
    shouldNotify(activity) {
        const prefs = this.preferences;

        // Check if notifications are enabled
        if (!prefs.enabled) return false;

        // Check if this type is enabled
        const typeKey = `notify${activity.type.charAt(0).toUpperCase()}${activity.type.slice(1)}`;
        if (prefs[typeKey] === false) return false;

        // Check if this action is enabled
        if (activity.action === 'updated' && !prefs.notifyUpdates) return false;
        if (activity.action === 'deleted' && !prefs.notifyDeletes) return false;

        return true;
    }

    /**
     * Get notification type from activity
     */
    getNotificationType(activity) {
        if (activity.action === 'deleted') return 'warning';
        if (activity.action === 'created') return 'success';
        return 'info';
    }

    /**
     * Get notification title from activity
     */
    getNotificationTitle(activity) {
        const actionMap = {
            created: 'Created',
            deleted: 'Deleted',
            updated: 'Updated',
            renamed: 'Renamed'
        };

        const typeMap = {
            layer: 'Layer',
            feature: 'Feature',
            group: 'Group',
            workspace: 'Workspace',
            measurement: 'Measurement'
        };

        return `${typeMap[activity.type]} ${actionMap[activity.action]}`;
    }

    /**
     * Get notification message from activity
     */
    getNotificationMessage(activity) {
        const { type, action, details } = activity;
        const name = details.entityName || 'Unknown';

        const messages = {
            layer: {
                created: `Layer "${name}" was created`,
                deleted: `Layer "${name}" was deleted`,
                renamed: `Layer renamed from "${details.oldName}" to "${details.newName}"`
            },
            feature: {
                created: `${details.count} feature(s) added to "${name}"`,
                deleted: `Feature deleted from "${details.layerName}"`,
                updated: `Feature updated in "${details.layerName}"`
            },
            group: {
                created: `Group "${name}" was created`,
                deleted: `Group "${name}" was deleted`,
                renamed: `Group renamed from "${details.oldName}" to "${details.newName}"`
            },
            measurement: {
                created: `Measurement saved (${details.distance?.miles?.toFixed(2)} mi)`,
                deleted: `Measurement deleted`
            },
            workspace: {
                created: `Workspace "${name}" was created`,
                switched: `Switched to workspace "${name}"`
            }
        };

        return messages[type]?.[action] || `${type} ${action}`;
    }

    /**
     * Get notification priority
     */
    getNotificationPriority(activity) {
        // High priority for deletions
        if (activity.action === 'deleted') return 'high';

        // High priority for layer operations
        if (activity.type === 'layer' && activity.action === 'created') return 'high';

        // Normal priority for everything else
        return 'normal';
    }

    /**
     * Get notification action (optional)
     */
    getNotificationAction(activity) {
        // Could add actions like "Undo", "View", etc.
        return null;
    }

    /**
     * Add notification
     */
    addNotification(notification) {
        // Add to beginning
        this.notifications.unshift(notification);

        // Update unread count
        this.unreadCount++;

        // Limit size
        if (this.notifications.length > this.maxNotifications) {
            this.notifications = this.notifications.slice(0, this.maxNotifications);
        }

        // Persist
        this.saveNotifications();

        // Update UI
        this.updateBadge();

        // Emit event
        if (window.eventBus) {
            eventBus.emit('notification.added', notification);
        }
    }

    /**
     * Create notification manually (for custom notifications)
     */
    notify({ type, title, message, priority = 'normal', action = null }) {
        const notification = {
            id: Utils.generateId('notification'),
            activityId: null,
            type: type,
            title: title,
            message: message,
            timestamp: new Date().toISOString(),
            read: false,
            priority: priority,
            action: action
        };

        this.addNotification(notification);

        // Show toast
        if (window.toastManager && priority === 'high') {
            toastManager.show(message, type, 5000);
        }
    }

    /**
     * Mark notification as read
     */
    markAsRead(notificationId) {
        const notification = this.notifications.find(n => n.id === notificationId);
        if (notification && !notification.read) {
            notification.read = true;
            this.unreadCount = Math.max(0, this.unreadCount - 1);
            this.saveNotifications();
            this.updateBadge();

            if (window.eventBus) {
                eventBus.emit('notification.read', notificationId);
            }
        }
    }

    /**
     * Mark all notifications as read
     */
    markAllAsRead() {
        this.notifications.forEach(n => n.read = true);
        this.unreadCount = 0;
        this.saveNotifications();
        this.updateBadge();

        if (window.eventBus) {
            eventBus.emit('notifications.allRead');
        }
    }

    /**
     * Delete notification
     */
    deleteNotification(notificationId) {
        const index = this.notifications.findIndex(n => n.id === notificationId);
        if (index !== -1) {
            const notification = this.notifications[index];
            if (!notification.read) {
                this.unreadCount = Math.max(0, this.unreadCount - 1);
            }
            this.notifications.splice(index, 1);
            this.saveNotifications();
            this.updateBadge();

            if (window.eventBus) {
                eventBus.emit('notification.deleted', notificationId);
            }
        }
    }

    /**
     * Clear all notifications
     */
    clearAll() {
        this.notifications = [];
        this.unreadCount = 0;
        this.saveNotifications();
        this.updateBadge();

        if (window.eventBus) {
            eventBus.emit('notifications.cleared');
        }
    }

    /**
     * Get all notifications
     */
    getNotifications(filter = {}) {
        let filtered = [...this.notifications];

        // Filter by read status
        if (filter.unreadOnly) {
            filtered = filtered.filter(n => !n.read);
        }

        // Filter by type
        if (filter.type) {
            filtered = filtered.filter(n => n.type === filter.type);
        }

        // Filter by priority
        if (filter.priority) {
            filtered = filtered.filter(n => n.priority === filter.priority);
        }

        // Limit results
        if (filter.limit) {
            filtered = filtered.slice(0, filter.limit);
        }

        return filtered;
    }

    /**
     * Get unread count
     */
    getUnreadCount() {
        return this.unreadCount;
    }

    /**
     * Update notification badge
     */
    updateBadge() {
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            if (this.unreadCount > 0) {
                badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    /**
     * Update notification preferences
     */
    updatePreferences(preferences) {
        this.preferences = { ...this.preferences, ...preferences };
        this.savePreferences();

        if (window.eventBus) {
            eventBus.emit('notification.preferencesUpdated', this.preferences);
        }
    }

    /**
     * Load preferences from localStorage
     */
    loadPreferences() {
        try {
            const stored = localStorage.getItem('salesMapper_notificationPreferences');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (error) {
            console.error('Error loading notification preferences:', error);
        }

        // Default preferences
        return {
            enabled: true,
            notifyLayer: true,
            notifyFeature: false, // Too noisy
            notifyGroup: true,
            notifyWorkspace: true,
            notifyMeasurement: false,
            notifyUpdates: false, // Too noisy
            notifyDeletes: true,
            showToasts: true,
            playSound: false
        };
    }

    /**
     * Save preferences to localStorage
     */
    savePreferences() {
        try {
            localStorage.setItem('salesMapper_notificationPreferences', JSON.stringify(this.preferences));
        } catch (error) {
            console.error('Error saving notification preferences:', error);
        }
    }

    /**
     * Save notifications to localStorage
     */
    saveNotifications() {
        try {
            const data = {
                notifications: this.notifications,
                unreadCount: this.unreadCount
            };
            localStorage.setItem('salesMapper_notifications', JSON.stringify(data));
        } catch (error) {
            console.error('Error saving notifications:', error);
        }
    }

    /**
     * Load notifications from localStorage
     */
    loadNotifications() {
        try {
            const stored = localStorage.getItem('salesMapper_notifications');
            if (stored) {
                const data = JSON.parse(stored);
                this.notifications = data.notifications || [];
                this.unreadCount = data.unreadCount || 0;
            }
        } catch (error) {
            console.error('Error loading notifications:', error);
            this.notifications = [];
            this.unreadCount = 0;
        }
    }

    /**
     * Render notification center UI
     */
    render() {
        const container = document.getElementById('notificationCenterContent');
        if (!container) {
            console.error('Notification center container not found');
            return;
        }

        const recent = this.getNotifications({ limit: 50 });
        const unread = this.getNotifications({ unreadOnly: true }).length;

        container.innerHTML = `
            <div class="notification-header">
                <div class="notification-stats">
                    <span class="unread-count">${unread} unread</span>
                    <span class="total-count">${this.notifications.length} total</span>
                </div>
                <div class="notification-actions">
                    <button class="btn btn-sm" onclick="window.notificationCenter.markAllAsRead()">
                        Mark all read
                    </button>
                    <button class="btn btn-sm" onclick="window.notificationCenter.clearAll()">
                        Clear all
                    </button>
                </div>
            </div>

            <div class="notification-list">
                ${recent.length === 0 ? '<p class="empty-state">No notifications</p>' : ''}
                ${recent.map(notification => this.renderNotification(notification)).join('')}
            </div>
        `;
    }

    /**
     * Render single notification item
     */
    renderNotification(notification) {
        const time = this.formatTimeAgo(notification.timestamp);
        const icon = this.getNotificationIcon(notification.type);
        const readClass = notification.read ? 'read' : 'unread';
        const priorityClass = notification.priority === 'high' ? 'high-priority' : '';

        return `
            <div class="notification-item ${readClass} ${priorityClass}"
                 data-notification-id="${notification.id}"
                 onclick="window.notificationCenter.markAsRead('${notification.id}')">
                <div class="notification-icon ${notification.type}">${icon}</div>
                <div class="notification-content">
                    <div class="notification-title">${notification.title}</div>
                    <div class="notification-message">${notification.message}</div>
                    <div class="notification-time">${time}</div>
                </div>
                <button class="notification-delete"
                        onclick="event.stopPropagation(); window.notificationCenter.deleteNotification('${notification.id}')">
                    ×
                </button>
            </div>
        `;
    }

    /**
     * Get icon for notification type
     */
    getNotificationIcon(type) {
        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || 'ℹ';
    }

    /**
     * Format time ago
     */
    formatTimeAgo(timestamp) {
        const now = new Date();
        const then = new Date(timestamp);
        const seconds = Math.floor((now - then) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

        return then.toLocaleDateString();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationCenter;
}
