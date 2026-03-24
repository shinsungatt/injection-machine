import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { storagePath, fileName, fileType, fileSize } = await req.json()
  if (!storagePath || !fileName || !fileType) {
    return NextResponse.json({ error: 'storagePath, fileName, fileType 필수' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('project_files')
    .insert({
      project_id:   id,
      file_type:    fileType,
      name:         fileName,
      file_path:    fileName,
      storage_path: storagePath,
      file_size:    fileSize ?? null,
    })
    .select('id, project_id, file_type, name, file_size, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    { ...data, file_url: `/api/projects/${id}/files/${data.id}/download`, storage_path: storagePath },
    { status: 201 }
  )
}
