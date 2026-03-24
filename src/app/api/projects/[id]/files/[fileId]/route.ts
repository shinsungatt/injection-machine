import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: file, error: fetchError } = await supabase
    .from('project_files')
    .select('storage_path')
    .eq('id', fileId)
    .eq('project_id', id)
    .single()

  if (fetchError || !file) {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 })
  }

  // Supabase Storage에서 실제 파일 삭제
  if (file.storage_path) {
    const admin = createAdminClient()
    await admin.storage.from('drawings').remove([file.storage_path as string])
  }

  const { error } = await supabase
    .from('project_files')
    .delete()
    .eq('id', fileId)
    .eq('project_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
