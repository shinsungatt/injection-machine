import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import * as XLSX from 'xlsx'
import { parseProductSize, calcMoldSizeFromProduct, productDimsToProjectedArea } from '@/lib/algorithm'
import { hasSlideCore } from '@/lib/algorithm'

// ── 컬럼 정규화 ───────────────────────────────────────────────────────────────
const norm = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[()（）\[\]'′`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ── 필드명 → 인식 헤더 별칭 목록 ─────────────────────────────────────────────
const ALIASES: Record<string, string[]> = {
  part_number: [
    'part_number', 'part number', 'no', 'no.', 'num', '번호',
    '품번', '도번', 'item no', 'item_no', '부품번호',
    '연번', '순번', '일련번호', '품목번호',
    'dk입고품번', '입고품번', '관리번호', '제품번호', 'model no',
  ],
  part_name: [
    'part_name', 'part name', '품목명', '품명', '파트명', 'sub품명',
    'item name', 'name', '제품명', '부품명', 'title',
    '명칭', '품목', '아이템', '아이템명', '제품 명칭', '부품 명칭', '파트 명칭',
    '품명칭', '부품명칭', '품목명칭', 'parts name',
  ],
  material: [
    'material', '원소재', '원재료', '재질', '소재명', '소재', '재료',
    '소재정보 소재명', '원자재', 'mat',
    '생산정보 재질',
  ],
  part_weight_g: [
    'part_weight_g', 'weight g', 'weight unit', '중량', '설계중량',
    '단중', 'weight', '무게', '중량 g', '단중 g', '부품중량',
    'net 중량', 'net중량', '순중량',
    '예상 중량 g',        // "예상\n중량(g)" 병합 후 norm
    '예상중량 g',         // "예상중량(g)" → norm → "예상중량 g"
    '예상중량',           // 괄호 없는 변형
    'expected weight g',  // 42dot RFQ: "Expected\r\nWeight (g)"
  ],
  runner_weight_g: [
    'runner_weight_g', 'r/sprue g', 'runner', '런너', 'sprue', 'runner weight',
    '스프루 런너 중량', '스프루런너중량', '런너 중량', '런너중량', '스프루중량',
    '사출정보 s/r 중량',
  ],
  cavity_count: [
    'cavity_count', 'cavity', 'q ty', "q'ty", 'qty', '캐비티', '수량',
    '소요량', 'quantity', '캐비티수', '캐비티 수',
    'quantity per set',  // 42dot: "Quantity per Set"
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
  // ── 제품 벽두께 (C/T 냉각시간 계산용) ─────────────────────────────────────
  // 주의: 제품 높이(height/depth)와 벽두께(thickness)는 다름
  // 높이(예: 142mm)를 두께로 잘못 인식하면 C/T가 300초(최대)로 계산됨
  wall_thickness_mm: [
    'wall_thickness_mm', '기본두께', '두께', '평균두께', '최대두께', '최소두께',
    'thickness', 'wall thickness', '벽두께', '살두께', '기준두께',
  ],
  // ── 제품 사이즈 개별 컬럼 ─────────────────────────────────────────────────
  product_width_mm: [
    'product_width_mm', 'part_width_mm',
    '제품사이즈 가로', '제품사이즈가로', '제품 가로', '제품가로',
    '가로', '가로(mm)', '가로 mm', 'product width', 'part width',
    'size mm 가로',
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
    // 주의: 이 컬럼은 투영면적/금형크기 추정에만 사용, C/T 두께에는 사용 안 함
  ],
  product_size: [
    'product_size', '제품사이즈', '제품 사이즈', '사이즈', '제품크기', '제품 크기',
    '외형사이즈', '외형 사이즈', '외형', '제품치수', '제품 치수', 'product size',
  ],
  cycle_time_sec: [
    'cycle_time_sec', 'c/t', 'c/t sec', 'ct', 'ct sec', 'cycle time',
    '사이클타임', '사이클 타임', 'c/time', '예상 c/time', '예상c/time',
  ],
  is_injection: ['구분 사출'],
  part_type:    ['type', 'part type'],
  mold_type:    ['구 분', '구분'],  // "구 분"(공백 포함)을 앞에 두어 우선 매핑
  remark: [
    'remark', 'remarks', '비고', '특이사항', '메모', 'note', 'notes',
    '참고', '코멘트', 'comment', 'comments',
  ],
  finish: [
    'finish', 'surface finish', '표면처리', '도장', '도장사양',
    '표면사양', 'surface', '마감', '마감처리', 'finishing',
  ],
}

// part_name은 마지막 매칭 컬럼 우선 (last-wins):
// 동일 헤더명이 여러 개일 때(예: "SUB품명" × 2) 마지막 컬럼이 실제 품명인 경우 대응
const LAST_WINS_FIELDS = new Set(['part_name'])

function mapColumn(header: string): string | null {
  const n = norm(header)
  if (!n || n.length < 2) return null
  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      if (n === alias) return field
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

// ── BOM 엑셀 파싱 ─────────────────────────────────────────────────────────────
function parsePartsFromBuffer(arrayBuffer: ArrayBuffer, projectId: string): { parts: object[], sheetName: string, _debug?: object } {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })

  // 가장 적합한 시트 선택 (물량정보·현황 등 제외 + 인식 컬럼 수 기준 우선)
  const skip = ['물량정보', '현황', '생산 계획', '생산계획', 'summary', 'overview']
  let sheetName = workbook.SheetNames[0]
  let bestSheetScore = -1
  for (const name of workbook.SheetNames) {
    if (skip.some(p => name.toLowerCase().includes(p.toLowerCase()))) continue
    const ws = workbook.Sheets[name]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
    let sheetScore = 0
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const s = scoreRow(rows[i])
      if (s > sheetScore) sheetScore = s
    }
    if (sheetScore > bestSheetScore) { bestSheetScore = sheetScore; sheetName = name }
  }
  const sheet = workbook.Sheets[sheetName]
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
  if (rawRows.length === 0) return { parts: [], sheetName }

  // 헤더 행 탐색 (최대 10행)
  let headerIdx = 0, bestScore = 0
  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const s = scoreRow(rawRows[i])
    if (s > bestScore) { bestScore = s; headerIdx = i }
  }

  // ── 폴백 모드: 헤더 인식 실패 시 가장 텍스트가 많은 컬럼을 part_name으로 처리 ──
  let isFallbackMode = false
  if (bestScore === 0) {
    isFallbackMode = true
    // 상위 3행의 셀 수를 비교해 가장 많은 행을 헤더로 간주
    let maxCells = 0
    for (let i = 0; i < Math.min(5, rawRows.length); i++) {
      const filled = rawRows[i].filter(c => c !== '' && c !== null && c !== undefined).length
      if (filled > maxCells) { maxCells = filled; headerIdx = i }
    }
  }

  // ── 서브헤더 감지 (현대 RFQ 등 2줄 헤더 대응) ────────────────────────────
  // 예: 행1 "생산정보 / SIZE(mm)" → 행2 "재질 / 가로 / 세로 / 높이 / C/Time"
  const headerRowFields = getFieldsOfRow(rawRows[headerIdx])
  const nextRowRaw = headerIdx + 1 < rawRows.length ? rawRows[headerIdx + 1] : []
  const nextRowFields = getFieldsOfRow(nextRowRaw)
  const newFieldsInNext = [...nextRowFields].filter(f => !headerRowFields.has(f))
  const isSubHeader = !isFallbackMode && newFieldsInNext.length > 0

  // ── 컬럼 헤더 병합: 부모+자식 결합, 부모가 비어있으면 자식 값 직접 사용 ──
  const headerRow = rawRows[headerIdx].map(c => String(c ?? '').trim())
  const nextRow = nextRowRaw.map(c => String(c ?? '').trim())
  const headers = headerRow.map((curr, i) => {
    const sub = isSubHeader ? (nextRow[i] ?? '') : ''
    if (curr && sub && sub !== curr) return `${curr} ${sub}`
    if (!curr && sub) return sub  // 부모 셀이 병합으로 비어있으면 서브헤더 값 직접 사용
    return curr || `col_${i}`
  })

  // 컬럼 인덱스 맵 구성
  const colMap: Record<string, number> = {}
  for (let i = 0; i < headers.length; i++) {
    const field = mapColumn(headers[i])
    if (field && !(field in colMap)) colMap[field] = i
  }

  // 폴백 모드: 가장 텍스트가 많은 컬럼을 part_name으로 자동 지정
  if (isFallbackMode && !('part_name' in colMap) && !('part_number' in colMap)) {
    const colTextCount: number[] = []
    const dataRows = rawRows.slice(headerIdx + 1)
    for (let ci = 0; ci < headers.length; ci++) {
      const count = dataRows.filter(r => {
        const v = String(r[ci] ?? '').trim()
        return v.length > 0 && isNaN(Number(v))
      }).length
      colTextCount[ci] = count
    }
    const maxIdx = colTextCount.indexOf(Math.max(...colTextCount))
    if (maxIdx >= 0) colMap['part_name'] = maxIdx
  }

  const dataStart = headerIdx + (isSubHeader ? 2 : 1)
  const seenNumbers = new Set<string>()
  let partSeq = 0  // 파트번호 없을 때 순번 부여용 (1, 2, 3...)
  const parts = []

  for (let ri = dataStart; ri < rawRows.length; ri++) {
    const row = rawRows[ri] as unknown[]
    if (row.every(c => c === '' || c === null || c === undefined)) continue

    const get = (f: string) => colMap[f] !== undefined ? row[colMap[f]] : undefined

    // 사출 타입 필터링 (폴백 모드에서는 필터 건너뜀)
    if (!isFallbackMode) {
      let isInjection = true
      if ('is_injection' in colMap) {
        const val = String(get('is_injection') ?? '').trim()
        isInjection = val !== '' && val !== '0'
      } else if ('mold_type' in colMap) {
        const val = String(get('mold_type') ?? '').trim().toUpperCase()
        if (val === '') continue
        // 명확히 비-사출(프레스/다이캐스팅/구매)인 경우만 제외, 그 외(MOLD/알수없음)는 포함
        const isExplicitNonInj = /^(PRESS|STAMP|WELD|BRAC|DIE|CAST|구매|BUY|STP|표준|ASM|ASSY)/.test(val)
        if (isExplicitNonInj) isInjection = false
      } else if ('part_type' in colMap) {
        const val = String(get('part_type') ?? '').trim().toUpperCase()
        if (val === '') { isInjection = false }
        else {
          const isInj    = /^(IJ|INJ|INJECTION|PLT|PLASTIC|사출)/.test(val)
          const isNonInj = /^(ASM|ASSY|MTS|OTS|STP|BUY|구매|조립|금속|표준)/.test(val)
          if (isNonInj && !isInj) isInjection = false
        }
      }
      if (!isInjection) continue
    }

    const partNumber = String(get('part_number') ?? '').trim()
    const partName   = String(get('part_name')   ?? '').trim()
    // part_name/part_number 컬럼이 colMap에 있는데 값이 비어 있으면 스킵
    // 폴백 모드 또는 컬럼 자체가 없는 경우는 순번으로 처리하여 스킵하지 않음
    const hasNameCol = !isFallbackMode && ('part_name' in colMap || 'part_number' in colMap)
    if (hasNameCol && !partNumber && !partName) continue
    if (/^(합계|total|소계|sub.?total)/i.test(partName || partNumber)) continue

    // 중복 방지 (없으면 순번 자동 부여: 1, 2, 3...)
    partSeq++
    let pn = partNumber || String(partSeq)
    if (seenNumbers.has(pn)) {
      let suffix = 2
      while (seenNumbers.has(`${pn}-${suffix}`)) suffix++
      pn = `${pn}-${suffix}`
    }
    seenNumbers.add(pn)

    const matRaw      = String(get('material')        ?? '').trim()
    const partWeight  = Number(get('part_weight_g')   ?? 0) || 0
    const runnerRaw   = Number(get('runner_weight_g') ?? 0)
    const runnerWeight = runnerRaw > 0 ? runnerRaw : partWeight * 0.15
    const cavityRaw   = Number(get('cavity_count')    ?? 1)
    const cavityCount = cavityRaw > 0 && Number.isFinite(cavityRaw) ? Math.round(cavityRaw) : 1

    // 제품 사이즈 파싱
    let productW = 0, productH = 0, productD = 0
    if (colMap.product_size !== undefined) {
      const parsed = parseProductSize(String(row[colMap.product_size] ?? ''))
      if (parsed) { productW = parsed.width; productH = parsed.height; productD = parsed.depth }
    }
    if (!productW && colMap.product_width_mm  !== undefined) productW = Number(row[colMap.product_width_mm])  || 0
    if (!productH && colMap.product_height_mm !== undefined) productH = Number(row[colMap.product_height_mm]) || 0
    if (!productD && colMap.product_depth_mm  !== undefined) productD = Number(row[colMap.product_depth_mm])  || 0

    // 투영면적: 엑셀 값 우선, 없으면 제품 사이즈로 자동 계산
    let projArea = Number(get('projected_area_cm2') ?? 0) || 0
    if (projArea === 0 && productW > 0 && productH > 0) {
      projArea = productDimsToProjectedArea(productW, productH)
    }

    // 금형 크기: 엑셀 값 우선 (슬라이드 여부는 notes 구성 후 적용)
    let moldW = colMap.mold_width_mm  !== undefined ? (Number(row[colMap.mold_width_mm])  || null) : null
    let moldH = colMap.mold_height_mm !== undefined ? (Number(row[colMap.mold_height_mm]) || null) : null
    const moldD = colMap.mold_depth_mm !== undefined ? (Number(row[colMap.mold_depth_mm]) || null) : null

    const ctRaw = colMap.cycle_time_sec !== undefined ? Number(row[colMap.cycle_time_sec]) : NaN
    const cycleTimeSec = !isNaN(ctRaw) && ctRaw > 0 ? Math.round(ctRaw) : null

    // Remark / Finish → notes 필드 구성
    const remarkRaw = colMap.remark !== undefined ? String(row[colMap.remark] ?? '').trim() : ''
    const finishRaw = colMap.finish !== undefined ? String(row[colMap.finish] ?? '').trim() : ''
    // 실제 벽 두께 컬럼(두께/기본두께 등)이 있으면 thickness_mm 저장
    // ※ productD(제품 높이/깊이 치수)는 벽 두께가 아니므로 사용하지 않음
    const wallThickRaw = colMap.wall_thickness_mm !== undefined ? Number(row[colMap.wall_thickness_mm]) || 0 : 0
    const noteParts: string[] = []
    if (wallThickRaw > 0) noteParts.push(`thickness_mm:${wallThickRaw}`)
    if (finishRaw)        noteParts.push(`finish:${finishRaw}`)
    if (remarkRaw)        noteParts.push(remarkRaw)
    const notesValue = noteParts.length > 0 ? noteParts.join(' | ') : null

    // 슬라이드 구조 여부 (Remark에 'Slide' 포함 시)
    const slide = hasSlideCore(notesValue)
    if (moldW === null && productW > 0 && productH > 0) {
      const est = calcMoldSizeFromProduct(productW, productH, cavityCount, slide)
      moldW = est.width; moldH = est.height
    }

    parts.push({
      project_id:         projectId,
      part_number:        pn,
      part_name:          partName || partNumber,
      material:           (matRaw || 'ABS').replace(/[\r\n]+/g, ' ').trim().toUpperCase().slice(0, 50),
      part_weight_g:      partWeight,
      projected_area_cm2: projArea,
      cavity_count:       cavityCount,
      runner_weight_g:    runnerWeight,
      mold_width_mm:      moldW,
      mold_height_mm:     moldH,
      mold_depth_mm:      moldD,
      cycle_time_sec:     cycleTimeSec,
      notes:              notesValue,
    })
  }
  return { parts, sheetName, _debug: { bestScore, headerIdx, isFallbackMode, colMap, dataStart, totalRows: rawRows.length } }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const type = req.nextUrl.searchParams.get('type')
  // file_data(base64)는 목록 조회에서 제외 (성능)
  let query = supabase
    .from('project_files')
    .select('id, project_id, file_type, name, file_size, created_at')
    .eq('project_id', id)
  if (type) query = query.eq('file_type', type)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) {
    console.error('[GET /files] Supabase error:', error.message, error.details, error.hint)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // file_url은 DB에 없으므로 코드에서 생성 (excel은 null, 나머지는 download 엔드포인트)
  const files = (data ?? []).map(f => ({
    ...f,
    file_url: f.file_type !== 'excel' ? `/api/projects/${id}/files/${f.id}/download` : null,
    storage_path: null,
  }))
  return NextResponse.json(files)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const fileType = formData.get('type') as string

    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    if (!fileType) return NextResponse.json({ error: 'file type이 필요합니다.' }, { status: 400 })

    // ── Excel: 파싱 후 parts 테이블에 저장 ─────────────────────────────────
    if (fileType === 'excel') {
      const arrayBuffer = await file.arrayBuffer()
      let parsed: ReturnType<typeof parsePartsFromBuffer>
      try {
        parsed = parsePartsFromBuffer(arrayBuffer, id)
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
        console.error('[POST /files] Excel parse error:', msg)
        return NextResponse.json({ error: `Excel 파일 파싱 실패: ${msg}` }, { status: 400 })
      }
      const { parts, sheetName, _debug } = parsed
      if (parts.length === 0) {
        return NextResponse.json({
          error: '유효한 파트 데이터를 찾을 수 없습니다. 품명(part_name) 또는 파트번호(품번/도번) 컬럼이 포함된 파일인지 확인하세요.',
          _debug
        }, { status: 400 })
      }
      const { data, error } = await supabase.from('parts').insert(parts).select()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await supabase.from('projects').update({ status: 'analyzing' }).eq('id', id)

      await supabase.from('project_files').insert({
        project_id: id, file_type: 'excel',
        name: file.name, file_path: file.name, file_size: file.size,
      })
      return NextResponse.json({ success: true, count: data?.length ?? 0, sheet: sheetName })
    }

    // ── PDF / CAD / STP: base64로 DB에 직접 저장 ──────────────────────────
    // (Supabase Storage 버킷 불필요)
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기가 4MB를 초과합니다.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const { data: fileRecord, error: dbError } = await supabase
      .from('project_files')
      .insert({
        project_id: id,
        file_type: fileType,
        name: file.name,
        file_path: file.name,
        file_size: file.size,
        file_data: base64,
      })
      .select('id, project_id, file_type, name, file_size, created_at')
      .single()

    if (dbError) {
      console.error('[POST /files] Supabase insert error:', dbError.message, dbError.details, dbError.hint)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    // 다운로드 URL은 파일 ID 기반으로 코드에서 생성
    const file_url = `/api/projects/${id}/files/${fileRecord.id}/download`

    return NextResponse.json({ ...fileRecord, file_url }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[POST /files] Unhandled error:', msg)
    return NextResponse.json({ error: `서버 오류: ${msg}` }, { status: 500 })
  }
}
