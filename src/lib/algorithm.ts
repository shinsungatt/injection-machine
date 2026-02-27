import type { Machine, Part, Recommendation } from './supabase'

// ────────────────────────────────────────────────────────────────
// 제품 사이즈 파싱 / 금형 크기 추정
// ────────────────────────────────────────────────────────────────

/**
 * 제품 사이즈 문자열 파싱 → { width, height, depth } (mm)
 * 지원 형식:
 *   "100×200×50", "100x200x50", "100*200*50", "100 200 50"
 *   "W100 H200 D50", "가로100 세로200 높이50"
 */
export function parseProductSize(raw: string): { width: number; height: number; depth: number } | null {
  if (!raw || !raw.trim()) return null
  let s = String(raw)
    .replace(/mm/gi, '')
    .replace(/cm/gi, '')
    .replace(/가로|폭/g, ' ')
    .replace(/세로|길이/g, ' ')
    .replace(/높이|두께|깊이/g, ' ')
    .replace(/W\s*[:=]?\s*/gi, ' ')
    .replace(/H\s*[:=]?\s*/gi, ' ')
    .replace(/D\s*[:=]?\s*/gi, ' ')
    .replace(/L\s*[:=]?\s*/gi, ' ')
    .trim()
  const nums = s
    .split(/[×xX✕＊*,，\s/\\]+/)
    .map(n => parseFloat(n.trim()))
    .filter(n => !isNaN(n) && n > 0)
  if (nums.length >= 3) return { width: nums[0], height: nums[1], depth: nums[2] }
  if (nums.length === 2) return { width: nums[0], height: nums[1], depth: 0 }
  return null
}

/**
 * 캐비티 수 → 배치 레이아웃 [cols, rows]
 * 가능하면 가로 방향으로 더 배치 (금형 가로 확장 최소화)
 */
export function calcCavityLayout(count: number): [number, number] {
  const n = Math.max(1, Math.round(count))
  if (n <= 1)  return [1, 1]
  if (n <= 2)  return [2, 1]
  if (n <= 4)  return [2, 2]
  if (n <= 6)  return [3, 2]
  if (n <= 8)  return [4, 2]
  if (n <= 12) return [4, 3]
  if (n <= 16) return [4, 4]
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  return [cols, rows]
}

/**
 * 제품 사이즈 + 캐비티수 → 금형 크기 추정 (mm)
 * 외곽 여유: 기본 100mm (양측), 슬라이드 구조 시 200mm (양측)
 * 캐비티 간 간격: 60 mm
 */
export function calcMoldSizeFromProduct(
  productW: number,
  productH: number,
  cavityCount: number,
  hasSlide = false
): { width: number; height: number } {
  const [cols, rows] = calcCavityLayout(cavityCount)
  const outer = hasSlide ? 200 : 100 // 슬라이드 시 외곽 여유 200mm, 기본 100mm
  const gap   = 60                   // 캐비티 간 간격 (mm)
  return {
    width:  Math.ceil(productW * cols + gap * (cols - 1) + outer * 2),
    height: Math.ceil(productH * rows + gap * (rows - 1) + outer * 2),
  }
}

/**
 * 제품 가로×세로 (mm) → 투영면적 (cm²)
 * 1 cm² = 100 mm²
 */
export function productDimsToProjectedArea(widthMm: number, heightMm: number): number {
  return Math.round((widthMm * heightMm) / 100 * 100) / 100
}

// ────────────────────────────────────────────────────────────────
// notes 필드 파싱 헬퍼
// ────────────────────────────────────────────────────────────────

/**
 * notes 필드에서 제품 두께(mm) 추출
 * 저장 형식: "thickness_mm:3.5" 또는 "t=3.5" 등
 */
export function getThicknessFromNotes(notes: string | null | undefined): number | null {
  if (!notes) return null
  const m = notes.match(/thickness_mm[=:]\s*([\d.]+)/i)
    ?? notes.match(/\bt[=:]\s*([\d.]+)\s*mm/i)
  if (m) {
    const v = parseFloat(m[1])
    return v > 0 ? v : null
  }
  return null
}

/**
 * notes/remark 필드에 슬라이드 구조 여부 확인
 */
export function hasSlideCore(notes: string | null | undefined): boolean {
  if (!notes) return false
  return /slide/i.test(notes) || /슬라이드/.test(notes)
}

/**
 * notes 필드에서 표면 처리(Finish) 추출
 */
export function getFinishFromNotes(notes: string | null | undefined): string {
  if (!notes) return ''
  const m = notes.match(/finish[=:]\s*([^\|;]+)/i)
  return m ? m[1].trim() : ''
}

// 수지압력 기준값 (kgf/cm²)
const RESIN_PRESSURE: Record<string, number> = {
  PP: 300,
  ABS: 350,
  PA66: 400,
  PA: 400,
  PC: 450,
  PCABS: 450,  // PC+ABS: PC 수준 수지압력
  POM: 350,
  PE: 280,
  PS: 320,
  PET: 380,
  TPE: 300,
}

// 재료 보정계수 (PS 기준 1.05 대비, PS density ≈ 1.05 g/cm³)
const MATERIAL_CORRECTION: Record<string, number> = {
  PP: 1.05 / 0.91,   // 1.154
  ABS: 1.05 / 1.05,  // 1.000
  PA66: 1.05 / 1.14, // 0.921
  PA: 1.05 / 1.14,   // 0.921
  PC: 1.05 / 1.20,   // 0.875
  PCABS: 1.05 / 1.20, // 0.875 (기존 동일 유지)
  POM: 1.05 / 1.42,  // 0.739
  PE: 1.05 / 0.95,   // 1.105
  PS: 1.0,
  PET: 1.05 / 1.37,  // 0.766
  TPE: 1.05 / 0.90,  // 1.167
}

// 재질별 밀도 (g/cm³) — 유효 두께 역산에 사용
const MATERIAL_DENSITY: Record<string, number> = {
  PP:    0.91,
  ABS:   1.05,
  PA66:  1.14,
  PA6:   1.14,
  PA:    1.14,
  PC:    1.20,
  PCABS: 1.15,  // PC+ABS 실측 밀도
  POM:   1.42,
  PE:    0.95,
  PS:    1.05,
  PET:   1.37,
  TPE:   0.90,
  TPU:   1.20,
}

// 두께 기반 냉각시간 계수 k  (t_cool = t_mm² × k)
// 열확산계수 α·온도 조건(용융/금형/이형) 기반 보정값
// PC+ABS: α=0.001cm²/s, Tm=260°C, Tw=65°C, Te=95°C → k≈1.7
const COOLING_K_FACTOR: Record<string, number> = {
  PP:    1.2,
  ABS:   1.4,
  PA66:  1.3,
  PA6:   1.3,
  PA:    1.3,
  PC:    2.0,
  PCABS: 1.7,  // Ballman-Shusman 이론식 검증값
  POM:   1.4,
  PE:    1.1,
  PS:    1.0,
  PET:   1.5,
  TPE:   1.2,
  TPU:   1.3,
}

// 재질 문자열에서 기준 키 추출: "PA6-GF30%" → "PA66", "PC+ABS NS5000CRT" → "PCABS"
function normalizeMaterialKey(material: string): string {
  const upper = material.toUpperCase().replace(/\s/g, '')
  if (upper.startsWith('PA6') || upper.startsWith('PA ')) return 'PA66'
  if (upper.startsWith('PP')) return 'PP'
  if (upper.startsWith('PC+ABS') || upper.startsWith('PC/ABS') || upper.startsWith('PCABS')) return 'PCABS'
  if (upper.startsWith('PC')) return 'PC'
  if (upper.startsWith('ABS')) return 'ABS'
  if (upper.startsWith('POM')) return 'POM'
  if (upper.startsWith('PET')) return 'PET'
  if (upper.startsWith('TPE') || upper.startsWith('TPU') || upper.startsWith('TPS')) return 'TPE'
  if (upper.startsWith('PE')) return 'PE'
  if (upper.startsWith('PS')) return 'PS'
  return upper.split(/[\s\-_+/]/)[0]
}

/**
 * 수지압력 조회
 * PC+ABS 재질이고 FINISH가 High Glossy인 경우 450 → 600 적용
 */
export function getResinPressure(material: string, finish?: string): number {
  const key = normalizeMaterialKey(material)
  const base = RESIN_PRESSURE[key] ?? 350
  // PC+ABS + High Glossy: 수지압력 600 적용
  const upper = material.toUpperCase().replace(/\s/g, '')
  const isPC_ABS = upper.startsWith('PC+ABS') || upper.startsWith('PC/ABS') || upper.startsWith('PCABS')
  const isHighGlossy = /high\s*gloss/i.test(finish ?? '')
  if (isPC_ABS && isHighGlossy) return 600
  return base
}

export function getMaterialCorrection(material: string): number {
  const key = normalizeMaterialKey(material)
  return MATERIAL_CORRECTION[key] ?? 1.0
}

/**
 * 필요 형체력 계산 (ton)
 * = 투영면적(cm²) × 수지압력(kgf/cm²) × 캐비티수 / 1000 × 안전율
 * 안전율: 슬라이드 구조 1.3, 일반 1.2
 * PC+ABS + High Glossy: 수지압력 600 적용
 */
export function calcRequiredClampingForce(part: Part): number {
  const finish = getFinishFromNotes(part.notes)
  const resinPressure = getResinPressure(part.material, finish)
  const safetyFactor = hasSlideCore(part.notes) ? 1.3 : 1.2
  return (part.projected_area_cm2 * resinPressure * part.cavity_count / 1000) * safetyFactor
}

/**
 * 필요 사출량 계산 (g, PS 기준)
 * = (파트중량 × 캐비티수 + 런너중량) / 0.8 × 재료보정계수
 */
export function calcRequiredShotWeight(part: Part): number {
  const correction = getMaterialCorrection(part.material)
  const actualWeight = (part.part_weight_g * part.cavity_count + part.runner_weight_g) / 0.8
  return actualWeight * correction
}

/**
 * 금형이 설비에 들어가는지 체크
 * - 금형 가로/세로: 타이바 + 형판(platen) 이내
 * - 금형 두께(깊이): 설비의 설치 가능 금형두께 범위(min~max) 이내
 */
export function checkMoldFit(part: Part, machine: Machine): boolean {
  // 금형 가로/세로 크기 체크 (미입력 시 통과)
  if (part.mold_width_mm && part.mold_height_mm) {
    const widthOk  = part.mold_width_mm  <= machine.tie_bar_x_mm && part.mold_width_mm  <= machine.platen_width_mm
    const heightOk = part.mold_height_mm <= machine.tie_bar_y_mm && part.mold_height_mm <= machine.platen_height_mm
    if (!widthOk || !heightOk) return false
  }

  // 금형 두께 범위 체크 (미입력 시 통과, 설비의 mold_depth 범위 값이 있을 때만 체크)
  if (part.mold_depth_mm && machine.mold_depth_min_mm > 0) {
    const depthOk = part.mold_depth_mm >= machine.mold_depth_min_mm &&
                    part.mold_depth_mm <= machine.mold_depth_max_mm
    if (!depthOk) return false
  }

  return true
}

export type RecommendationResult = {
  machine: Machine
  requiredClampingForceTon: number
  requiredShotWeightG: number
  utilizationClampingPct: number
  utilizationShotPct: number
  isRecommended: boolean
  rank: number
  notes: string
}

/**
 * 파트에 대한 설비 추천 계산
 * @returns 모든 설비의 계산 결과 (is_recommended 포함), 추천 순으로 정렬
 */
export function calculateRecommendations(
  part: Part,
  machines: Machine[]
): RecommendationResult[] {
  const requiredClamping = calcRequiredClampingForce(part)
  const requiredShot = calcRequiredShotWeight(part)

  const results: RecommendationResult[] = []

  for (const machine of machines) {
    if (!machine.is_active) continue

    const utilizationClamping = (requiredClamping / machine.clamping_force_ton) * 100
    const utilizationShot = (requiredShot / machine.shot_weight_max_g) * 100
    const moldFit = checkMoldFit(part, machine)

    // 기본 통과 조건: 형체력 충분, 사출량 충분, 금형 크기 OK
    // 투영면적 0 = 데이터 미입력 → 형체력 조건 스킵
    const areaOk = part.projected_area_cm2 > 0
    const clampingOk = !areaOk || requiredClamping <= machine.clamping_force_ton
    // 중량 0 = 데이터 미입력 → 사출량 조건 스킵
    const weightOk = part.part_weight_g > 0
    const shotOk = !weightOk || requiredShot <= machine.shot_weight_max_g

    const isEligible = clampingOk && shotOk && moldFit

    const notes: string[] = []
    if (!areaOk) notes.push('투영면적 미입력 (형체력 계산 불가)')
    else if (!clampingOk) notes.push(`형체력 부족 (필요: ${requiredClamping.toFixed(0)}T > 보유: ${machine.clamping_force_ton}T)`)
    if (!weightOk) notes.push('중량 미입력 (사출량 계산 불가)')
    else if (!shotOk) notes.push(`사출량 부족 (필요: ${requiredShot.toFixed(0)}g > 보유: ${machine.shot_weight_max_g}g)`)
    if (!moldFit) {
      // 금형 가로/세로 초과 vs 두께 범위 벗어남 구분
      const sizeExceeded = (part.mold_width_mm && part.mold_height_mm) && (
        part.mold_width_mm > machine.tie_bar_x_mm ||
        part.mold_height_mm > machine.tie_bar_y_mm ||
        part.mold_width_mm > machine.platen_width_mm ||
        part.mold_height_mm > machine.platen_height_mm
      )
      const depthOutOfRange = part.mold_depth_mm && machine.mold_depth_min_mm > 0 && (
        part.mold_depth_mm < machine.mold_depth_min_mm ||
        part.mold_depth_mm > machine.mold_depth_max_mm
      )
      if (sizeExceeded) notes.push('금형 크기 초과 (타이바/형판)')
      if (depthOutOfRange) notes.push(`금형 두께 범위 불일치 (금형: ${part.mold_depth_mm}mm, 설비범위: ${machine.mold_depth_min_mm}~${machine.mold_depth_max_mm}mm)`)
    }
    if (isEligible && (utilizationClamping < 60 || utilizationClamping > 85)) {
      notes.push(`형체력 활용률 ${utilizationClamping.toFixed(0)}% (권장: 60~85%)`)
    }

    results.push({
      machine,
      requiredClampingForceTon: requiredClamping,
      requiredShotWeightG: requiredShot,
      utilizationClampingPct: utilizationClamping,
      utilizationShotPct: utilizationShot,
      isRecommended: isEligible,
      rank: 0,
      notes: notes.join(' | '),
    })
  }

  // 추천 설비만 따로 정렬 (형체력 활용률 60~85% 최우선, 그 다음 70%에 가까운 순)
  const recommended = results
    .filter(r => r.isRecommended)
    .sort((a, b) => {
      const aOptimal = a.utilizationClampingPct >= 60 && a.utilizationClampingPct <= 85 ? 1 : 0
      const bOptimal = b.utilizationClampingPct >= 60 && b.utilizationClampingPct <= 85 ? 1 : 0
      if (aOptimal !== bOptimal) return bOptimal - aOptimal
      // 70% 기준으로 가까운 순
      return Math.abs(a.utilizationClampingPct - 70) - Math.abs(b.utilizationClampingPct - 70)
    })

  // 순위 부여 (최대 3위)
  recommended.forEach((r, i) => {
    r.rank = i + 1
  })

  // 추천 설비를 앞에, 비추천 설비를 뒤에 정렬하여 반환
  const nonRecommended = results.filter(r => !r.isRecommended)
  return [...recommended, ...nonRecommended]
}

// ────────────────────────────────────────────────────────────────
// 예상 C/T (사이클타임) 예측
// 기준: 재질별 기본 시간 + 중량 인자 × 중량 + 면적 인자 × √투영면적
// 검증: PA6-GF30%, 60g, 317cm², 2캐비 → 실측 65sec / 예측 ~64sec
// ────────────────────────────────────────────────────────────────

type CTParams = {
  base: number          // 기본 시간 (sec)
  weightFactor: number  // sec / g
  areaFactor: number    // sec / √cm²
  gfMultiplier: number  // GF·CF 강화재 보정 계수
}

const CT_PARAMS: Record<string, CTParams> = {
  PP:    { base: 15, weightFactor: 0.15, areaFactor: 1.5, gfMultiplier: 1.20 },
  ABS:   { base: 12, weightFactor: 0.12, areaFactor: 1.2, gfMultiplier: 1.15 },
  PA66:  { base: 18, weightFactor: 0.20, areaFactor: 1.5, gfMultiplier: 1.10 },
  PA6:   { base: 18, weightFactor: 0.20, areaFactor: 1.5, gfMultiplier: 1.10 },
  PA:    { base: 18, weightFactor: 0.20, areaFactor: 1.5, gfMultiplier: 1.10 },
  PC:    { base: 20, weightFactor: 0.25, areaFactor: 2.0, gfMultiplier: 1.20 },
  PCABS: { base: 18, weightFactor: 0.22, areaFactor: 1.8, gfMultiplier: 1.15 },
  POM:   { base: 18, weightFactor: 0.20, areaFactor: 1.5, gfMultiplier: 1.15 },
  PE:    { base: 14, weightFactor: 0.14, areaFactor: 1.4, gfMultiplier: 1.10 },
  PS:    { base: 10, weightFactor: 0.10, areaFactor: 1.0, gfMultiplier: 1.10 },
  PET:   { base: 16, weightFactor: 0.18, areaFactor: 1.5, gfMultiplier: 1.15 },
  TPE:   { base: 12, weightFactor: 0.12, areaFactor: 1.2, gfMultiplier: 1.10 },
  TPU:   { base: 14, weightFactor: 0.14, areaFactor: 1.3, gfMultiplier: 1.10 },
}

function getCTParams(material: string): CTParams {
  const key = normalizeMaterialKey(material)
  return CT_PARAMS[key] ?? { base: 15, weightFactor: 0.15, areaFactor: 1.5, gfMultiplier: 1.15 }
}

function getMaterialDensity(material: string): number {
  const key = normalizeMaterialKey(material)
  return MATERIAL_DENSITY[key] ?? 1.05
}

function getCoolingKFactor(material: string): number {
  const key = normalizeMaterialKey(material)
  return COOLING_K_FACTOR[key] ?? 1.5
}

/**
 * 드라이 사이클 타임 추정 (sec)
 * = 사출 충진 + 보압 + 금형 개폐 + 취출 (냉각 제외)
 * 기계 크기(형체력)에 따라 선형 스케일
 */
function estimateDryCycleTime(clampingTon: number): number {
  if (clampingTon <= 50)  return 18  // 소형 (~50T): 18초
  if (clampingTon <= 150) return 22  // 중소형 (~150T): 22초
  if (clampingTon <= 400) return 27  // 중형 (~400T): 27초
  if (clampingTon <= 800) return 33  // 대형 (~800T): 33초
  return 40                          // 초대형 (>800T): 40초
}

/**
 * 유효 벽 두께 역산 (mm)
 * ① 부품 체적 = 중량 ÷ 밀도
 * ② 평균 두께 = 체적 ÷ 투영면적 (cm → mm 변환)
 * ③ 리브/보스 보정 × 0.82 → 냉각 기준 유효 두께
 *
 * 반환값: 유효 두께 mm, rawThicknessMm은 보정 전 값
 */
function estimateEffectiveThickness(part: Part): { effectiveMm: number; rawMm: number } {
  const density      = getMaterialDensity(part.material)
  const volumeCm3    = part.part_weight_g / density
  const rawMm        = (volumeCm3 / part.projected_area_cm2) * 10  // cm → mm
  const effectiveMm  = rawMm * 0.82  // 리브·보스로 인한 체적 분산 보정
  return { effectiveMm, rawMm }
}

/**
 * 예상 사이클타임 예측 (sec)
 *
 * 개선된 3단계 로직:
 *   1단계: 중량+면적 → 유효 두께(t) 역산
 *   2단계: 재질별 냉각 계수(k) 적용  →  T_cool = t² × k
 *   3단계: T_total = T_cool + T_dry (기계 크기별 드라이 사이클)
 *
 * 혼합 전략 (블렌드):
 *   - 두꺼운 부품 (rawMm > 4.0mm): 물리 공식 100% 적용
 *   - 얇은 부품  (rawMm < 1.5mm): 기존 경험식 100% 적용 (대형 박육 부품 정확도 유지)
 *   - 중간 범위: 선형 보간
 *
 * 검증:
 *   PC+ABS NS5000CRT 18g / 42.84cm² / 1캐비 → 예측 ~33초 (이론 33.3초)
 *   PA6-GF30%       60g / 317cm²   / 2캐비 → 예측 ~62초 (실측 65초, 오차 ~4%)
 */
export function predictCycleTime(part: Part): number {
  const params  = getCTParams(part.material)
  const hasGF   = /GF|CF|GLASS|CARBON/i.test(part.material)
  const area    = Math.max(part.projected_area_cm2 || 10, 10)
  const weight  = Math.max(part.part_weight_g      || 1,  1)

  // ── 기존 경험식 (면적+중량 기반) ──────────────────────────────
  const ct_empirical = params.base
    + params.weightFactor * weight
    + params.areaFactor   * Math.sqrt(area)
    + (part.cavity_count - 1) * 2

  // ── 두께 취득: notes 직접 입력 > 중량/면적 역산 ───────────────
  const hasWeightArea  = part.part_weight_g > 0 && part.projected_area_cm2 > 0
  const explicitThick  = getThicknessFromNotes(part.notes)

  let thicknessMm: number | null = explicitThick
  let rawMm = 0

  if (thicknessMm === null && hasWeightArea) {
    const est    = estimateEffectiveThickness(part)
    thicknessMm  = est.effectiveMm
    rawMm        = est.rawMm
  } else if (thicknessMm !== null) {
    rawMm = thicknessMm  // 직접 입력된 경우 raw = 입력값 그대로
  }

  // ── 두께 기반 물리 공식: T_total = (t² × k) + T_dry ──────────
  let ct_base: number

  if (thicknessMm !== null && thicknessMm > 0) {
    const k_cool      = getCoolingKFactor(part.material)
    const t_cool      = thicknessMm * thicknessMm * k_cool
    const clampingTon = part.projected_area_cm2 > 0 ? calcRequiredClampingForce(part) : 50
    const t_dry       = estimateDryCycleTime(clampingTon)
    const cavAdj      = (part.cavity_count - 1) * 1.5

    const ct_physics = t_cool + t_dry + cavAdj

    // 블렌드 비율: rawMm 기준
    //   rawMm ≥ 4.0mm → blend=1.0 (물리 공식 100%)
    //   rawMm ≤ 1.5mm → blend=0.0 (경험식 100%)
    const blend  = Math.min(1.0, Math.max(0.0, (rawMm - 1.5) / 2.5))
    ct_base = blend * ct_physics + (1 - blend) * ct_empirical
  } else {
    ct_base = ct_empirical
  }

  const ct = hasGF ? ct_base * params.gfMultiplier : ct_base
  return Math.round(Math.max(15, Math.min(300, ct)))
}
