-- ============================================================
-- 설비 테이블: 금형두께 범위 + Motor/Heater 컬럼 추가
-- 엑셀 H열(금형두께 범위) → mold_depth_min_mm, mold_depth_max_mm
-- 엑셀 P열(Motor/Heater Kw) → motor_kw, heater_kw
-- ============================================================

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS mold_depth_min_mm NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mold_depth_max_mm NUMERIC(10,2) NOT NULL DEFAULT 9999,
  ADD COLUMN IF NOT EXISTS motor_kw NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS heater_kw NUMERIC(8,2);

COMMENT ON COLUMN machines.mold_depth_min_mm IS '설치 가능 최소 금형두께 (mm) - 엑셀 H열';
COMMENT ON COLUMN machines.mold_depth_max_mm IS '설치 가능 최대 금형두께 (mm) - 엑셀 H열';
COMMENT ON COLUMN machines.motor_kw IS '주모터 용량 (kW) - 엑셀 P열';
COMMENT ON COLUMN machines.heater_kw IS '히터 용량 (kW) - 엑셀 P열';
