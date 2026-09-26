-- =============================================================================
-- 0002_order_status_values.sql — new order_status enum values
-- Kept in a SEPARATE migration: Postgres forbids using a value added by
-- ALTER TYPE ... ADD VALUE within the same transaction that adds it. Migration
-- 0003 (which sets a default using 'pending_approval') must run afterwards.
-- =============================================================================

alter type order_status add value if not exists 'pending_approval';
alter type order_status add value if not exists 'rejected';
