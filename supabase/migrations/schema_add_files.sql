-- ============================================================
-- 프로젝트 첨부 파일 테이블 추가
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

CREATE TABLE IF NOT EXISTS project_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL CHECK (file_type IN ('excel', 'pdf', 'cad', 'stp')),
  file_name TEXT NOT NULL,
  storage_path TEXT,
  file_url TEXT,
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Supabase 대시보드에서 Storage 버킷도 생성하세요:
-- Storage > New bucket > 이름: project-files > Public 체크
-- ============================================================
