import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import * as XLSX from 'xlsx'

// "715*715" 또는 "470X420" → [715, 715]
function parseDimension(val: unknown): [number, number] {
  if (!val) return [0, 0]
  const str = String(val).replace(/\s/g, '')
  const match = str.match(/^(\d+(?:\.\d+)?)[*xX×](\d+(?:\.\d+)?)$/)
  if (match) return [parseFloat(match[1]), parseFloat(match[2])]
  const n = parseFloat(str)
  return [isNaN(n) ? 0 : n, isNaN(n) ? 0 : n]
}

// "150C" → 150, "900" → 900
function parseNum(val: unknown): number {
  if (val == null) return 0
  const n = parseFloat(String(val).replace(/[^\d.]/g, ''))
  return isNaN(n) ? 0 : n
}

// "1호기 LS엠트론 LGE 330Ⅱ" → "LS엠트론"
function parseManufacturer(name: string): string {
  const match = name.match(/호기\s+([^\s]+)/)
  return match ? match[1] : ''
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  // 모든 행을 raw 배열로 읽기
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

  // 헤더 행 자동 감지: "name" 또는 "clamping_force_ton" 포함된 행 찾기
  let headerRowIdx = -1
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i] as unknown[]
    const rowStr = row.map(c => String(c ?? '')).join('|').toLowerCase()
    if (rowStr.includes('name') || rowStr.includes('clamping_force_ton') || rowStr.includes('설비명') || rowStr.includes('형체력')) {
      headerRowIdx = i
      break
    }
  }

  if (headerRowIdx === -1) {
    return NextResponse.json({ error: '헤더 행을 찾을 수 없습니다. "name" 또는 "clamping_force_ton" 컬럼이 있어야 합니다.' }, { status: 400 })
  }

  const headers = (allRows[headerRowIdx] as unknown[]).map(h => String(h ?? '').trim().replace(/[\r\n]/g, ' '))
  const dataRows = allRows.slice(headerRowIdx + 1) as unknown[][]

  // 헤더 인덱스 찾기
  const idx = (candidates: string[]): number => {
    for (const c of candidates) {
      const found = headers.findIndex(h =>
        h.toLowerCase().replace(/[\s\r\n_]/g, '') === c.toLowerCase().replace(/[\s\r\n_]/g, '')
        || h.includes(c)
      )
      if (found !== -1) return found
    }
    return -1
  }

  const col = {
    name:         idx(['name', '설비명']),
    clamping:     idx(['clamping_force_ton', '형체력']),
    shot:         idx(['shot_weight_max_g', '사출용량']),
    screw:        idx(['screw_diameter_mm', '스크류']),
    tiebar:       idx(['tie_bar_y_mm', 'tie_bar_x_mm', '타이바']),
    platen:       idx(['platen_width_mm', '형판']),
    pressure:     idx(['injection_pressure_max_mpa', '사출압력']),
    daylight:     idx(['daylight_max_mm', '형체행정거리', '데이라이트']),
    notes:        idx(['사양', 'notes', '비고']),
  }

  const machines = dataRows
    .filter(row => row && row.length > 0 && row.some(c => c != null && String(c).trim() !== ''))
    .map(row => {
      const get = (i: number) => (i >= 0 ? row[i] : undefined)

      const name = String(get(col.name) ?? '').trim()
      if (!name) return null

      const clampingRaw = get(col.clamping)
      const clamping = parseNum(clampingRaw)
      if (clamping <= 0) return null

      const shotRaw = get(col.shot)
      const shot = parseNum(shotRaw)
      if (shot <= 0) return null

      const [tieX, tieY] = parseDimension(get(col.tiebar))
      const [platenW, platenH] = parseDimension(get(col.platen))

      return {
        name,
        manufacturer: parseManufacturer(name),
        clamping_force_ton: clamping,
        shot_weight_max_g: shot,
        injection_pressure_max_mpa: parseNum(get(col.pressure)),
        platen_width_mm: platenW,
        platen_height_mm: platenH,
        tie_bar_x_mm: tieX,
        tie_bar_y_mm: tieY,
        daylight_max_mm: parseNum(get(col.daylight)),
        screw_diameter_mm: parseNum(get(col.screw)),
        notes: col.notes >= 0 && get(col.notes) ? String(get(col.notes)) : null,
        is_active: true,
      }
    })
    .filter(Boolean)

  if (machines.length === 0) {
    return NextResponse.json({ error: '유효한 설비 데이터가 없습니다.' }, { status: 400 })
  }

  const { data, error } = await supabase.from('machines').insert(machines as object[]).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, count: data?.length ?? 0 })
}
