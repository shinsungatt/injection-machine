import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('parts')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// 일괄 삭제: DELETE body { ids: string[] }
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids : []
  if (ids.length === 0) return NextResponse.json({ error: '삭제할 파트 ID가 없습니다.' }, { status: 400 })

  const { error } = await supabase
    .from('parts')
    .delete()
    .in('id', ids)
    .eq('project_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, deleted: ids.length })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // runner_weight_g 기본값: 파트중량 × 0.15
  if (!body.runner_weight_g && body.part_weight_g) {
    body.runner_weight_g = body.part_weight_g * 0.15
  }

  const { data, error } = await supabase
    .from('parts')
    .insert({ ...body, project_id: id })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
