/**
 * Supabase Configuration and Database Manager
 * Replaces firebase-config.js — implements the same API surface as FirebaseManager
 * so app.js call sites require no changes.
 */

// Supabase client singleton
const _supabaseClient = supabase.createClient(
    AppConfig.supabase.url,
    AppConfig.supabase.anonKey
);

/**
 * Supabase Database Manager
 * Exposes identical method signatures to the former FirebaseManager.
 */
class SupabaseManager {
    constructor() {
        this.client = _supabaseClient;
        this.currentProfileId = null;
        this._realtimeChannel = null;
    }

    // ==================== CORE ====================

    /**
     * Set the current active profile.
     * @param {string} profileId
     */
    setCurrentProfile(profileId) {
        this.currentProfileId = profileId;
        console.log(`Current profile set to: ${profileId}`);
    }

    // ==================== LAYER DATA ====================

    /**
     * Save all layers to Supabase (profile-aware).
     *
     * layersData shape (from app.js → layerManager.exportAllLayers()):
     *   { layers: { [layerId]: layerObj }, layerOrder: [...], _groups: [...], _timestamp: "..." }
     *
     * @param {Object} layersData
     * @param {string|null} profileName
     * @returns {Promise<{success:boolean, timestamp:string}>}
     */
    async saveAllLayers(layersData, profileName = null) {
        if (!this.currentProfileId) throw new Error('No profile selected');

        try {
            const groups = layersData._groups || [];
            const timestamp = layersData._timestamp || Date.now().toString();
            const layerOrder = layersData.layerOrder || [];
            const layerObjects = layersData.layers || {};

            // 1. Upsert each layer row
            const newLayerIds = Object.keys(layerObjects);
            if (newLayerIds.length > 0) {
                const layerRows = newLayerIds.map(layerId => {
                    const layer = layerObjects[layerId];
                    const { features, ...meta } = layer;
                    return {
                        id: layerId,
                        profile_id: this.currentProfileId,
                        name: meta.name || 'Unnamed',
                        type: meta.type || 'point',
                        visible: meta.visible !== undefined ? meta.visible : true,
                        color: meta.color || '#0078d4',
                        opacity: meta.opacity !== undefined ? meta.opacity : 1.0,
                        show_labels: meta.showLabels || false,
                        style_type: meta.styleType || null,
                        style_property: meta.styleProperty || null,
                        color_map: meta.colorMap || null,
                        metadata: meta.metadata || null,
                        layer_order: layerOrder.indexOf(layerId),
                        features_json: features || []
                    };
                });
                const { error: upsertErr } = await this.client
                    .from('layers')
                    .upsert(layerRows, { onConflict: 'id' });
                if (upsertErr) throw upsertErr;
            }

            // 2. Delete layers that no longer exist
            const { data: existingLayers, error: selErr } = await this.client
                .from('layers')
                .select('id')
                .eq('profile_id', this.currentProfileId);
            if (selErr) throw selErr;
            const existingIds = (existingLayers || []).map(r => r.id);
            const toDelete = existingIds.filter(id => !newLayerIds.includes(id));
            if (toDelete.length > 0) {
                const { error: delErr } = await this.client
                    .from('layers')
                    .delete()
                    .in('id', toDelete)
                    .eq('profile_id', this.currentProfileId);
                if (delErr) throw delErr;
            }

            // 3. Replace layer_groups (delete + insert keeps ordering correct)
            await this.client
                .from('layer_groups')
                .delete()
                .eq('profile_id', this.currentProfileId);
            if (groups.length > 0) {
                const groupRows = groups.map(g => ({
                    id: g.id,
                    profile_id: this.currentProfileId,
                    name: g.name || 'Unnamed Group',
                    visible: g.visible !== undefined ? g.visible : true,
                    opacity: g.opacity !== undefined ? g.opacity : 1.0,
                    is_default: g.name === 'All Layers',
                    expanded: g.expanded !== undefined ? g.expanded : true,
                    layer_ids: g.layerIds || [],
                    metadata: g.metadata || null
                }));
                const { error: grpErr } = await this.client
                    .from('layer_groups')
                    .insert(groupRows);
                if (grpErr) throw grpErr;
            }

            // 4. Update profile metadata
            const profileUpdate = { last_updated: new Date().toISOString() };
            if (profileName) profileUpdate.name = profileName;
            await this.client
                .from('profiles')
                .update(profileUpdate)
                .eq('id', this.currentProfileId);

            console.log(`Data saved to Supabase for profile ${this.currentProfileId}`);
            eventBus.emit('supabase.saved', { timestamp, profileId: this.currentProfileId });
            return { success: true, timestamp };
        } catch (error) {
            console.error('Error saving to Supabase:', error);
            eventBus.emit('supabase.error', { operation: 'save', error });
            throw error;
        }
    }

    /**
     * Load all layers from Supabase for the current profile.
     *
     * Returns the same shape as the old FirebaseManager.loadAllLayers():
     *   { success, layers: { layers: {...}, layerOrder: [...], _groups: [...], _timestamp: "..." }, lastUpdated, profileName }
     *
     * @returns {Promise<Object>}
     */
    async loadAllLayers() {
        if (!this.currentProfileId) throw new Error('No profile selected');

        try {
            const [layersResult, groupsResult, profileResult] = await Promise.all([
                this.client
                    .from('layers')
                    .select('*')
                    .eq('profile_id', this.currentProfileId)
                    .order('layer_order', { ascending: true }),
                this.client
                    .from('layer_groups')
                    .select('*')
                    .eq('profile_id', this.currentProfileId),
                this.client
                    .from('profiles')
                    .select('name, last_updated')
                    .eq('id', this.currentProfileId)
                    .single()
            ]);

            if (layersResult.error) throw layersResult.error;
            if (groupsResult.error) throw groupsResult.error;

            const layerRows = layersResult.data || [];
            const groupRows = groupsResult.data || [];
            const profile = profileResult.data;

            // Reconstruct layers object keyed by layer ID
            const layersObj = {};
            const layerOrder = [];
            for (const row of layerRows) {
                layersObj[row.id] = {
                    id: row.id,
                    name: row.name,
                    type: row.type,
                    features: row.features_json || [],
                    visible: row.visible,
                    opacity: row.opacity,
                    color: row.color,
                    metadata: row.metadata || {},
                    createdAt: row.created_at,
                    styleType: row.style_type,
                    styleProperty: row.style_property,
                    colorMap: row.color_map,
                    showLabels: row.show_labels
                };
                layerOrder.push(row.id);
            }

            // Reconstruct groups array
            const groups = groupRows.map(row => ({
                id: row.id,
                name: row.name,
                layerIds: row.layer_ids || [],
                visible: row.visible,
                opacity: row.opacity,
                expanded: row.expanded !== undefined ? row.expanded : true,
                metadata: row.metadata || {},
                createdAt: row.created_at
            }));

            const resultLayers = {
                layers: layersObj,
                layerOrder,
                _groups: groups,
                _timestamp: profile ? new Date(profile.last_updated).getTime().toString() : null
            };

            console.log(`Data loaded from Supabase for profile ${this.currentProfileId}`);
            eventBus.emit('supabase.loaded', {
                layerCount: layerRows.length,
                profileId: this.currentProfileId
            });

            return {
                success: true,
                layers: resultLayers,
                lastUpdated: profile ? profile.last_updated : null,
                profileName: profile ? profile.name : null
            };
        } catch (error) {
            console.error('Error loading from Supabase:', error);
            eventBus.emit('supabase.error', { operation: 'load', error });
            throw error;
        }
    }

    /**
     * Listen for real-time updates to layers.
     * Supabase Realtime delivers row-level diffs; on any change we re-fetch the
     * full dataset and call the callback with the same shape as loadAllLayers().layers.
     *
     * @param {Function} callback - receives the full layers blob (same as result.layers)
     */
    listenForUpdates(callback) {
        if (!this.currentProfileId) {
            console.warn('No profile selected for real-time updates');
            return;
        }
        if (this._realtimeChannel) return; // already listening

        this._realtimeChannel = this.client
            .channel(`profile:${this.currentProfileId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'layers',
                    filter: `profile_id=eq.${this.currentProfileId}`
                },
                async () => {
                    try {
                        const result = await this.loadAllLayers();
                        if (result.success) {
                            callback(result.layers);
                        }
                    } catch (err) {
                        console.error('Error in Supabase real-time listener:', err);
                        if (window.eventBus) {
                            eventBus.emit('supabase.listener.error', { error: err });
                        }
                    }
                }
            )
            .subscribe();
    }

    /**
     * Stop listening for real-time updates.
     */
    stopListening() {
        if (this._realtimeChannel) {
            this.client.removeChannel(this._realtimeChannel);
            this._realtimeChannel = null;
        }
    }

    // ==================== PROFILE MANAGEMENT ====================

    /**
     * Create a new workspace profile.
     * @param {string} profileName
     * @returns {Promise<{success:boolean, profileId:string, profileName:string, createdAt:string}>}
     */
    async createProfile(profileName) {
        try {
            const user = await this._getCurrentUser();
            const { data, error } = await this.client
                .from('profiles')
                .insert({
                    name: profileName,
                    created_by: user.id
                })
                .select()
                .single();

            if (error) throw error;

            console.log(`Profile "${profileName}" created with ID ${data.id}`);
            eventBus.emit('profile.created', { profileId: data.id, profileName });

            return {
                success: true,
                profileId: data.id,
                profileName: data.name,
                createdAt: data.created_at
            };
        } catch (error) {
            console.error('Error creating profile:', error);
            throw error;
        }
    }

    /**
     * Get all profiles the current user has access to (RLS filters automatically).
     * Also returns the user's role in each workspace.
     * @returns {Promise<Array>}
     */
    async getAllProfiles() {
        try {
            const user = await this._getCurrentUser();

            // Fetch profiles + membership info via workspace_members join
            const { data, error } = await this.client
                .from('workspace_members')
                .select(`
                    role,
                    profiles (
                        id,
                        name,
                        created_at,
                        last_updated
                    )
                `)
                .eq('user_id', user.id);

            if (error) throw error;

            // Also fetch layer counts
            const profiles = await Promise.all((data || []).map(async row => {
                const profile = row.profiles;
                const { count } = await this.client
                    .from('layers')
                    .select('id', { count: 'exact', head: true })
                    .eq('profile_id', profile.id);

                return {
                    id: profile.id,
                    name: profile.name || 'Unnamed Profile',
                    createdAt: profile.created_at,
                    lastUpdated: profile.last_updated,
                    layerCount: count || 0,
                    role: row.role
                };
            }));

            return profiles;
        } catch (error) {
            console.error('Error loading profiles:', error);
            throw error;
        }
    }

    /**
     * Delete a workspace profile.
     * @param {string} profileId
     * @returns {Promise<{success:boolean}>}
     */
    async deleteProfile(profileId) {
        try {
            const { error } = await this.client
                .from('profiles')
                .delete()
                .eq('id', profileId);

            if (error) throw error;

            console.log(`Profile ${profileId} deleted`);
            eventBus.emit('profile.deleted', { profileId });

            return { success: true };
        } catch (error) {
            console.error('Error deleting profile:', error);
            throw error;
        }
    }

    /**
     * Rename a workspace profile.
     * @param {string} profileId
     * @param {string} newName
     * @returns {Promise<{success:boolean}>}
     */
    async renameProfile(profileId, newName) {
        try {
            const { error } = await this.client
                .from('profiles')
                .update({ name: newName, last_updated: new Date().toISOString() })
                .eq('id', profileId);

            if (error) throw error;

            console.log(`Profile ${profileId} renamed to "${newName}"`);
            eventBus.emit('profile.renamed', { profileId, newName });

            return { success: true };
        } catch (error) {
            console.error('Error renaming profile:', error);
            throw error;
        }
    }

    /**
     * No-op stub — migration from Firebase is handled externally (migrate.html).
     * Kept for API compatibility with the former FirebaseManager.
     */
    async migrateToProfiles() {
        return { success: true, alreadyMigrated: true };
    }

    // ==================== MEMBER MANAGEMENT ====================

    /**
     * Invite an existing Supabase user to a workspace by email.
     * @param {string} profileId
     * @param {string} email
     * @param {string} role - 'admin' | 'editor' | 'viewer'
     * @returns {Promise<{success:boolean}|{error:string}>}
     */
    async inviteMember(profileId, email, role = 'viewer') {
        try {
            // Resolve email to user UUID via the DB helper function
            const { data: userId, error: lookupErr } = await this.client
                .rpc('get_user_id_by_email', { lookup_email: email });

            if (lookupErr) throw lookupErr;
            if (!userId) {
                return { error: 'No account found for that email. The user must sign up first.' };
            }

            const currentUser = await this._getCurrentUser();
            const { error } = await this.client
                .from('workspace_members')
                .insert({
                    profile_id: profileId,
                    user_id: userId,
                    role,
                    invited_by: currentUser.id
                });

            if (error) throw error;

            return { success: true };
        } catch (error) {
            console.error('Error inviting member:', error);
            throw error;
        }
    }

    /**
     * Get all members of a workspace with their roles.
     * @param {string} profileId
     * @returns {Promise<Array>}
     */
    async getWorkspaceMembers(profileId) {
        try {
            const { data, error } = await this.client
                .from('workspace_members')
                .select('user_id, role, created_at, invited_by')
                .eq('profile_id', profileId);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting workspace members:', error);
            throw error;
        }
    }

    /**
     * Update a member's role in a workspace.
     * @param {string} profileId
     * @param {string} userId
     * @param {string} newRole
     * @returns {Promise<{success:boolean}>}
     */
    async updateMemberRole(profileId, userId, newRole) {
        try {
            const { error } = await this.client
                .from('workspace_members')
                .update({ role: newRole })
                .eq('profile_id', profileId)
                .eq('user_id', userId);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Error updating member role:', error);
            throw error;
        }
    }

    /**
     * Remove a member from a workspace (or let a user leave themselves).
     * @param {string} profileId
     * @param {string} userId
     * @returns {Promise<{success:boolean}>}
     */
    async removeMember(profileId, userId) {
        try {
            const { error } = await this.client
                .from('workspace_members')
                .delete()
                .eq('profile_id', profileId)
                .eq('user_id', userId);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Error removing member:', error);
            throw error;
        }
    }

    /**
     * Get the current user's role in a given workspace.
     * @param {string} profileId
     * @returns {Promise<string|null>}
     */
    async getMyRole(profileId) {
        try {
            const user = await this._getCurrentUser();
            const { data, error } = await this.client
                .from('workspace_members')
                .select('role')
                .eq('profile_id', profileId)
                .eq('user_id', user.id)
                .single();

            if (error || !data) return null;
            return data.role;
        } catch {
            return null;
        }
    }

    // ==================== INTERNAL HELPERS ====================

    async _getCurrentUser() {
        const { data: { user }, error } = await this.client.auth.getUser();
        if (error || !user) throw new Error('Not authenticated');
        return user;
    }
}

// Create singleton
const supabaseManager = new SupabaseManager();

// Alias as firebaseManager so all existing app.js call sites work without changes
const firebaseManager = supabaseManager;
