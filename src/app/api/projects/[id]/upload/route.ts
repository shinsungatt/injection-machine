import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

  if (rows.length === 0) {
    return NextResponse.json({ error: '데이터가 없습니다.' }, { status: 400 })
  }

  // 컬럼 정규화 (대소문자, 공백 처리)
  const normalize = (key: string) => key.toLowerCase().replace(/\s/g, '_')

  const parts = rows.map(row => {
    const normalized: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row)) {
      normalized[normalize(k)] = v
    }

    const partWeight = Number(normalized.part_weight_g ?? 0)
    const runnerWeight = normalized.runner_weight_g
      ? Number(normalized.runner_weight_g)
      : partWeight * 0.15

    return {
      project_id: id,
      part_number: String(normalized.part_number ?? ''),
      part_name: String(normalized.part_name ?? ''),
      material: String(normalized.material ?? 'ABS').toUpperCase(),
      part_weight_g: partWeight,
      projected_area_cm2: Number(normalized.projected_area_cm2 ?? 0),
      cavity_count: Number(normalized.cavity_count ?? 1),
      runner_weight_g: runnerWeight,
      mold_width_mm: normalized.mold_width_mm ? Number(normalized.mold_width_mm) : null,
      mold_height_mm: normalized.mold_height_mm ? Number(normalized.mold_height_mm) : null,
      mold_depth_mm: normalized.mold_depth_mm ? Number(normalized.mold_depth_mm) : null,
    }
  }).filter(p => p.part_number && p.part_name && p.projected_area_cm2 > 0)

  if (parts.length === 0) {
    return NextResponse.json({ error: '유효한 파트 데이터가 없습니다. 컬럼명을 확인하세요.' }, { status: 400 })
  }

  const { data, error } = await supabase.from('parts').insert(parts).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 프로젝트 상태 업데이트
  await supabase.from('projects').update({ status: 'analyzing' }).eq('id', id)

  return NextResponse.json({ success: true, count: data?.length ?? 0 })
}
