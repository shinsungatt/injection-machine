import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

// 헤더 자동 감지 후 파트 파싱
function parsePartsFromBuffer(arrayBuffer: ArrayBuffer, projectId: string) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

  // 헤더 자동 감지
  let headerRowIdx = -1
  const headerKeywords = ['part_number', 'part_name', 'material', '파트번호', '파트명', '품번', '품명', '재질', '재료']
  for (let i = 0; i < Math.min(allRows.length, 10); i++) {
    const rowStr = (allRows[i] as unknown[]).map(c => String(c ?? '')).join('|').toLowerCase()
    if (headerKeywords.some(k => rowStr.includes(k.toLowerCase()))) {
      headerRowIdx = i
      break
    }
  }

  if (headerRowIdx === -1) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
    return parseMapped(rows, projectId)
  }

  const headers = (allRows[headerRowIdx] as unknown[]).map(h =>
    String(h ?? '').trim().replace(/[\r\n\s]+/g, '_').toLowerCase()
  )
  const dataRows = allRows.slice(headerRowIdx + 1) as unknown[][]

  const idx = (...candidates: string[]) => {
    for (const c of candidates) {
      const i = headers.findIndex(h => h.includes(c.toLowerCase()) || c.toLowerCase().includes(h.replace(/_/g, '')))
      if (i !== -1) return i
    }
    return -1
  }

  const col = {
    part_number:        idx('part_number', '파트번호', '품번', 'partno', 'part_no'),
    part_name:          idx('part_name', '파트명', '품명', 'name'),
    material:           idx('material', '재료', '재질', 'mat'),
    part_weight_g:      idx('part_weight_g', '파트중량', '중량', 'weight'),
    projected_area_cm2: idx('projected_area_cm2', '투영면적', '면적', 'area'),
    cavity_count:       idx('cavity_count', '캐비티', 'cavity', '수'),
    runner_weight_g:    idx('runner_weight_g', '런너중량', '런너', 'runner'),
    mold_width_mm:      idx('mold_width_mm', '금형너비', '금형폭', 'mold_width'),
    mold_height_mm:     idx('mold_height_mm', '금형높이', 'mold_height'),
    mold_depth_mm:      idx('mold_depth_mm', '금형두께', 'mold_depth'),
    cycle_time:         idx('c/t', 'cycle_time', '사이클', 'ct(sec', 'c_t'),
  }

  const parts = dataRows
    .filter(row => row && row.some(c => c != null && String(c).trim() !== ''))
    .map(row => {
      const g = (i: number) => (i >= 0 ? row[i] : undefined)
      const partNumber = String(g(col.part_number) ?? '').trim()
      if (!partNumber) return null  // part_number만 필수

      const partName = String(g(col.part_name) ?? '').trim() || partNumber  // 없으면 파트번호 대용
      const partWeight = parseFloat(String(g(col.part_weight_g) ?? '0')) || 0
      const area = parseFloat(String(g(col.projected_area_cm2) ?? '0')) || 0
      const runnerRaw = g(col.runner_weight_g)
      const ctRaw = g(col.cycle_time)

      return {
        project_id: projectId,
        part_number: partNumber,
        part_name: partName,
        material: String(g(col.material) ?? 'ABS').toUpperCase().trim() || 'ABS',
        part_weight_g: partWeight,
        projected_area_cm2: area,
        cavity_count: parseInt(String(g(col.cavity_count) ?? '1')) || 1,
        runner_weight_g: runnerRaw ? parseFloat(String(runnerRaw)) || partWeight * 0.15 : partWeight * 0.15,
        mold_width_mm:  g(col.mold_width_mm)  ? parseFloat(String(g(col.mold_width_mm)))  || null : null,
        mold_height_mm: g(col.mold_height_mm) ? parseFloat(String(g(col.mold_height_mm))) || null : null,
        mold_depth_mm:  g(col.mold_depth_mm)  ? parseFloat(String(g(col.mold_depth_mm)))  || null : null,
        cycle_time_sec: ctRaw ? parseInt(String(ctRaw)) || null : null,
      }
    })
    .filter(Boolean)

  return parts as ReturnType<typeof parseMapped>
}

function parseMapped(rows: Record<string, unknown>[], projectId: string) {
  const normalize = (key: string) => key.toLowerCase().replace(/\s/g, '_')
  return rows.map(row => {
    const n: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row)) n[normalize(k)] = v
    const partWeight = Number(n.part_weight_g ?? 0)
    const ctRaw = n['cycle_time_sec'] ?? n['c/t(sec)'] ?? n['c/t'] ?? n['cycle_time'] ?? null
    return {
      project_id: projectId,
      part_number: String(n.part_number ?? ''),
      part_name: String(n.part_name ?? n.part_number ?? ''),
      material: String(n.material ?? 'ABS').toUpperCase(),
      part_weight_g: partWeight,
      projected_area_cm2: Number(n.projected_area_cm2 ?? 0),
      cavity_count: Number(n.cavity_count ?? 1),
      runner_weight_g: n.runner_weight_g ? Number(n.runner_weight_g) : partWeight * 0.15,
      mold_width_mm:  n.mold_width_mm  ? Number(n.mold_width_mm)  : null,
      mold_height_mm: n.mold_height_mm ? Number(n.mold_height_mm) : null,
      mold_depth_mm:  n.mold_depth_mm  ? Number(n.mold_depth_mm)  : null,
      cycle_time_sec: ctRaw ? parseInt(String(ctRaw)) || null : null,
    }
  }).filter(p => p.part_number)  // part_number만 필수
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
  const formData = await req.formData()
  const file = formData.get('file') as File
  const fileType = formData.get('type') as string

  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
  if (!fileType) return NextResponse.json({ error: 'file type이 필요합니다.' }, { status: 400 })

  // ── Excel: 파싱 후 parts 테이블에 저장 ─────────────────────────────────
  if (fileType === 'excel') {
    const arrayBuffer = await file.arrayBuffer()
    const parts = parsePartsFromBuffer(arrayBuffer, id)
    if (parts.length === 0) {
      return NextResponse.json({
        error: '유효한 파트 데이터를 찾을 수 없습니다.\n최소 part_number 컬럼이 필요합니다.'
      }, { status: 400 })
    }
    const { data, error } = await supabase.from('parts').insert(parts).select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from('projects').update({ status: 'analyzing' }).eq('id', id)

    await supabase.from('project_files').insert({
      project_id: id, file_type: 'excel',
      name: file.name, file_path: file.name, file_size: file.size,
    })
    return NextResponse.json({ success: true, count: data?.length ?? 0 })
  }

  // ── PDF / CAD / STP: base64로 DB에 직접 저장 ──────────────────────────
  // (Supabase Storage 버킷 불필요)
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: '파일 크기가 20MB를 초과합니다.' }, { status: 400 })
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
}
