import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { calculateRecommendations } from '@/lib/algorithm'
import type { Part, Machine } from '@/lib/supabase'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 파트 목록 조회
  const { data: parts, error: partsError } = await supabase
    .from('parts')
    .select('*')
    .eq('project_id', id)

  if (partsError) return NextResponse.json({ error: partsError.message }, { status: 500 })
  if (!parts || parts.length === 0) {
    return NextResponse.json({ error: '파트가 없습니다.' }, { status: 400 })
  }

  // 활성 설비 목록 조회
  const { data: machines, error: machinesError } = await supabase
    .from('machines')
    .select('*')
    .eq('is_active', true)
    .order('clamping_force_ton', { ascending: true })

  if (machinesError) return NextResponse.json({ error: machinesError.message }, { status: 500 })
  if (!machines || machines.length === 0) {
    return NextResponse.json({ error: '등록된 설비가 없습니다.' }, { status: 400 })
  }

  // 기존 추천 결과 삭제
  const partIds = parts.map((p: Part) => p.id)
  await supabase.from('recommendations').delete().in('part_id', partIds)

  // 각 파트에 대한 추천 계산 및 저장
  const allInserts = []
  const allResults: Record<string, ReturnType<typeof calculateRecommendations>> = {}

  for (const part of parts as Part[]) {
    const results = calculateRecommendations(part, machines as Machine[])
    allResults[part.id] = results

    // 추천 설비 저장 (최대 3순위)
    const toInsert = results
      .filter(r => r.isRecommended)
      .slice(0, 3)
      .map(r => ({
        part_id: part.id,
        machine_id: r.machine.id,
        required_clamping_force_ton: r.requiredClampingForceTon,
        required_shot_weight_g: r.requiredShotWeightG,
        utilization_clamping_pct: r.utilizationClampingPct,
        utilization_shot_pct: r.utilizationShotPct,
        is_recommended: r.isRecommended,
        rank: r.rank,
        notes: r.notes || null,
      }))

    allInserts.push(...toInsert)
  }

  if (allInserts.length > 0) {
    const { error: insertError } = await supabase.from('recommendations').insert(allInserts)
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // 프로젝트 상태 업데이트
  await supabase
    .from('projects')
    .update({ status: 'completed' })
    .eq('id', id)

  return NextResponse.json({ success: true, partsCount: parts.length })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: parts, error: partsError } = await supabase
    .from('parts')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: true })

  if (partsError) return NextResponse.json({ error: partsError.message }, { status: 500 })
  if (!parts) return NextResponse.json([])

  // 각 파트의 추천 결과 조회
  const partIds = parts.map((p: Part) => p.id)
  const { data: recommendations, error: recError } = await supabase
    .from('recommendations')
    .select('*, machine:machines(*)')
    .in('part_id', partIds)
    .order('rank', { ascending: true })

  if (recError) return NextResponse.json({ error: recError.message }, { status: 500 })

  // 파트별로 그룹화
  const result = (parts as Part[]).map(part => ({
    part,
    recommendations: (recommendations || []).filter(r => r.part_id === part.id),
  }))

  return NextResponse.json(result)
}
