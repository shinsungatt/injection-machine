import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import { parseProductSize, calcMoldSizeFromProduct, productDimsToProjectedArea } from '@/lib/algorithm'

// Normalize: lowercase, remove brackets/quotes, collapse spaces
const norm = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[()（）\[\]'′`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Internal field → recognized header names (after normalization)
const ALIASES: Record<string, string[]> = {
  part_number: [
    'part_number', 'part number', 'no', 'no.', 'num', '번호',
    '품번', '도번', 'item no', 'item_no', '부품번호',
    '연번', '순번', '일련번호', '품목번호',
    // Note: 'dk입고품번' is a parent-assembly reference in LW1, excluded intentionally
  ],
  part_name: [
    'part_name', 'part name', '품목명', '품명', '파트명', 'sub품명',
    'item name', 'name', '제품명', '부품명', 'title',
    '명칭', '품목', '아이템', '아이템명', '제품 명칭', '부품 명칭', '파트 명칭',
    // '품목' excluded from earlier: re-added as it's common in many BOM formats
  ],
  material: [
    'material', '원소재', '원재료', '재질', '소재명', '소재', '재료',
    '소재정보 소재명', '원자재', 'mat',
  ],
  part_weight_g: [
    'part_weight_g', 'weight g', 'weight unit', '중량', '설계중량',
    '단중', 'weight', '무게', '중량 g', '단중 g', '부품중량',
    'net 중량', 'net중량', '순중량',
  ],
  runner_weight_g: [
    'runner_weight_g', 'r/sprue g', 'runner', '런너', 'sprue', 'runner weight',
    '스프루 런너 중량', '스프루런너중량', '런너 중량', '런너중량', '스프루중량',
  ],
  cavity_count: [
    'cavity_count', 'cavity', 'q ty', 'qty', '캐비티', '수량',
    '소요량', 'quantity', '캐비티수', '캐비티 수',
  ],
  projected_area_cm2: [
    'projected_area_cm2', '투영면적', 'projected area',
    '투영면적 cm2', '투영면적 cm²',
  ],
  mold_width_mm: [
    'mold_width_mm', '금형사이즈 가로', '금형사이즈가로',
    '금형 사이즈 mm 가로 폭', '가로 폭', '금형가로', 'mold width',
  ],
  mold_height_mm: [
    'mold_height_mm', '금형사이즈 세로', '금형사이즈세로',
    '금형 사이즈 mm 세로 길이', '세로 길이', '금형세로', 'mold height',
  ],
  mold_depth_mm: [
    'mold_depth_mm', '금형사이즈 높이', '금형사이즈높이',
    '금형 사이즈 mm 높이 두께', '높이 두께', '금형두께', 'mold depth',
  ],
  // 제품 사이즈 개별 컬럼 — product_size 보다 먼저 선언해야 startsWith 오매핑 방지
  product_width_mm: [
    'product_width_mm', 'part_width_mm',
    '제품사이즈 가로', '제품사이즈가로', '제품 가로', '제품가로',
    '가로', '가로(mm)', '가로 mm', 'product width', 'part width',
  ],
  product_height_mm: [
    'product_height_mm', 'part_height_mm',
    '제품사이즈 세로', '제품사이즈세로', '제품 세로', '제품세로',
    '세로', '세로(mm)', '세로 mm', 'product height', 'part height',
  ],
  product_depth_mm: [
    'product_depth_mm', 'part_depth_mm',
    '제품사이즈 높이', '제품사이즈높이', '제품 높이', '제품높이',
    '높이', '높이(mm)', '높이 mm', 'product depth', 'part depth',
  ],
  // 제품 사이즈 통합 컬럼 (한 칸에 가로×세로×높이 형태)
  // ※ 개별 컬럼보다 나중에 선언 — "제품사이즈 가로" 같은 컬럼이 여기로 오매핑되지 않도록
  product_size: [
    'product_size', '제품사이즈', '제품 사이즈', '사이즈', '제품크기', '제품 크기',
    '외형사이즈', '외형 사이즈', '외형', '제품치수', '제품 치수', 'product size',
    '크기 mm', '크기(mm)',
  ],
  cycle_time_sec: [
    'cycle_time_sec', 'c/t', 'c/t sec', 'ct', 'ct sec', 'cycle time',
    '사이클타임', '사이클 타임', 'c/time', '예상 c/time', '예상c/time',
  ],
  // Injection type indicators
  is_injection: ['구분 사출'],         // LW1: "●" means injection part
  part_type:    ['type', 'part type'], // BD Atlas: "IJ"=injection, "ASM/MTS/OTS"=skip
  mold_type:    ['구분'],              // Pioneer: "MOLD"=injection, "ASSY"=skip
}

function mapColumn(header: string): string | null {
  const n = norm(header)
  if (!n || n.length < 2) return null
  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      // 정확 일치
      if (n === alias) return field
      // "field_name(한글설명)" 형태: 정규화 후 "field_name 한글설명"이 되므로
      // alias 뒤에 공백이 오는 경우 prefix 일치 허용 (alias 길이 4자 이상만)
      if (alias.length >= 4 && n.startsWith(alias + ' ')) return field
    }
  }
  return null
}

function scoreRow(row: unknown[]): number {
  return row.filter(c => mapColumn(String(c ?? '')) !== null).length
}

function getFieldsOfRow(row: unknown[]): Set<string> {
  const s = new Set<string>()
  for (const c of row) {
    const f = mapColumn(String(c ?? ''))
    if (f) s.add(f)
  }
  return s
}

// Pick the most likely BOM sheet
function pickSheet(wb: XLSX.WorkBook): string {
  const skip = ['물량정보', '현황', '생산 계획', '생산계획', 'summary', 'overview']
  for (const name of wb.SheetNames) {
    if (!skip.some(p => name.toLowerCase().includes(p.toLowerCase()))) return name
  }
  return wb.SheetNames[0]
}

// Sample non-empty values from a column starting at dataStart
function columnSamples(rows: unknown[][], colIdx: number, start: number, n = 8): string[] {
  return rows.slice(start, start + n * 2)
    .map(r => String((r as unknown[])[colIdx] ?? '').trim())
    .filter(v => v && v !== '●' && v !== '○')
    .slice(0, n)
}

// Does this column contain part-code-like values (e.g. "84640-XW110", "P-001")
function looksLikePartCode(values: string[]): boolean {
  if (values.length === 0) return false
  const hits = values.filter(v => /^[A-Z0-9]{3,}[-_][A-Z0-9]/.test(v)).length
  return hits / values.length >= 0.5
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheetName = pickSheet(workbook)
  const sheet = workbook.Sheets[sheetName]
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]

  if (rawRows.length === 0) {
    return NextResponse.json({ error: '데이터가 없습니다.' }, { status: 400 })
  }

  // ── 1. Find best header row (scan first 6 rows) ──────────────────────────
  let headerIdx = 0
  let bestScore = 0
  for (let i = 0; i < Math.min(6, rawRows.length); i++) {
    const s = scoreRow(rawRows[i])
    if (s > bestScore) { bestScore = s; headerIdx = i }
  }

  if (bestScore === 0) {
    return NextResponse.json({
      error: '컬럼 헤더를 인식하지 못했습니다. 파트명, 재료, 중량 등의 헤더가 포함된 시트인지 확인하세요.'
    }, { status: 400 })
  }

  // ── 2. Sub-header detection (LW1 style two-row headers) ──────────────────
  // A row is a sub-header if it matches NEW fields not covered by the main header row
  const headerRowFields = getFieldsOfRow(rawRows[headerIdx])
  const nextRowRaw = headerIdx + 1 < rawRows.length ? rawRows[headerIdx + 1] : []
  const nextRowFields = getFieldsOfRow(nextRowRaw)
  const newFieldsInNext = [...nextRowFields].filter(f => !headerRowFields.has(f))
  const isSubHeader = newFieldsInNext.length > 0

  // ── 3. Build merged column headers ───────────────────────────────────────
  const headerRow = rawRows[headerIdx].map(c => String(c ?? '').trim())
  const nextRow = nextRowRaw.map(c => String(c ?? '').trim())
  const headers = headerRow.map((curr, i) => {
    const sub = isSubHeader ? (nextRow[i] ?? '') : ''
    if (curr && sub && sub !== curr) return `${curr} ${sub}`
    return curr || `col_${i}`
  })

  const dataStart = headerIdx + (isSubHeader ? 2 : 1)

  // ── 4. Build column index map ─────────────────────────────────────────────
  const colMap: Record<string, number> = {}
  for (let i = 0; i < headers.length; i++) {
    const field = mapColumn(headers[i])
    if (field && !(field in colMap)) colMap[field] = i
  }

  // ── 5. Content-based correction for LW1-style files ──────────────────────
  // When part_name column contains part-code values (like "84640-XW110"),
  // it's actually part_number. Look for the next column for part_name.
  if (colMap.part_name !== undefined && colMap.part_number === undefined) {
    const samples = columnSamples(rawRows, colMap.part_name, dataStart)
    if (looksLikePartCode(samples)) {
      colMap.part_number = colMap.part_name
      delete colMap.part_name
      // Search for the next unmapped column with name-like content
      const usedCols = new Set(Object.values(colMap))
      for (let i = colMap.part_number + 1; i < headers.length; i++) {
        if (usedCols.has(i)) continue
        const nextSamples = columnSamples(rawRows, i, dataStart)
        // Name-like: contains spaces or Korean/mixed chars, not pure codes
        const hasNames = nextSamples.some(v => /\s/.test(v) || /[가-힣]/.test(v))
        if (hasNames) { colMap.part_name = i; break }
      }
    }
  }

  // ── 6. Parse data rows ────────────────────────────────────────────────────
  const parts = []
  let skipped = 0
  let filteredInjection = 0
  const seenNumbers = new Set<string>()

  for (let ri = dataStart; ri < rawRows.length; ri++) {
    const row = rawRows[ri] as unknown[]
    if (row.every(c => c === '' || c === null || c === undefined)) continue

    const get = (f: string) => colMap[f] !== undefined ? row[colMap[f]] : undefined

    // ── Injection type filtering ──────────────────────────────────────────
    let isInjection = true

    if ('is_injection' in colMap) {
      // LW1 style: "구분 사출" column — non-empty/non-zero = injection
      const val = String(get('is_injection') ?? '').trim()
      isInjection = val !== '' && val !== '0'
    } else if ('mold_type' in colMap) {
      // Pioneer style: "구분" column — MOLD=injection, ASSY/BUY=skip, empty=skip
      const val = String(get('mold_type') ?? '').trim().toUpperCase()
      if (val === '') { skipped++; continue }
      isInjection = /^(MOLD|MOULD|사출|INJ)/.test(val)
    } else if ('part_type' in colMap) {
      // BD Atlas style: "Type" column — IJ/INJ/PLT=injection, others=skip
      const val = String(get('part_type') ?? '').trim().toUpperCase()
      if (val === '') {
        isInjection = false  // empty type → not injection
      } else {
        const isInj    = /^(IJ|INJ|INJECTION|PLT|PLASTIC|사출)/.test(val)
        const isNonInj = /^(ASM|ASSY|MTS|OTS|STP|BUY|구매|조립|금속|표준)/.test(val)
        if (isNonInj && !isInj) isInjection = false
      }
    }

    if (!isInjection) { filteredInjection++; continue }

    // ── Part number & name ────────────────────────────────────────────────
    const partNumber = String(get('part_number') ?? '').trim()
    const partName   = String(get('part_name')   ?? '').trim()

    // part_name/part_number 컬럼이 colMap에 있는데 값이 비어 있으면 스킵
    // 컬럼 자체가 없는 경우(colMap 미존재)는 AUTO-N으로 처리하여 스킵하지 않음
    const hasNameCol = 'part_name' in colMap || 'part_number' in colMap
    if (hasNameCol && !partNumber && !partName) { skipped++; continue }
    if (/^(합계|total|소계|sub.?total|소 계)/i.test(partName || partNumber)) continue

    // Ensure unique part_number within this batch
    let pn = partNumber || `AUTO-${ri}`
    if (seenNumbers.has(pn)) {
      let suffix = 2
      while (seenNumbers.has(`${pn}-${suffix}`)) suffix++
      pn = `${pn}-${suffix}`
    }
    seenNumbers.add(pn)

    // ── Other fields ──────────────────────────────────────────────────────
    const matRaw      = String(get('material')        ?? '').trim()
    const partWeight  = Number(get('part_weight_g')   ?? 0) || 0
    const runnerRaw   = Number(get('runner_weight_g') ?? 0)
    const runnerWeight = runnerRaw > 0 ? runnerRaw : partWeight * 0.15
    const cavityRaw   = Number(get('cavity_count')    ?? 1)
    const cavityCount = cavityRaw > 0 && Number.isFinite(cavityRaw) ? Math.round(cavityRaw) : 1

    // ── 제품 사이즈 파싱 ────────────────────────────────────────────────────
    // 1) 통합 컬럼 "100×200×50" 형태 우선 파싱
    // 2) 개별 컬럼(가로/세로/높이) 보완
    let productW = 0, productH = 0, productD = 0
    if (colMap.product_size !== undefined) {
      const parsed = parseProductSize(String(row[colMap.product_size] ?? ''))
      if (parsed) { productW = parsed.width; productH = parsed.height; productD = parsed.depth }
    }
    if (!productW && colMap.product_width_mm  !== undefined) productW = Number(row[colMap.product_width_mm])  || 0
    if (!productH && colMap.product_height_mm !== undefined) productH = Number(row[colMap.product_height_mm]) || 0
    if (!productD && colMap.product_depth_mm  !== undefined) productD = Number(row[colMap.product_depth_mm])  || 0

    // ── 투영면적: 엑셀 값 우선, 없으면 제품 사이즈에서 자동 계산 ─────────────
    let projArea = Number(get('projected_area_cm2') ?? 0) || 0
    if (projArea === 0 && productW > 0 && productH > 0) {
      projArea = productDimsToProjectedArea(productW, productH)
    }

    // ── 금형 크기: 엑셀 값 우선, 없으면 제품 사이즈 + 캐비티 수로 자동 계산 ──
    let moldW = colMap.mold_width_mm  !== undefined ? (Number(row[colMap.mold_width_mm])  || null) : null
    let moldH = colMap.mold_height_mm !== undefined ? (Number(row[colMap.mold_height_mm]) || null) : null
    const moldD = colMap.mold_depth_mm !== undefined ? (Number(row[colMap.mold_depth_mm]) || null) : null
    if (moldW === null && productW > 0 && productH > 0) {
      const est = calcMoldSizeFromProduct(productW, productH, cavityCount)
      moldW = est.width
      moldH = est.height
    }

    // 사이클타임 (C/T)
    const ctRaw = colMap.cycle_time_sec !== undefined ? Number(row[colMap.cycle_time_sec]) : NaN
    const cycleTimeSec = !isNaN(ctRaw) && ctRaw > 0 ? Math.round(ctRaw) : null

    parts.push({
      project_id:        id,
      part_number:       pn,
      part_name:         partName || partNumber,
      material:          (matRaw || 'ABS').toUpperCase().slice(0, 50),
      part_weight_g:     partWeight,
      projected_area_cm2: projArea,
      cavity_count:      cavityCount,
      runner_weight_g:   runnerWeight,
      mold_width_mm:     moldW,
      mold_height_mm:    moldH,
      mold_depth_mm:     moldD,
      cycle_time_sec:    cycleTimeSec,
    })
  }

  if (parts.length === 0) {
    const reason = filteredInjection > 0
      ? `사출 파트가 없습니다. (비사출 제외: ${filteredInjection}행, 시트: "${sheetName}")`
      : `유효한 파트 데이터가 없습니다. (건너뜀: ${skipped}행, 시트: "${sheetName}", 인식 컬럼: ${Object.keys(colMap).join(', ') || '없음'})`
    return NextResponse.json({ error: reason }, { status: 400 })
  }

  const { data, error } = await supabase.from('parts').insert(parts).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('projects').update({ status: 'analyzing' }).eq('id', id)

  return NextResponse.json({
    success: true,
    count:          data?.length ?? 0,
    sheet:          sheetName,
    skipped,
    filteredInjection,
    mappedColumns:  Object.keys(colMap),
  })
}
