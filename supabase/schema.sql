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
-- 인증 관련 스키마 (user-auth v1.1.0)
-- ============================================================

-- 5. 프로필(Profiles) 테이블
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 신규 사용자 프로필 자동 생성 트리거
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 6. projects 테이블에 user_id 추가
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- ============================================================
-- RLS (Row Level Security) 정책
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;

-- profiles: 본인만 조회/수정
DROP POLICY IF EXISTS "profiles_self" ON profiles;
CREATE POLICY "profiles_self" ON profiles
  FOR ALL USING (auth.uid() = id);

-- machines: 인증 사용자 전체 읽기, admin만 수정
DROP POLICY IF EXISTS "machines_read" ON machines;
CREATE POLICY "machines_read" ON machines
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "machines_write" ON machines;
CREATE POLICY "machines_write" ON machines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- projects: 본인 소유 데이터만
DROP POLICY IF EXISTS "projects_owner" ON projects;
CREATE POLICY "projects_owner" ON projects
  FOR ALL USING (auth.uid() = user_id);

-- parts: 프로젝트 소유자만
DROP POLICY IF EXISTS "parts_owner" ON parts;
CREATE POLICY "parts_owner" ON parts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE id = parts.project_id AND user_id = auth.uid())
  );

-- recommendations: 파트 소유자만
DROP POLICY IF EXISTS "recommendations_owner" ON recommendations;
CREATE POLICY "recommendations_owner" ON recommendations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM parts p
      JOIN projects pr ON p.project_id = pr.id
      WHERE p.id = recommendations.part_id AND pr.user_id = auth.uid()
    )
  );

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
