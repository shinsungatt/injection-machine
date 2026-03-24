import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

const CONTENT_TYPES: Record<string, string> = {
  pdf:   'application/pdf',
  cad:   'application/octet-stream',
  stp:   'model/step',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: file, error } = await supabase
    .from('project_files')
    .select('file_data, file_path, storage_path, name, file_type')
    .eq('id', fileId)
    .eq('project_id', id)
    .single()

  if (error || !file) {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 })
  }

  // ── Supabase Storage 파일 (storage_path 있음) ──────────────────────────
  if (file.storage_path) {
    const admin = createAdminClient()
    const { data: urlData, error: urlError } = await admin.storage
      .from('drawings')
      .createSignedUrl(file.storage_path as string, 3600)

    if (urlError) return NextResponse.json({ error: urlError.message }, { status: 500 })
    return NextResponse.redirect(urlData.signedUrl)
  }

  // ── 기존 base64 방식 (file_data 있음) ─────────────────────────────────
  if (!file.file_data) {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 })
  }

  const buffer = Buffer.from(file.file_data as string, 'base64')
  const contentType = CONTENT_TYPES[file.file_type as string] ?? 'application/octet-stream'
  const encodedName = encodeURIComponent(file.name as string)

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodedName}`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
