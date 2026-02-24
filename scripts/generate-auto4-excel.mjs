/**
 * AUTO-4 파트 산출방법 상세 Excel 생성 스크립트
 * 실행: node scripts/generate-auto4-excel.mjs
 */
import XLSX from 'xlsx'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── AUTO-4 파트 실제 데이터 ───────────────────────────────────────────────
const part = {
  part_number: 'AUTO-4',
  part_name: '-',
  material: 'POM(WHITE)',
  part_weight_g: 0,
  projected_area_cm2: 1.2,
  cavity_count: 1,
  runner_weight_g: 0,
  cycle_time_sec: null,       // 미입력 → 예측값 사용
  mold_width_mm: 215,
  mold_height_mm: 208,
  notes: 'thickness_mm:6',   // 두께 6mm
}

const recommendations = [
  { rank: 1, machine: '24호기 진화글로텍 MMCⅡ 60', capacity_ton: 60, shot_weight_g: 150,
    req_clamping: 0.504, req_shot: 0, util_clamping: 0.84, util_shot: 0 },
  { rank: 2, machine: '07호기 선우중공업 MMCⅡ 60', capacity_ton: 60, shot_weight_g: 150,
    req_clamping: 0.504, req_shot: 0, util_clamping: 0.84, util_shot: 0 },
  { rank: 3, machine: '08호기 선우중공업 MMCⅡ 60', capacity_ton: 60, shot_weight_g: 150,
    req_clamping: 0.504, req_shot: 0, util_clamping: 0.84, util_shot: 0 },
]

// ─── 계산 상수 ─────────────────────────────────────────────────────────────
const RESIN_PRESSURE  = 350          // POM 수지압력 kgf/cm²
const SAFETY_FACTOR   = 1.2          // 안전율 (슬라이드 없음)
const MAT_CORRECTION  = 1.05 / 1.42  // PS대비 POM 보정계수 = 0.7394

// CT 파라미터 (POM)
const CT = { base: 18, wf: 0.20, af: 1.5, gfMul: 1.15 }
const THICKNESS_MM = 6               // notes에서 추출

// ─── 계산 결과 ─────────────────────────────────────────────────────────────
// 1. 형체력
const step1_area_x_pressure = part.projected_area_cm2 * RESIN_PRESSURE
const step1_x_cavity        = step1_area_x_pressure * part.cavity_count
const step1_div_1000        = step1_x_cavity / 1000
const reqClamping           = +(step1_div_1000 * SAFETY_FACTOR).toFixed(4)   // = 0.504

// 2. 사출량 (중량 0 → 스킵, = 0)
const reqShot = 0

// 3. 사이클타임 예측
const area_eff   = Math.max(part.projected_area_cm2, 10)   // 최소 10
const weight_eff = Math.max(part.part_weight_g, 1)          // 최소 1
const ct_base_calc   = CT.base + CT.wf * weight_eff + CT.af * Math.sqrt(area_eff)
  + (part.cavity_count - 1) * 2
const coolingTime    = 2.5 * THICKNESS_MM * THICKNESS_MM    // = 90
const baseCooling    = CT.base * 0.6                        // = 10.8
const ct_final = Math.round(Math.min(300, Math.max(15,
  ct_base_calc + (coolingTime - baseCooling))))             // = 103

// ─── 셀 스타일 헬퍼 ────────────────────────────────────────────────────────
function hdr(text)    { return { v: text, t: 's' } }
function num(v, fmt)  { return { v, t: 'n', z: fmt ?? '0.000' } }
function pct(v)       { return { v: v / 100, t: 'n', z: '0.00%' } }
function lbl(text)    { return { v: text, t: 's' } }
function formula(f)   { return { f, t: 'n' } }

function buildSheet(rows) {
  const ws = {}
  let maxCol = 0
  rows.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      const addr = XLSX.utils.encode_cell({ r: ri, c: ci })
      ws[addr] = (typeof cell === 'object' && cell !== null) ? cell : { v: cell ?? '', t: 's' }
      if (ci > maxCol) maxCol = ci
    })
  })
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: maxCol } })
  return ws
}

// ═══════════════════════════════════════════════════════════════════════════
// 시트 1: 파트 기본 정보
// ═══════════════════════════════════════════════════════════════════════════
const sheet1 = buildSheet([
  ['AUTO-4 파트 기본 정보', '', '', ''],
  ['항목', '값', '단위', '비고'],
  ['파트 번호', 'AUTO-4', '', '자동 부여 (원본 파트번호 없음)'],
  ['재질', 'POM(WHITE)', '', 'Polyoxymethylene (폴리아세탈), 백색'],
  ['파트 중량', part.part_weight_g, 'g', '미입력 (0g) → 사출량 계산 스킵'],
  ['투영면적', part.projected_area_cm2, 'cm²', '1.2cm² (소형 파트)'],
  ['캐비티 수', part.cavity_count, '개', '단일 캐비티'],
  ['런너 중량', part.runner_weight_g, 'g', '미입력 → 0g'],
  ['사이클타임', '미입력', 'sec', '예측값 자동 계산'],
  ['금형 가로', part.mold_width_mm, 'mm', '215mm'],
  ['금형 세로', part.mold_height_mm, 'mm', '208mm'],
  ['제품 두께', THICKNESS_MM, 'mm', 'notes 필드에서 추출 (thickness_mm:6)'],
  ['슬라이드 구조', '없음', '', '안전율 1.2 적용'],
])
sheet1['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 8 }, { wch: 38 }]

// ═══════════════════════════════════════════════════════════════════════════
// 시트 2: 형체력 산출
// ═══════════════════════════════════════════════════════════════════════════
const sheet2 = buildSheet([
  ['형체력(Clamping Force) 산출', '', '', '', ''],
  [''],
  ['■ 산출 공식', '', '', '', ''],
  ['필요 형체력(T) = 투영면적(cm²) × 수지압력(kgf/cm²) × 캐비티수 / 1000 × 안전율', '', '', '', ''],
  [''],
  ['■ 적용 상수 — POM 재질 기준', '', '', '', ''],
  ['항목', '기호', '값', '단위', '비고'],
  ['재질', '-', 'POM(WHITE)', '', ''],
  ['수지압력', 'P', RESIN_PRESSURE, 'kgf/cm²', 'POM 기준값'],
  ['안전율', 'SF', SAFETY_FACTOR, '-', '슬라이드 없음 → 1.2 (슬라이드 있으면 1.3)'],
  [''],
  ['■ 단계별 계산', '', '', '', ''],
  ['단계', '계산식', '계산값', '단위', '설명'],
  ['① 투영면적 × 수지압력', `${part.projected_area_cm2} × ${RESIN_PRESSURE}`, step1_area_x_pressure, 'kgf', ''],
  ['② × 캐비티수', `${step1_area_x_pressure} × ${part.cavity_count}`, step1_x_cavity, 'kgf', ''],
  ['③ ÷ 1000 (kgf→ton)', `${step1_x_cavity} ÷ 1000`, +step1_div_1000.toFixed(6), 'ton', ''],
  ['④ × 안전율', `${+step1_div_1000.toFixed(4)} × ${SAFETY_FACTOR}`, reqClamping, 'ton', '필요 형체력 ← 최종'],
  [''],
  ['■ 결과', '', '', '', ''],
  ['필요 형체력', reqClamping, 'ton', '', '매우 소형 파트 (0.5T 수준)'],
  [''],
  ['■ 참고: 수지압력 기준표', '', '', '', ''],
  ['재질', 'PP', 'ABS', 'PA6/PA66', 'PC', 'POM', 'PE', 'PS'],
  ['수지압력 (kgf/cm²)', 300, 350, 400, 450, 350, 280, 320],
])
sheet2['!cols'] = [{ wch: 26 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 36 }]

// ═══════════════════════════════════════════════════════════════════════════
// 시트 3: 사출량 산출
// ═══════════════════════════════════════════════════════════════════════════
const sheet3 = buildSheet([
  ['사출량(Shot Weight) 산출', '', '', '', ''],
  [''],
  ['■ 산출 공식 (PS 기준 환산량)', '', '', '', ''],
  ['필요 사출량(g) = (파트중량×캐비티수 + 런너중량) / 충전효율(0.8) × 재료보정계수', '', '', '', ''],
  [''],
  ['■ 재료보정계수 (PS 밀도 1.05 g/cm³ 기준)', '', '', '', ''],
  ['재질', '밀도 (g/cm³)', '보정계수 (1.05/밀도)', '비고', ''],
  ['PP',   0.91, +(1.05/0.91).toFixed(4),  '설비는 PS 기준 용량, PP는 밀도가 낮아 더 많은 부피 필요', ''],
  ['ABS',  1.05, +(1.05/1.05).toFixed(4),  'PS와 동일 밀도 → 보정 없음', ''],
  ['PA66', 1.14, +(1.05/1.14).toFixed(4),  '밀도 높음 → 보정계수 < 1', ''],
  ['PC',   1.20, +(1.05/1.20).toFixed(4),  '', ''],
  ['POM',  1.42, +(1.05/1.42).toFixed(4),  '★ AUTO-4 적용 재질', ''],
  ['PE',   0.95, +(1.05/0.95).toFixed(4),  '', ''],
  ['PS',   1.05, 1.000,                    '기준 재질 (보정계수=1)', ''],
  [''],
  ['■ AUTO-4 계산', '', '', '', ''],
  ['항목', '값', '단위', '비고', ''],
  ['파트 중량', part.part_weight_g, 'g', '미입력 (0g)', ''],
  ['판정', '→ 중량 0g → 사출량 계산 스킵', '', '중량 미입력 시 사출량 조건 무시', ''],
  ['필요 사출량', reqShot, 'g', '스킵으로 인해 0g', ''],
  [''],
  ['■ 정상 케이스 예시 (파트중량=50g, 런너=7.5g, 캐비티=2, POM 재질)', '', '', '', ''],
  ['항목', '계산식', '결과', '단위', ''],
  ['① 총 중량', '50g × 2캐비 + 7.5g', 107.5, 'g', ''],
  ['② ÷ 충전효율', '107.5 ÷ 0.8', 134.375, 'g', ''],
  ['③ × 재료보정', `134.375 × ${+(1.05/1.42).toFixed(4)}`, +(134.375 * (1.05/1.42)).toFixed(2), 'g (PS 환산)', ''],
])
sheet3['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 16 }, { wch: 40 }, { wch: 4 }]

// ═══════════════════════════════════════════════════════════════════════════
// 시트 4: 사이클타임 예측
// ═══════════════════════════════════════════════════════════════════════════
const ctRow = (label, formula_str, value, unit, note) =>
  [label, formula_str, typeof value === 'number' ? +value.toFixed(4) : value, unit, note ?? '']

const sheet4 = buildSheet([
  ['사이클타임(C/T) 예측', '', '', '', ''],
  [''],
  ['■ 예측 공식', '', '', '', ''],
  ['C/T(sec) = base + weightFactor×중량 + areaFactor×√투영면적 + (캐비티-1)×2 [+ GF보정] + 두께보정', '', '', '', ''],
  [''],
  ['■ POM 재질 파라미터', '', '', '', ''],
  ['파라미터', '기호', '값', '설명', ''],
  ['기본 시간',     'base',        CT.base, '재질별 기본 성형 시간 (sec)', ''],
  ['중량 계수',     'weightFactor', CT.wf,  '중량 1g 당 추가 시간 (sec/g)', ''],
  ['면적 계수',     'areaFactor',  CT.af,  '√투영면적 당 추가 시간 (sec/√cm²)', ''],
  ['GF 보정계수',   'gfMultiplier', CT.gfMul, 'GF/CF 강화재 함유 시 적용 (POM은 미해당)', ''],
  [''],
  ['■ 단계별 계산 (AUTO-4)', '', '', '', ''],
  ['단계', '계산식', '값', '단위', '비고'],
  ctRow('입력 면적', '실제=1.2cm² → 최소값 적용', area_eff, 'cm²', '최소 10cm² 제한'),
  ctRow('입력 중량', '실제=0g → 최소값 적용', weight_eff, 'g', '최소 1g 제한'),
  ctRow('① 기본 시간', `base = ${CT.base}`, CT.base, 'sec', ''),
  ctRow('② 중량 기여', `${CT.wf} × ${weight_eff}`, CT.wf * weight_eff, 'sec', ''),
  ctRow('③ 면적 기여', `${CT.af} × √${area_eff} = ${CT.af} × ${+Math.sqrt(area_eff).toFixed(4)}`,
    CT.af * Math.sqrt(area_eff), 'sec', ''),
  ctRow('④ 멀티캐비 보정', `(${part.cavity_count}-1) × 2`, (part.cavity_count - 1) * 2, 'sec', '캐비티=1이므로 0'),
  ctRow('⑤ GF/CF 보정', '미적용 (POM(WHITE)는 순수재질)', null, '', 'GF 없음'),
  ctRow('⑥ 소계 (두께 보정 전)', `${CT.base} + ${CT.wf * weight_eff} + ${+(CT.af * Math.sqrt(area_eff)).toFixed(4)} + 0`,
    ct_base_calc, 'sec', ''),
  [''],
  ['■ 두께 보정 (핵심 - 냉각시간 계산)', '', '', '', ''],
  ['단계', '계산식', '값', '단위', '비고'],
  ctRow('두께(t)', 'notes에서 추출: thickness_mm:6', THICKNESS_MM, 'mm', ''),
  ctRow('냉각시간 T_c', `2.5 × t² = 2.5 × ${THICKNESS_MM}² = 2.5 × ${THICKNESS_MM*THICKNESS_MM}`,
    coolingTime, 'sec', '두께 클수록 기하급수 증가'),
  ctRow('기준 냉각 기여분', `base × 0.6 = ${CT.base} × 0.6`, baseCooling, 'sec', 'base 시간 중 냉각 비중 60%'),
  ctRow('추가 냉각 시간', `T_c - 기준냉각 = ${coolingTime} - ${baseCooling}`,
    coolingTime - baseCooling, 'sec', '추가 냉각만큼 보정'),
  [''],
  ['■ 최종 C/T 계산', '', '', '', ''],
  ['단계', '계산식', '값', '단위', '비고'],
  ctRow('⑦ C/T (보정 후)', `${+ct_base_calc.toFixed(4)} + ${coolingTime - baseCooling}`,
    ct_base_calc + (coolingTime - baseCooling), 'sec', ''),
  ctRow('⑧ 범위 제한', `min(300, max(15, ${+(ct_base_calc + coolingTime - baseCooling).toFixed(2)}))`,
    null, '', '최소 15sec, 최대 300sec'),
  ctRow('⑨ 반올림', `round(${+(ct_base_calc + coolingTime - baseCooling).toFixed(2)})`,
    ct_final, 'sec', '★ 최종 예측 C/T'),
  [''],
  ['■ 참고: 재질별 C/T 파라미터', '', '', '', ''],
  ['재질', 'base', 'weightFactor', 'areaFactor', 'gfMultiplier'],
  ['PP',  15, 0.15, 1.5, 1.20],
  ['ABS', 12, 0.12, 1.2, 1.15],
  ['PA6/PA66', 18, 0.20, 1.5, 1.10],
  ['PC',  20, 0.25, 2.0, 1.20],
  ['POM', 18, 0.20, 1.5, 1.15],
  ['PE',  14, 0.14, 1.4, 1.10],
  ['PS',  10, 0.10, 1.0, 1.10],
  ['TPE', 12, 0.12, 1.2, 1.10],
])
sheet4['!cols'] = [{ wch: 22 }, { wch: 42 }, { wch: 12 }, { wch: 8 }, { wch: 36 }]

// ═══════════════════════════════════════════════════════════════════════════
// 시트 5: 설비 추천 결과
// ═══════════════════════════════════════════════════════════════════════════
const sheet5 = buildSheet([
  ['AUTO-4 설비 추천 결과', '', '', '', '', '', ''],
  [''],
  ['■ 추천 기준', '', '', '', '', '', ''],
  ['조건', '판정 기준', '', '', '', '', ''],
  ['형체력', '설비 형체력 ≥ 필요 형체력 (0.504T)', '', '', '', '', ''],
  ['사출량', '파트 중량 0g → 스킵 (모든 설비 통과)', '', '', '', '', ''],
  ['금형 크기', '금형 215×208mm ≤ 설비 타이바/형판', '', '', '', '', ''],
  ['최적 범위', '형체력 활용률 60~85% → 70%에 가까운 순위', '', '', '', '', ''],
  [''],
  ['■ 추천 결과 (1~3순위)', '', '', '', '', '', ''],
  ['순위', '설비명', '설비용량(T)', '설비사출량(g)', '형체력활용률', '사출량활용률', '판정'],
  ...recommendations.map(r => [
    `${r.rank}순위`,
    r.machine,
    r.capacity_ton,
    r.shot_weight_g,
    +r.util_clamping.toFixed(2) + '%',
    +r.util_shot.toFixed(2) + '%',
    r.util_clamping >= 60 && r.util_clamping <= 85 ? '✓ 최적' : '△ 비최적 (과잉 용량)',
  ]),
  [''],
  ['■ 판정 해설', '', '', '', '', '', ''],
  ['항목', '내용', '', '', '', '', ''],
  ['형체력 활용률', `0.504T / ${recommendations[0].capacity_ton}T × 100 = ${recommendations[0].util_clamping}%`, '', '', '', '', ''],
  ['판정', '0.84% << 60% 최적 하한 → 설비가 과잉 용량', '', '', '', '', ''],
  ['원인', '투영면적 1.2cm²로 매우 작은 소형 파트', '', '', '', '', ''],
  ['조치 필요', '더 소형 설비(30T 이하) 추가 시 최적 배정 가능', '', '', '', '', ''],
  [''],
  ['■ 형체력 활용률 기준', '', '', '', '', '', ''],
  ['범위', '판정', '색상', '', '', '', ''],
  ['< 60%',     '과잉 용량 (비효율)', '노란색',  '', '', '', ''],
  ['60% ~ 85%', '최적 범위',          '초록색',  '', '', '', ''],
  ['> 85%',     '과부하 위험',         '빨간색',  '', '', '', ''],
])
sheet5['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 22 }]

// ═══════════════════════════════════════════════════════════════════════════
// 워크북 조합 및 저장
// ═══════════════════════════════════════════════════════════════════════════
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, sheet1, '1. 파트 기본정보')
XLSX.utils.book_append_sheet(wb, sheet2, '2. 형체력 산출')
XLSX.utils.book_append_sheet(wb, sheet3, '3. 사출량 산출')
XLSX.utils.book_append_sheet(wb, sheet4, '4. 사이클타임 예측')
XLSX.utils.book_append_sheet(wb, sheet5, '5. 설비 추천 결과')

const outPath = path.join(__dirname, '..', 'AUTO-4_산출방법_상세.xlsx')
XLSX.writeFile(wb, outPath)
console.log(`✅ Excel 저장 완료: ${outPath}`)
