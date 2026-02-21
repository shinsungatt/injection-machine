import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params

  const { data: file, error: fetchError } = await supabase
    .from('project_files')
    .select('*')
    .eq('id', fileId)
    .eq('project_id', id)
    .single()

  if (fetchError || !file) {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 })
  }

  // Storage에서 실제 파일 삭제
  if (file.storage_path) {
    await supabase.storage.from('project-files').remove([file.storage_path])
  }

  const { error } = await supabase
    .from('project_files')
    .delete()
    .eq('id', fileId)
    .eq('project_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
