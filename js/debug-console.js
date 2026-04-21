/**
 * Debug Console Plugin
 * Captures console output for debugging and sharing
 * v1.0
 */

class DebugConsole {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000;
        this.isOpen = false;
        this.filters = {
            log: true,
            info: true,
            warn: true,
            error: true,
            event: true
        };
        this.originalConsole = {};
        this.panelElement = null;
        this.initialized = false;
    }

    /**
     * Initialize the debug console
     */
    initialize() {
        if (this.initialized) return;

        // Store original console methods
        this.originalConsole = {
            log: console.log.bind(console),
            info: console.info.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console)
        };

        // Override console methods
        console.log = (...args) => this.capture('log', args);
        console.info = (...args) => this.capture('info', args);
        console.warn = (...args) => this.capture('warn', args);
        console.error = (...args) => this.capture('error', args);

        // Listen to eventBus events
        if (window.eventBus) {
            this.setupEventListeners();
        }

        // Create UI
        this.createPanel();
        this.createToggleButton();

        this.initialized = true;
        this.log('info', ['Debug Console initialized']);
    }

    /**
     * Setup event listeners to capture eventBus events
     */
    setupEventListeners() {
        const originalEmit = eventBus.emit.bind(eventBus);
        eventBus.emit = (event, data) => {
            this.captureEvent(event, data);
            return originalEmit(event, data);
        };
    }

    /**
     * Capture console output
     */
    capture(type, args) {
        const entry = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            type: type,
            timestamp: new Date().toISOString(),
            time: new Date().toLocaleTimeString(),
            message: this.formatArgs(args),
            raw: args
        };

        this.logs.unshift(entry);

        // Limit log size
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }

        // Call original console method
        if (this.originalConsole[type]) {
            this.originalConsole[type](...args);
        }

        // Update UI if open
        if (this.isOpen) {
            this.renderLogs();
        }

        // Update badge count
        this.updateBadge();
    }

    /**
     * Capture eventBus events
     */
    captureEvent(event, data) {
        const entry = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            type: 'event',
            timestamp: new Date().toISOString(),
            time: new Date().toLocaleTimeString(),
            message: `[EVENT] ${event}`,
            eventName: event,
            eventData: data,
            raw: [event, data]
        };

        this.logs.unshift(entry);

        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }

        if (this.isOpen) {
            this.renderLogs();
        }

        this.updateBadge();
    }

    /**
     * Format arguments to string
     */
    formatArgs(args) {
        return args.map(arg => {
            if (arg === null) return 'null';
            if (arg === undefined) return 'undefined';
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
    }

    /**
     * Log directly to debug console
     */
    log(type, args) {
        this.capture(type, args);
    }

    /**
     * Create the debug console panel
     */
    createPanel() {
        this.panelElement = document.createElement('div');
        this.panelElement.id = 'debugConsolePanel';
        this.panelElement.className = 'debug-console-panel';
        this.panelElement.innerHTML = `
            <div class="debug-console-header">
                <h3>Debug Console</h3>
                <div class="debug-console-actions">
                    <button class="debug-btn" id="debugCopyAll" title="Copy All Logs">
                        Copy All
                    </button>
                    <button class="debug-btn" id="debugCopyFiltered" title="Copy Filtered Logs">
                        Copy Visible
                    </button>
                    <button class="debug-btn" id="debugExport" title="Export as JSON">
                        Export
                    </button>
                    <button class="debug-btn debug-btn-danger" id="debugClear" title="Clear Logs">
                        Clear
                    </button>
                    <button class="debug-btn" id="debugClose" title="Close">
                        &times;
                    </button>
                </div>
            </div>
            <div class="debug-console-filters">
                <label><input type="checkbox" id="filterLog" checked> Log</label>
                <label><input type="checkbox" id="filterInfo" checked> Info</label>
                <label><input type="checkbox" id="filterWarn" checked> Warn</label>
                <label><input type="checkbox" id="filterError" checked> Error</label>
                <label><input type="checkbox" id="filterEvent" checked> Events</label>
                <input type="text" id="debugSearch" placeholder="Search logs..." class="debug-search">
            </div>
            <div class="debug-console-logs" id="debugConsoleLogs">
                <div class="debug-empty">No logs captured yet</div>
            </div>
            <div class="debug-console-footer">
                <span id="debugLogCount">0 logs</span>
                <span id="debugMemory"></span>
            </div>
        `;

        document.body.appendChild(this.panelElement);

        // Setup event handlers
        this.setupPanelEvents();
    }

    /**
     * Setup panel event handlers
     */
    setupPanelEvents() {
        // Close button
        document.getElementById('debugClose').addEventListener('click', () => {
            this.close();
        });

        // Clear button
        document.getElementById('debugClear').addEventListener('click', () => {
            this.clear();
        });

        // Copy all button
        document.getElementById('debugCopyAll').addEventListener('click', () => {
            this.copyToClipboard(false);
        });

        // Copy filtered button
        document.getElementById('debugCopyFiltered').addEventListener('click', () => {
            this.copyToClipboard(true);
        });

        // Export button
        document.getElementById('debugExport').addEventListener('click', () => {
            this.exportLogs();
        });

        // Filter checkboxes
        ['Log', 'Info', 'Warn', 'Error', 'Event'].forEach(type => {
            const checkbox = document.getElementById(`filter${type}`);
            checkbox.addEventListener('change', (e) => {
                this.filters[type.toLowerCase()] = e.target.checked;
                this.renderLogs();
            });
        });

        // Search input
        document.getElementById('debugSearch').addEventListener('input', (e) => {
            this.renderLogs(e.target.value);
        });

        // Make panel draggable
        this.makeDraggable();
    }

    /**
     * Create toggle button
     */
    createToggleButton() {
        const button = document.createElement('button');
        button.id = 'debugConsoleToggle';
        button.className = 'debug-toggle-btn';
        button.innerHTML = `
            <span class="debug-icon">&#128187;</span>
            <span class="debug-badge" id="debugBadge">0</span>
        `;
        button.title = 'Toggle Debug Console';
        button.addEventListener('click', () => this.toggle());

        document.body.appendChild(button);
    }

    /**
     * Make panel draggable
     */
    makeDraggable() {
        const header = this.panelElement.querySelector('.debug-console-header');
        let isDragging = false;
        let offsetX, offsetY;

        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            offsetX = e.clientX - this.panelElement.offsetLeft;
            offsetY = e.clientY - this.panelElement.offsetTop;
            header.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            this.panelElement.style.left = (e.clientX - offsetX) + 'px';
            this.panelElement.style.top = (e.clientY - offsetY) + 'px';
            this.panelElement.style.right = 'auto';
            this.panelElement.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            header.style.cursor = 'grab';
        });
    }

    /**
     * Toggle panel visibility
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Open panel
     */
    open() {
        this.isOpen = true;
        this.panelElement.classList.add('show');
        this.renderLogs();
    }

    /**
     * Close panel
     */
    close() {
        this.isOpen = false;
        this.panelElement.classList.remove('show');
    }

    /**
     * Clear all logs
     */
    clear() {
        this.logs = [];
        this.renderLogs();
        this.updateBadge();
    }

    /**
     * Update badge count
     */
    updateBadge() {
        const badge = document.getElementById('debugBadge');
        if (badge) {
            const errorCount = this.logs.filter(l => l.type === 'error').length;
            const warnCount = this.logs.filter(l => l.type === 'warn').length;

            if (errorCount > 0) {
                badge.textContent = errorCount;
                badge.className = 'debug-badge error';
            } else if (warnCount > 0) {
                badge.textContent = warnCount;
                badge.className = 'debug-badge warn';
            } else {
                badge.textContent = this.logs.length;
                badge.className = 'debug-badge';
            }
        }
    }

    /**
     * Render logs to panel
     */
    renderLogs(searchTerm = '') {
        const container = document.getElementById('debugConsoleLogs');
        if (!container) return;

        const search = searchTerm.toLowerCase() || document.getElementById('debugSearch')?.value.toLowerCase() || '';

        // Filter logs
        const filteredLogs = this.logs.filter(log => {
            // Type filter
            if (!this.filters[log.type]) return false;

            // Search filter
            if (search && !log.message.toLowerCase().includes(search)) return false;

            return true;
        });

        if (filteredLogs.length === 0) {
            container.innerHTML = '<div class="debug-empty">No logs match current filters</div>';
        } else {
            container.innerHTML = filteredLogs.map(log => this.renderLogEntry(log)).join('');
        }

        // Update count
        const countEl = document.getElementById('debugLogCount');
        if (countEl) {
            countEl.textContent = `${filteredLogs.length} / ${this.logs.length} logs`;
        }

        // Add click handlers for expandable entries
        container.querySelectorAll('.debug-log-entry').forEach(entry => {
            entry.addEventListener('click', (e) => {
                if (e.target.classList.contains('debug-copy-entry')) return;
                entry.classList.toggle('expanded');
            });
        });

        // Copy individual entry handlers
        container.querySelectorAll('.debug-copy-entry').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const logId = btn.dataset.logId;
                const log = this.logs.find(l => l.id === logId);
                if (log) {
                    this.copyEntryToClipboard(log);
                }
            });
        });
    }

    /**
     * Render single log entry
     */
    renderLogEntry(log) {
        const typeClass = `debug-${log.type}`;
        const expandable = log.message.length > 100 || log.type === 'event';

        let details = '';
        if (log.type === 'event' && log.eventData) {
            try {
                details = JSON.stringify(log.eventData, null, 2);
            } catch (e) {
                details = String(log.eventData);
            }
        } else if (log.message.length > 100) {
            details = log.message;
        }

        return `
            <div class="debug-log-entry ${typeClass} ${expandable ? 'expandable' : ''}" data-log-id="${log.id}">
                <div class="debug-log-main">
                    <span class="debug-log-time">${log.time}</span>
                    <span class="debug-log-type">${log.type.toUpperCase()}</span>
                    <span class="debug-log-message">${this.escapeHtml(log.message.substring(0, 200))}${log.message.length > 200 ? '...' : ''}</span>
                    <button class="debug-copy-entry" data-log-id="${log.id}" title="Copy this entry">Copy</button>
                </div>
                ${details ? `<pre class="debug-log-details">${this.escapeHtml(details)}</pre>` : ''}
            </div>
        `;
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Copy logs to clipboard
     */
    copyToClipboard(filteredOnly = false) {
        const search = document.getElementById('debugSearch')?.value.toLowerCase() || '';

        let logsToExport = this.logs;

        if (filteredOnly) {
            logsToExport = this.logs.filter(log => {
                if (!this.filters[log.type]) return false;
                if (search && !log.message.toLowerCase().includes(search)) return false;
                return true;
            });
        }

        const text = this.formatLogsForCopy(logsToExport);

        navigator.clipboard.writeText(text).then(() => {
            if (window.toastManager) {
                toastManager.success(`Copied ${logsToExport.length} log entries to clipboard`);
            }
        }).catch(err => {
            // Fallback for older browsers
            this.fallbackCopy(text);
        });
    }

    /**
     * Copy single entry to clipboard
     */
    copyEntryToClipboard(log) {
        const text = this.formatLogsForCopy([log]);

        navigator.clipboard.writeText(text).then(() => {
            if (window.toastManager) {
                toastManager.success('Log entry copied to clipboard');
            }
        }).catch(err => {
            this.fallbackCopy(text);
        });
    }

    /**
     * Fallback copy method
     */
    fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);

        if (window.toastManager) {
            toastManager.success('Copied to clipboard');
        }
    }

    /**
     * Format logs for copying/exporting
     */
    formatLogsForCopy(logs) {
        const header = `=== SalesMapper Debug Console Export ===
Exported: ${new Date().toISOString()}
Total Entries: ${logs.length}
${'='.repeat(50)}

`;

        const body = logs.map(log => {
            let entry = `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}`;

            if (log.type === 'event' && log.eventData) {
                try {
                    entry += `\n  Event Data: ${JSON.stringify(log.eventData, null, 2).replace(/\n/g, '\n  ')}`;
                } catch (e) {
                    entry += `\n  Event Data: ${String(log.eventData)}`;
                }
            }

            return entry;
        }).join('\n\n');

        return header + body;
    }

    /**
     * Export logs as JSON file
     */
    exportLogs() {
        const data = {
            exportDate: new Date().toISOString(),
            appVersion: window.SalesMapperAPI?.version || 'unknown',
            totalLogs: this.logs.length,
            filters: this.filters,
            logs: this.logs.map(log => ({
                timestamp: log.timestamp,
                type: log.type,
                message: log.message,
                eventName: log.eventName || null,
                eventData: log.eventData || null
            }))
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debug-logs-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (window.toastManager) {
            toastManager.success('Debug logs exported');
        }
    }

    /**
     * Get logs for external access
     */
    getLogs(filter = {}) {
        let result = [...this.logs];

        if (filter.type) {
            result = result.filter(l => l.type === filter.type);
        }

        if (filter.since) {
            const since = new Date(filter.since);
            result = result.filter(l => new Date(l.timestamp) >= since);
        }

        if (filter.search) {
            const search = filter.search.toLowerCase();
            result = result.filter(l => l.message.toLowerCase().includes(search));
        }

        if (filter.limit) {
            result = result.slice(0, filter.limit);
        }

        return result;
    }

    /**
     * Restore original console methods
     */
    destroy() {
        if (this.originalConsole.log) {
            console.log = this.originalConsole.log;
            console.info = this.originalConsole.info;
            console.warn = this.originalConsole.warn;
            console.error = this.originalConsole.error;
        }

        if (this.panelElement) {
            this.panelElement.remove();
        }

        const toggleBtn = document.getElementById('debugConsoleToggle');
        if (toggleBtn) {
            toggleBtn.remove();
        }

        this.initialized = false;
    }
}

// Create singleton instance
const debugConsole = new DebugConsole();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        debugConsole.initialize();
    });
} else {
    debugConsole.initialize();
}

// Expose globally for easy access
window.debugConsole = debugConsole;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DebugConsole;
}
