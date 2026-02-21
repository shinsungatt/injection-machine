-- ============================================================
-- parts 테이블에 cycle_time_sec 컬럼 추가
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

ALTER TABLE parts ADD COLUMN IF NOT EXISTS cycle_time_sec INTEGER;
