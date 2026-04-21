/**
 * Data Services
 * Abstraction layer for local data persistence (localStorage).
 * Firebase/Supabase storage is handled by supabase-config.js.
 */

/**
 * Storage Service
 * Handles localStorage operations with error handling.
 * Used for column mapping templates, analytics preferences, and
 * other lightweight settings that don't need cloud storage.
 */
class StorageService {
    constructor(storageKey = 'app_data') {
        this.storageKey = storageKey;
        this.isAvailable = this.checkAvailability();
    }

    checkAvailability() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (error) {
            console.warn('localStorage not available:', error);
            return false;
        }
    }

    get(key, defaultValue = null) {
        if (!this.isAvailable) return defaultValue;
        try {
            const item = localStorage.getItem(`${this.storageKey}_${key}`);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error(`Error getting ${key} from storage:`, error);
            return defaultValue;
        }
    }

    set(key, value) {
        if (!this.isAvailable) return false;
        try {
            localStorage.setItem(`${this.storageKey}_${key}`, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`Error setting ${key} in storage:`, error);
            if (error.name === 'QuotaExceededError') {
                console.warn('Storage quota exceeded. Consider clearing old data.');
            }
            return false;
        }
    }

    remove(key) {
        if (!this.isAvailable) return false;
        try {
            localStorage.removeItem(`${this.storageKey}_${key}`);
            return true;
        } catch (error) {
            console.error(`Error removing ${key} from storage:`, error);
            return false;
        }
    }

    clear() {
        if (!this.isAvailable) return false;
        try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.storageKey)) keysToRemove.push(key);
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
            return true;
        } catch (error) {
            console.error('Error clearing storage:', error);
            return false;
        }
    }

    keys() {
        if (!this.isAvailable) return [];
        const keys = [];
        const prefix = `${this.storageKey}_`;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) keys.push(key.substring(prefix.length));
        }
        return keys;
    }

    getSize() {
        if (!this.isAvailable) return 0;
        let size = 0;
        const prefix = `${this.storageKey}_`;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                const value = localStorage.getItem(key);
                size += key.length + (value ? value.length : 0);
            }
        }
        return size;
    }

    getInfo() {
        return {
            available: this.isAvailable,
            keys: this.keys().length,
            estimatedSize: this.getSize(),
            estimatedSizeFormatted: Utils.formatFileSize(this.getSize())
        };
    }
}

// Singleton instance — initialized in initDataServices() called from app.js
let storageService;
