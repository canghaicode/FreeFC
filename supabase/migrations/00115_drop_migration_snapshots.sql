BEGIN;

-- One-time migration evidence is retained in local full database dumps.
-- Remove database-resident snapshots after the migrations and preservation
-- checks have completed; runtime ability tables and the active admin audit log
-- remain intact.
DROP TABLE IF EXISTS public.ability_position_migration_00113_snapshot;
DROP TABLE IF EXISTS public.ability_position_migration_00113_state;
DROP TABLE IF EXISTS public.ability_base_migration_00112_snapshot;
DROP TABLE IF EXISTS public.ability_base_migration_00112_state;
DROP TABLE IF EXISTS public.growth_migration_00111_skill_catalog_snapshot;
DROP TABLE IF EXISTS public.growth_migration_00111_equipment_catalog_snapshot;
DROP TABLE IF EXISTS public.growth_migration_00111_profile_snapshot;
DROP TABLE IF EXISTS public.growth_migration_00111_state;
DROP TABLE IF EXISTS public.ability_migration_00110_snapshot;
DROP TABLE IF EXISTS public.ability_migration_00110_state;

NOTIFY pgrst, 'reload schema';
COMMIT;
