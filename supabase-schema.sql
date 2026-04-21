-- ============================================================
-- SalesMapper Supabase Schema
-- Run this in the Supabase SQL Editor to set up the database.
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES (workspaces)
-- ============================================================
CREATE TABLE profiles (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by   UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================================
-- WORKSPACE_MEMBERS
-- role: 'admin' | 'editor' | 'viewer'
-- ============================================================
CREATE TABLE workspace_members (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'viewer'
                    CHECK (role IN ('admin', 'editor', 'viewer')),
    invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (profile_id, user_id)
);

-- ============================================================
-- LAYER_GROUPS
-- ============================================================
CREATE TABLE layer_groups (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    visible     BOOLEAN NOT NULL DEFAULT TRUE,
    opacity     NUMERIC(4,3) NOT NULL DEFAULT 1.0,
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    expanded    BOOLEAN NOT NULL DEFAULT TRUE,
    layer_ids   JSONB NOT NULL DEFAULT '[]',
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LAYERS
-- features_json stores all features as a JSONB blob (Phase 1).
-- The separate features table below is for Phase 2 migration.
-- ============================================================
CREATE TABLE layers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    group_id        UUID REFERENCES layer_groups(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'point'
                        CHECK (type IN ('point', 'polygon')),
    visible         BOOLEAN NOT NULL DEFAULT TRUE,
    color           TEXT NOT NULL DEFAULT '#0078d4',
    opacity         NUMERIC(4,3) NOT NULL DEFAULT 1.0,
    show_labels     BOOLEAN NOT NULL DEFAULT FALSE,
    style_type      TEXT,
    style_property  TEXT,
    color_map       JSONB,
    metadata        JSONB,
    layer_order     INTEGER NOT NULL DEFAULT 0,
    features_json   JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FEATURES (Phase 2 target — defined now, populated later)
-- ============================================================
CREATE TABLE features (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    layer_id            UUID NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
    name                TEXT,
    latitude            DOUBLE PRECISION,
    longitude           DOUBLE PRECISION,
    wkt                 TEXT,
    properties          JSONB,
    geocode_confidence  NUMERIC(4,3),
    geocode_status      TEXT,
    source              TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_layers_profile_id        ON layers(profile_id);
CREATE INDEX idx_layer_groups_profile_id  ON layer_groups(profile_id);
CREATE INDEX idx_features_layer_id        ON features(layer_id);
CREATE INDEX idx_workspace_members_user   ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_profile ON workspace_members(profile_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-add workspace creator as admin
CREATE OR REPLACE FUNCTION add_creator_as_admin()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO workspace_members (profile_id, user_id, role, invited_by)
    VALUES (NEW.id, NEW.created_by, 'admin', NEW.created_by);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
    AFTER INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION add_creator_as_admin();

-- Auto-update last_updated on layers
CREATE OR REPLACE FUNCTION update_layer_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER layers_update_timestamp
    BEFORE UPDATE ON layers
    FOR EACH ROW EXECUTE FUNCTION update_layer_timestamp();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE layer_groups      ENABLE ROW LEVEL SECURITY;
ALTER TABLE layers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE features          ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user a member of a profile?
CREATE OR REPLACE FUNCTION is_member(p_profile_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM workspace_members
        WHERE profile_id = p_profile_id AND user_id = auth.uid()
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper: is the current user an admin of a profile?
CREATE OR REPLACE FUNCTION is_admin(p_profile_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM workspace_members
        WHERE profile_id = p_profile_id
          AND user_id = auth.uid()
          AND role = 'admin'
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper: can the current user write to a profile?
CREATE OR REPLACE FUNCTION can_write(p_profile_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM workspace_members
        WHERE profile_id = p_profile_id
          AND user_id = auth.uid()
          AND role IN ('admin', 'editor')
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper: look up a user's UUID by email (used for invite flow)
CREATE OR REPLACE FUNCTION get_user_id_by_email(lookup_email TEXT)
RETURNS UUID AS $$
    SELECT id FROM auth.users WHERE email = lookup_email LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- PROFILES policies
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (is_member(id));
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (is_admin(id));
CREATE POLICY "profiles_delete" ON profiles FOR DELETE USING (is_admin(id));

-- WORKSPACE_MEMBERS policies
CREATE POLICY "members_select" ON workspace_members FOR SELECT USING (is_member(profile_id));
CREATE POLICY "members_insert" ON workspace_members FOR INSERT WITH CHECK (is_admin(profile_id));
CREATE POLICY "members_update" ON workspace_members FOR UPDATE USING (is_admin(profile_id));
CREATE POLICY "members_delete" ON workspace_members FOR DELETE
    USING (is_admin(profile_id) OR user_id = auth.uid());

-- LAYER_GROUPS policies
CREATE POLICY "groups_select" ON layer_groups FOR SELECT USING (is_member(profile_id));
CREATE POLICY "groups_insert" ON layer_groups FOR INSERT WITH CHECK (can_write(profile_id));
CREATE POLICY "groups_update" ON layer_groups FOR UPDATE USING (can_write(profile_id));
CREATE POLICY "groups_delete" ON layer_groups FOR DELETE USING (can_write(profile_id));

-- LAYERS policies
CREATE POLICY "layers_select" ON layers FOR SELECT USING (is_member(profile_id));
CREATE POLICY "layers_insert" ON layers FOR INSERT WITH CHECK (can_write(profile_id));
CREATE POLICY "layers_update" ON layers FOR UPDATE USING (can_write(profile_id));
CREATE POLICY "layers_delete" ON layers FOR DELETE USING (can_write(profile_id));

-- FEATURES policies (join through layers to resolve profile_id)
CREATE POLICY "features_select" ON features FOR SELECT
    USING (EXISTS (SELECT 1 FROM layers l WHERE l.id = features.layer_id AND is_member(l.profile_id)));
CREATE POLICY "features_insert" ON features FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM layers l WHERE l.id = features.layer_id AND can_write(l.profile_id)));
CREATE POLICY "features_update" ON features FOR UPDATE
    USING (EXISTS (SELECT 1 FROM layers l WHERE l.id = features.layer_id AND can_write(l.profile_id)));
CREATE POLICY "features_delete" ON features FOR DELETE
    USING (EXISTS (SELECT 1 FROM layers l WHERE l.id = features.layer_id AND can_write(l.profile_id)));

-- ============================================================
-- REALTIME
-- Enable Postgres CDC for collaborative editing.
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE layers;
ALTER PUBLICATION supabase_realtime ADD TABLE layer_groups;
