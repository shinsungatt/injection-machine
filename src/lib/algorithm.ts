import type { Machine, Part, Recommendation } from './supabase'

// 수지압력 기준값 (kgf/cm²)
const RESIN_PRESSURE: Record<string, number> = {
  PP: 300,
  ABS: 350,
  PA66: 400,
  PA: 400,
  PC: 450,
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
  POM: 1.05 / 1.42,  // 0.739
  PE: 1.05 / 0.95,   // 1.105
  PS: 1.0,
  PET: 1.05 / 1.37,  // 0.766
  TPE: 1.05 / 0.90,  // 1.167
}

// 재질 문자열에서 기준 키 추출: "PA6-GF30%" → "PA66", "PP-GF20" → "PP"
function normalizeMaterialKey(material: string): string {
  const upper = material.toUpperCase().replace(/\s/g, '')
  if (upper.startsWith('PA6') || upper.startsWith('PA ')) return 'PA66'
  if (upper.startsWith('PP')) return 'PP'
  if (upper.startsWith('PC+ABS') || upper.startsWith('PC/ABS')) return 'PC'
  if (upper.startsWith('PC')) return 'PC'
  if (upper.startsWith('ABS')) return 'ABS'
  if (upper.startsWith('POM')) return 'POM'
  if (upper.startsWith('PET')) return 'PET'
  if (upper.startsWith('TPE') || upper.startsWith('TPU') || upper.startsWith('TPS')) return 'TPE'
  if (upper.startsWith('PE')) return 'PE'
  if (upper.startsWith('PS')) return 'PS'
  return upper.split(/[\s\-_+/]/)[0]
}

export function getResinPressure(material: string): number {
  const key = normalizeMaterialKey(material)
  return RESIN_PRESSURE[key] ?? 350
}

export function getMaterialCorrection(material: string): number {
  const key = normalizeMaterialKey(material)
  return MATERIAL_CORRECTION[key] ?? 1.0
}

/**
 * 필요 형체력 계산 (ton)
 * = 투영면적(cm²) × 수지압력(kgf/cm²) × 캐비티수 / 1000 × 안전율 1.2
 */
export function calcRequiredClampingForce(part: Part): number {
  const resinPressure = getResinPressure(part.material)
  return (part.projected_area_cm2 * resinPressure * part.cavity_count / 1000) * 1.2
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
 */
export function checkMoldFit(part: Part, machine: Machine): boolean {
  if (!part.mold_width_mm || !part.mold_height_mm) return true // 금형 크기 미입력 시 통과
  return (
    part.mold_width_mm <= machine.tie_bar_x_mm &&
    part.mold_height_mm <= machine.tie_bar_y_mm &&
    part.mold_width_mm <= machine.platen_width_mm &&
    part.mold_height_mm <= machine.platen_height_mm
  )
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
    if (!moldFit) notes.push('금형 크기 초과')
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
  PP:   { base: 15, weightFactor: 0.15, areaFactor: 1.5, gfMultiplier: 1.20 },
  ABS:  { base: 12, weightFactor: 0.12, areaFactor: 1.2, gfMultiplier: 1.15 },
  PA66: { base: 18, weightFactor: 0.20, areaFactor: 1.5, gfMultiplier: 1.10 },
  PA6:  { base: 18, weightFactor: 0.20, areaFactor: 1.5, gfMultiplier: 1.10 },
  PA:   { base: 18, weightFactor: 0.20, areaFactor: 1.5, gfMultiplier: 1.10 },
  PC:   { base: 20, weightFactor: 0.25, areaFactor: 2.0, gfMultiplier: 1.20 },
  POM:  { base: 18, weightFactor: 0.20, areaFactor: 1.5, gfMultiplier: 1.15 },
  PE:   { base: 14, weightFactor: 0.14, areaFactor: 1.4, gfMultiplier: 1.10 },
  PS:   { base: 10, weightFactor: 0.10, areaFactor: 1.0, gfMultiplier: 1.10 },
  PET:  { base: 16, weightFactor: 0.18, areaFactor: 1.5, gfMultiplier: 1.15 },
  TPE:  { base: 12, weightFactor: 0.12, areaFactor: 1.2, gfMultiplier: 1.10 },
  TPU:  { base: 14, weightFactor: 0.14, areaFactor: 1.3, gfMultiplier: 1.10 },
}

function getCTParams(material: string): CTParams {
  const key = normalizeMaterialKey(material)
  return CT_PARAMS[key] ?? { base: 15, weightFactor: 0.15, areaFactor: 1.5, gfMultiplier: 1.15 }
}

/**
 * 예상 사이클타임 예측 (sec)
 * - cycle_time_sec 가 없을 때 사용
 * - 재질, 중량, 투영면적, 캐비티 수 기반으로 추산
 */
export function predictCycleTime(part: Part): number {
  const params = getCTParams(part.material)
  const hasGF = /GF|CF|GLASS|CARBON/i.test(part.material)
  const area   = Math.max(part.projected_area_cm2 || 10, 10)
  const weight = Math.max(part.part_weight_g      || 1,  1)

  let ct = params.base
    + params.weightFactor * weight
    + params.areaFactor   * Math.sqrt(area)
    + (part.cavity_count - 1) * 2   // 멀티캐비티: 캐비티당 +2sec

  if (hasGF) ct *= params.gfMultiplier

  return Math.round(Math.max(15, Math.min(150, ct)))
}
