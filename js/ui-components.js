/**
 * UI Components
 * Reusable UI component managers for modals, toasts, loading overlay, etc.
 */

/**
 * Modal Manager
 * Manages modal dialogs
 */
class ModalManager {
    constructor() {
        this.modals = new Map();
        this.setupCloseHandlers();
    }

    /**
     * Setup global close handlers
     */
    setupCloseHandlers() {
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.close(e.target.id);
            }
        });

        // Setup close buttons
        document.querySelectorAll('.close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modalId = e.target.dataset.modal;
                if (modalId) this.close(modalId);
            });
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAll();
            }
        });
    }

    /**
     * Show modal
     * @param {string} modalId - Modal ID
     */
    show(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('show');
            this.modals.set(modalId, modal);
        }
    }

    /**
     * Close modal
     * @param {string} modalId - Modal ID
     */
    close(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
            this.modals.delete(modalId);
        }
    }

    /**
     * Close all modals
     */
    closeAll() {
        this.modals.forEach((modal, id) => {
            this.close(id);
        });
    }

    /**
     * Check if modal is open
     * @param {string} modalId - Modal ID
     * @returns {boolean} True if open
     */
    isOpen(modalId) {
        return this.modals.has(modalId);
    }

    /**
     * Get currently open modals
     * @returns {Array} Array of modal IDs
     */
    getOpenModals() {
        return Array.from(this.modals.keys());
    }
}

/**
 * Toast Manager
 * Manages toast notifications
 */
class ToastManager {
    constructor() {
        this.container = null;
        this.toasts = [];
        this.initialize();
    }

    /**
     * Initialize toast container
     */
    initialize() {
        this.container = document.querySelector('.toast-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    }

    /**
     * Show toast notification
     * @param {string} message - Toast message
     * @param {string} type - Toast type ('success', 'error', 'warning', 'info')
     * @param {number} duration - Duration in milliseconds
     * @returns {string} Toast ID
     */
    show(message, type = 'info', duration = null) {
        const toastDuration = duration || (type === 'error' ? AppConfig.ui.toastDurationLong : AppConfig.ui.toastDuration);
        const toastId = Utils.generateId('toast');

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.dataset.id = toastId;

        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <span class="toast-message">${message}</span>
            <span class="toast-close">×</span>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.remove(toastId);
        });

        this.container.appendChild(toast);
        this.toasts.push({ id: toastId, element: toast });

        // Auto-remove after duration
        setTimeout(() => {
            this.remove(toastId);
        }, toastDuration);

        console.log(`[${type.toUpperCase()}] ${message}`);

        return toastId;
    }

    /**
     * Show success toast
     * @param {string} message - Toast message
     * @param {number} duration - Duration in milliseconds
     * @returns {string} Toast ID
     */
    success(message, duration) {
        return this.show(message, 'success', duration);
    }

    /**
     * Show error toast
     * @param {string} message - Toast message
     * @param {number} duration - Duration in milliseconds
     * @returns {string} Toast ID
     */
    error(message, duration) {
        return this.show(message, 'error', duration);
    }

    /**
     * Show warning toast
     * @param {string} message - Toast message
     * @param {number} duration - Duration in milliseconds
     * @returns {string} Toast ID
     */
    warning(message, duration) {
        return this.show(message, 'warning', duration);
    }

    /**
     * Show info toast
     * @param {string} message - Toast message
     * @param {number} duration - Duration in milliseconds
     * @returns {string} Toast ID
     */
    info(message, duration) {
        return this.show(message, 'info', duration);
    }

    /**
     * Remove toast
     * @param {string} toastId - Toast ID
     */
    remove(toastId) {
        const toastIndex = this.toasts.findIndex(t => t.id === toastId);
        if (toastIndex > -1) {
            const toast = this.toasts[toastIndex];
            toast.element.remove();
            this.toasts.splice(toastIndex, 1);
        }
    }

    /**
     * Remove all toasts
     */
    removeAll() {
        this.toasts.forEach(toast => {
            toast.element.remove();
        });
        this.toasts = [];
    }
}

/**
 * Loading Overlay Manager
 * Manages loading overlay
 */
class LoadingManager {
    constructor() {
        this.overlay = null;
        this.initialize();
    }

    /**
     * Initialize loading overlay
     */
    initialize() {
        this.overlay = document.getElementById('loadingOverlay');
        if (!this.overlay) {
            console.warn('Loading overlay element not found');
        }
    }

    /**
     * Show loading overlay
     * @param {string} message - Loading message
     */
    show(message = 'Loading...') {
        if (this.overlay) {
            const messageEl = this.overlay.querySelector('p');
            if (messageEl) {
                messageEl.textContent = message;
            }
            this.overlay.classList.add('show');
        }
    }

    /**
     * Hide loading overlay
     */
    hide() {
        if (this.overlay) {
            this.overlay.classList.remove('show');
        }
    }

    /**
     * Check if loading overlay is visible
     * @returns {boolean} True if visible
     */
    isVisible() {
        return this.overlay && this.overlay.classList.contains('show');
    }
}

/**
 * Context Menu Manager
 * Manages context menus
 */
class ContextMenuManager {
    constructor() {
        this.menus = new Map();
        this.currentMenu = null;
        this.setupClickOutside();
    }

    /**
     * Setup click outside handler
     */
    setupClickOutside() {
        window.addEventListener('click', (e) => {
            // Don't close if clicking menu trigger or menu itself
            if (!e.target.closest('.layer-menu-btn') && !e.target.closest('.context-menu')) {
                this.closeAll();
            }
        });
    }

    /**
     * Show context menu
     * @param {string} menuId - Menu ID
     * @param {Object} position - Position {x, y}
     * @param {*} data - Associated data
     */
    show(menuId, position, data = null) {
        this.closeAll();

        const menu = document.getElementById(menuId);
        if (menu) {
            menu.style.top = `${position.y}px`;
            menu.style.left = `${position.x}px`;
            menu.classList.add('show');

            this.currentMenu = { id: menuId, element: menu, data: data };
            this.menus.set(menuId, this.currentMenu);
        }
    }

    /**
     * Close context menu
     * @param {string} menuId - Menu ID
     */
    close(menuId) {
        const menu = document.getElementById(menuId);
        if (menu) {
            menu.classList.remove('show');
            this.menus.delete(menuId);
            if (this.currentMenu && this.currentMenu.id === menuId) {
                this.currentMenu = null;
            }
        }
    }

    /**
     * Close all context menus
     */
    closeAll() {
        this.menus.forEach((menu, id) => {
            this.close(id);
        });
    }

    /**
     * Get current menu data
     * @returns {*} Menu data
     */
    getCurrentData() {
        return this.currentMenu ? this.currentMenu.data : null;
    }
}

/**
 * Event Bus
 * Centralized event handling
 */
class EventBus {
    constructor() {
        this.events = new Map();
    }

    /**
     * Subscribe to event
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }

        this.events.get(event).push(callback);

        // Return unsubscribe function
        return () => {
            const callbacks = this.events.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }

    /**
     * Subscribe to event once
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    once(event, callback) {
        const unsubscribe = this.on(event, (...args) => {
            unsubscribe();
            callback(...args);
        });
        return unsubscribe;
    }

    /**
     * Emit event
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (this.events.has(event)) {
            this.events.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Remove all listeners for event
     * @param {string} event - Event name
     */
    off(event) {
        this.events.delete(event);
    }

    /**
     * Remove all event listeners
     */
    clear() {
        this.events.clear();
    }

    /**
     * Get event names
     * @returns {Array} Event names
     */
    getEvents() {
        return Array.from(this.events.keys());
    }

    /**
     * Get listener count for event
     * @param {string} event - Event name
     * @returns {number} Listener count
     */
    listenerCount(event) {
        return this.events.has(event) ? this.events.get(event).length : 0;
    }
}

/**
 * Form Manager
 * Manages form operations
 */
class FormManager {
    /**
     * Get form data as object
     * @param {HTMLFormElement|string} form - Form element or ID
     * @returns {Object} Form data
     */
    static getFormData(form) {
        const formElement = typeof form === 'string' ? document.getElementById(form) : form;
        if (!formElement) return {};

        const formData = new FormData(formElement);
        const data = {};

        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }

        return data;
    }

    /**
     * Set form data from object
     * @param {HTMLFormElement|string} form - Form element or ID
     * @param {Object} data - Data object
     */
    static setFormData(form, data) {
        const formElement = typeof form === 'string' ? document.getElementById(form) : form;
        if (!formElement) return;

        Object.entries(data).forEach(([key, value]) => {
            const input = formElement.querySelector(`[name="${key}"]`);
            if (input) {
                if (input.type === 'checkbox') {
                    input.checked = Utils.parseBoolean(value);
                } else if (input.type === 'radio') {
                    const radio = formElement.querySelector(`[name="${key}"][value="${value}"]`);
                    if (radio) radio.checked = true;
                } else {
                    input.value = value || '';
                }
            }
        });
    }

    /**
     * Clear form
     * @param {HTMLFormElement|string} form - Form element or ID
     */
    static clearForm(form) {
        const formElement = typeof form === 'string' ? document.getElementById(form) : form;
        if (formElement) {
            formElement.reset();
        }
    }

    /**
     * Validate form
     * @param {HTMLFormElement|string} form - Form element or ID
     * @returns {boolean} True if valid
     */
    static validateForm(form) {
        const formElement = typeof form === 'string' ? document.getElementById(form) : form;
        return formElement ? formElement.checkValidity() : false;
    }

    /**
     * Get validation errors
     * @param {HTMLFormElement|string} form - Form element or ID
     * @returns {Array} Validation errors
     */
    static getValidationErrors(form) {
        const formElement = typeof form === 'string' ? document.getElementById(form) : form;
        if (!formElement) return [];

        const errors = [];
        const inputs = formElement.querySelectorAll('input, select, textarea');

        inputs.forEach(input => {
            if (!input.checkValidity()) {
                errors.push({
                    field: input.name,
                    message: input.validationMessage
                });
            }
        });

        return errors;
    }
}

// Create singleton instances
const modalManager = new ModalManager();
const toastManager = new ToastManager();
const loadingManager = new LoadingManager();
const contextMenuManager = new ContextMenuManager();
const eventBus = new EventBus();

// Make eventBus globally accessible for ActivityLog and NotificationCenter
window.eventBus = eventBus;
