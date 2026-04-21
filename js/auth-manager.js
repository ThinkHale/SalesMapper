/**
 * Auth Manager
 * Wraps Supabase Auth for sign-in, sign-up, magic link, and session management.
 * Dispatches 'auth:signed-in' and 'auth:signed-out' custom DOM events so app.js
 * can gate initialization behind authentication.
 */
class AuthManager {
    constructor(supabaseClient) {
        this.client = supabaseClient;
        this.currentUser = null;
        this._activeTab = 'signin';
    }

    /**
     * Initialize auth: check existing session, attach state listener.
     * Call this once before app init — it will show the login modal if needed.
     */
    async initialize() {
        // Check for an existing session (persisted in localStorage by Supabase SDK)
        const { data: { session } } = await this.client.auth.getSession();
        if (session && session.user) {
            this.currentUser = session.user;
            this._onSignedIn(session.user);
        } else {
            this._showAuthModal();
        }

        // Listen for all future auth state changes
        this.client.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                this.currentUser = session.user;
                this._onSignedIn(session.user);
            } else if (event === 'SIGNED_OUT') {
                this.currentUser = null;
                this._onSignedOut();
            }
        });

        // Wire up the modal UI events
        this._bindAuthModalEvents();
    }

    // ==================== AUTH ACTIONS ====================

    async signInWithPassword(email, password) {
        const { error } = await this.client.auth.signInWithPassword({ email, password });
        if (error) throw error;
    }

    async signUp(email, password) {
        const { error } = await this.client.auth.signUp({ email, password });
        if (error) throw error;
        // Supabase sends a confirmation email; show a message
        this._showAuthMessage('Check your email to confirm your account, then sign in.', false);
    }

    async signInWithMagicLink(email) {
        const { error } = await this.client.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: window.location.href }
        });
        if (error) throw error;
        this._showAuthMessage('Magic link sent! Check your email.', false);
    }

    async signOut() {
        const { error } = await this.client.auth.signOut();
        if (error) console.error('Sign out error:', error);
    }

    // ==================== USER INFO ====================

    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * Returns the display name for the current user.
     * Falls back to email if no full_name in metadata.
     */
    getUserDisplayName() {
        if (!this.currentUser) return '';
        return this.currentUser.user_metadata?.full_name
            || this.currentUser.user_metadata?.name
            || this.currentUser.email
            || '';
    }

    // ==================== INTERNAL EVENTS ====================

    _onSignedIn(user) {
        this._hideAuthModal();
        this._updateUserDisplay(user);
        document.dispatchEvent(new CustomEvent('auth:signed-in', { detail: user }));
    }

    _onSignedOut() {
        this._updateUserDisplay(null);
        this._showAuthModal();
        document.dispatchEvent(new CustomEvent('auth:signed-out'));
    }

    // ==================== UI ====================

    _showAuthModal() {
        const modal = document.getElementById('authModal');
        if (modal) modal.style.display = 'flex';
    }

    _hideAuthModal() {
        const modal = document.getElementById('authModal');
        if (modal) modal.style.display = 'none';
    }

    _updateUserDisplay(user) {
        const display = document.getElementById('userDisplay');
        const emailEl = document.getElementById('userEmail');
        if (!display) return;
        if (user) {
            if (emailEl) emailEl.textContent = user.user_metadata?.full_name || user.email;
            display.style.display = 'flex';
        } else {
            display.style.display = 'none';
        }
    }

    _showAuthError(message) {
        const el = document.getElementById('authError');
        if (!el) return;
        el.textContent = message;
        el.style.display = 'block';
    }

    _clearAuthError() {
        const el = document.getElementById('authError');
        if (!el) return;
        el.textContent = '';
        el.style.display = 'none';
    }

    _showAuthMessage(message, isError = false) {
        const el = document.getElementById('authError');
        if (!el) return;
        el.textContent = message;
        el.style.color = isError ? 'var(--color-danger, #d13438)' : 'var(--color-success, #107c10)';
        el.style.display = 'block';
    }

    _setLoading(loading) {
        const btn = document.getElementById('authSubmitBtn');
        if (!btn) return;
        btn.disabled = loading;
        btn.textContent = loading ? 'Please wait...' : this._getSubmitLabel();
    }

    _getSubmitLabel() {
        const labels = { signin: 'Sign In', signup: 'Create Account', magic: 'Send Magic Link' };
        return labels[this._activeTab] || 'Submit';
    }

    _switchTab(tab) {
        this._activeTab = tab;
        this._clearAuthError();

        // Update tab buttons
        document.querySelectorAll('.auth-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.authTab === tab);
        });

        // Show/hide content panels
        document.querySelectorAll('.auth-tab-content').forEach(panel => {
            panel.style.display = panel.id === `authTab_${tab}` ? 'block' : 'none';
        });

        // Update submit button label
        const btn = document.getElementById('authSubmitBtn');
        if (btn) btn.textContent = this._getSubmitLabel();

        // Show/hide password field
        const pwGroup = document.getElementById('authPasswordGroup');
        if (pwGroup) pwGroup.style.display = tab === 'magic' ? 'none' : 'block';
    }

    _bindAuthModalEvents() {
        // Tab switching
        document.querySelectorAll('.auth-tab').forEach(btn => {
            btn.addEventListener('click', () => this._switchTab(btn.dataset.authTab));
        });

        // Submit button
        const submitBtn = document.getElementById('authSubmitBtn');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this._handleSubmit());
        }

        // Allow Enter key in inputs
        ['authEmail', 'authPassword'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('keydown', e => {
                if (e.key === 'Enter') this._handleSubmit();
            });
        });

        // Sign out button (in header)
        const signOutBtn = document.getElementById('signOutBtn');
        if (signOutBtn) {
            signOutBtn.addEventListener('click', () => this.signOut());
        }
    }

    async _handleSubmit() {
        this._clearAuthError();
        const email = (document.getElementById('authEmail')?.value || '').trim();
        const password = document.getElementById('authPassword')?.value || '';

        if (!email) {
            this._showAuthError('Please enter your email address.');
            return;
        }

        this._setLoading(true);
        try {
            if (this._activeTab === 'signin') {
                if (!password) { this._showAuthError('Please enter your password.'); return; }
                await this.signInWithPassword(email, password);
            } else if (this._activeTab === 'signup') {
                if (!password) { this._showAuthError('Please choose a password.'); return; }
                await this.signUp(email, password);
            } else if (this._activeTab === 'magic') {
                await this.signInWithMagicLink(email);
            }
        } catch (error) {
            this._showAuthError(error.message || 'Authentication failed. Please try again.');
        } finally {
            this._setLoading(false);
        }
    }
}

// Create singleton using the shared Supabase client from supabase-config.js
const authManager = new AuthManager(_supabaseClient);

// Initialize auth as soon as DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => authManager.initialize());
} else {
    authManager.initialize();
}
