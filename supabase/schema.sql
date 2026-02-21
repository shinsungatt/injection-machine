-- ============================================================
-- 사출성형 설비 선택 프로그램 - Supabase Schema
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- 1. 설비(Machines) 테이블
CREATE TABLE IF NOT EXISTS machines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  manufacturer TEXT NOT NULL DEFAULT '',
  clamping_force_ton NUMERIC(10,2) NOT NULL,
  shot_weight_max_g NUMERIC(10,2) NOT NULL,
  injection_pressure_max_mpa NUMERIC(10,2) NOT NULL DEFAULT 0,
  platen_width_mm NUMERIC(10,2) NOT NULL DEFAULT 0,
  platen_height_mm NUMERIC(10,2) NOT NULL DEFAULT 0,
  tie_bar_x_mm NUMERIC(10,2) NOT NULL DEFAULT 0,
  tie_bar_y_mm NUMERIC(10,2) NOT NULL DEFAULT 0,
  daylight_max_mm NUMERIC(10,2) NOT NULL DEFAULT 0,
  screw_diameter_mm NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 프로젝트(Projects) 테이블
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  model_name TEXT NOT NULL DEFAULT '',
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'analyzing', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 파트(Parts) 테이블
CREATE TABLE IF NOT EXISTS parts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  part_number TEXT NOT NULL,
  part_name TEXT NOT NULL,
  material TEXT NOT NULL DEFAULT 'ABS',
  part_weight_g NUMERIC(10,3) NOT NULL,
  projected_area_cm2 NUMERIC(10,3) NOT NULL,
  cavity_count INTEGER NOT NULL DEFAULT 1,
  runner_weight_g NUMERIC(10,3) NOT NULL DEFAULT 0,
  mold_width_mm NUMERIC(10,2),
  mold_height_mm NUMERIC(10,2),
  mold_depth_mm NUMERIC(10,2),
  drawing_file_url TEXT,
  cad_file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 추천 결과(Recommendations) 테이블
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  part_id UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  required_clamping_force_ton NUMERIC(10,2) NOT NULL,
  required_shot_weight_g NUMERIC(10,2) NOT NULL,
  utilization_clamping_pct NUMERIC(5,2) NOT NULL,
  utilization_shot_pct NUMERIC(5,2) NOT NULL,
  is_recommended BOOLEAN DEFAULT false,
  rank INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 샘플 설비 데이터 (7대)
-- ============================================================
INSERT INTO machines (name, manufacturer, clamping_force_ton, shot_weight_max_g, injection_pressure_max_mpa, platen_width_mm, platen_height_mm, tie_bar_x_mm, tie_bar_y_mm, daylight_max_mm, screw_diameter_mm, notes) VALUES
  ('LS Electric 80T',    'LS Electric', 80,   150,  200, 420, 420, 310, 310, 700,  35, '소형 파트 전용'),
  ('LS Electric 150T',   'LS Electric', 150,  330,  200, 520, 520, 390, 390, 850,  45, NULL),
  ('LS Electric 250T',   'LS Electric', 250,  650,  200, 620, 620, 460, 460, 1000, 55, NULL),
  ('Hyundai Engel 350T', 'Hyundai',     350,  980,  180, 730, 730, 560, 560, 1100, 65, NULL),
  ('Hyundai Engel 500T', 'Hyundai',     500,  1500, 180, 860, 860, 660, 660, 1300, 75, '중대형 파트'),
  ('Fanuc 650T',         'Fanuc',       650,  2100, 220, 960, 960, 740, 740, 1500, 85, '정밀 사출 전용'),
  ('Fanuc 850T',         'Fanuc',       850,  3000, 220, 1100,1100,850, 850, 1700, 95, '대형 파트 전용');
