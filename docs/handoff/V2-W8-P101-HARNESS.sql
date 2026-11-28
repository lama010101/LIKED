-- Rollback-wrapped harness for draft migration 150. Replace the fixture UUIDs
-- with newly created throwaway fixture ids; do not use production user data.
-- Expected positive: owner A can set watched/dismissed/to_watch and the row
-- changes. Expected negative: invalid status and unauthenticated calls fail.
-- Expected isolation: owner B cannot overwrite owner A's row because owner_id
-- is always auth.uid(). COMMIT is intentionally absent; run in a transaction
-- and ROLLBACK, or use the fixture cleanup script afterwards.
BEGIN;
SELECT public.set_item_status('00000000-0000-0000-0000-000000000001'::uuid, 'watched');
SELECT status FROM public.owner_item_state
 WHERE owner_id = auth.uid() AND item_id = '00000000-0000-0000-0000-000000000001'::uuid;
ROLLBACK;
