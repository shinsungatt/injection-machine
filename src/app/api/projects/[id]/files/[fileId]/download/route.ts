import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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

  const { data: file, error } = await supabase
    .from('project_files')
    .select('file_data, name, file_type, file_size')
    .eq('id', fileId)
    .eq('project_id', id)
    .single()

  if (error || !file?.file_data) {
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
