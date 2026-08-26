-- ============================================================
-- Migration 076 — Auto-assign unassigned nodes to "Unsorted" folder
-- ============================================================
-- Every user who has nodes not in any folder gets an "Unsorted"
-- folder created for them, and all their unassigned nodes are
-- linked to it via folder_edges.
--
-- After this migration:
--   - Every active node belongs to at least one folder
--   - The home feed (no folder context) can use p_exclude_foldered=TRUE
--     to show only folders, not loose cards
--   - New nodes must be auto-assigned to "Unsorted" by the app layer
-- ============================================================

DO $$
DECLARE
    user_record RECORD;
    unsorted_folder_id UUID;
BEGIN
    -- Find each user who has at least one node not in any folder
    FOR user_record IN
        SELECT DISTINCT n.owner_id
        FROM nodes n
        WHERE n.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM folder_edges fe
            WHERE fe.node_id = n.id
          )
    LOOP
        -- Check if user already has an "Unsorted" folder (idempotent)
        SELECT id INTO unsorted_folder_id
        FROM folders
        WHERE owner_id = user_record.owner_id
          AND name = 'Unsorted'
          AND deleted_at IS NULL
        LIMIT 1;

        -- Create "Unsorted" folder if it doesn't exist
        IF unsorted_folder_id IS NULL THEN
            INSERT INTO folders (name, owner_id, parent_folder_id, is_project, color_hex)
            VALUES ('Unsorted', user_record.owner_id, NULL, TRUE, '#6b7280')
            RETURNING id INTO unsorted_folder_id;

            -- Insert folder_tree self-reference (required by folder_tree schema)
            INSERT INTO folder_tree (folder_id, ancestor_id, depth)
            VALUES (unsorted_folder_id, unsorted_folder_id, 0);
        END IF;

        -- Link all unassigned nodes for this user to the Unsorted folder
        INSERT INTO folder_edges (node_id, folder_id)
        SELECT n.id, unsorted_folder_id
        FROM nodes n
        WHERE n.owner_id = user_record.owner_id
          AND n.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM folder_edges fe
            WHERE fe.node_id = n.id
          )
        ON CONFLICT (node_id, folder_id) DO NOTHING;
    END LOOP;
END;
$$;

-- ============================================================
-- Verification: ensure no active node is without a folder
-- ============================================================
-- This query should return 0 rows after the migration:
-- SELECT n.id, n.owner_id
-- FROM nodes n
-- WHERE n.deleted_at IS NULL
--   AND NOT EXISTS (
--     SELECT 1 FROM folder_edges fe WHERE fe.node_id = n.id
--   );
