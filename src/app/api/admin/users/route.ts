import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// 현재 사용자가 관리자인지 확인
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' || profile?.status !== 'approved') return null
  return user
}

// GET /api/admin/users — 전체 사용자 목록
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const supabaseAdmin = createAdminClient()
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, display_name, role, status, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// PATCH /api/admin/users — 사용자 승인 또는 역할 변경
export async function PATCH(request: Request) {
  const admin = await requireAdmin()
  if (!admin) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const body = await request.json()
  const { id, role, status } = body

  if (!id) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  // 자기 자신 역할 변경 방지
  if (id === admin.id && role !== undefined) {
    return NextResponse.json({ error: '자신의 역할은 변경할 수 없습니다.' }, { status: 400 })
  }

  const updates: Record<string, string> = {}
  if (role && ['admin', 'user'].includes(role)) updates.role = role
  if (status && ['pending', 'approved'].includes(status)) updates.status = status

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '변경할 항목이 없습니다.' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
