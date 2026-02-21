-- ============================================================
-- project_files 테이블에 파일 데이터 컬럼 추가 (base64 저장용)
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

ALTER TABLE project_files ADD COLUMN IF NOT EXISTS file_data TEXT;
