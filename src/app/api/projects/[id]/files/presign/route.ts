import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { fileName, fileType } = await req.json()
  if (!fileName || !fileType) {
    return NextResponse.json({ error: 'fileName, fileType 필수' }, { status: 400 })
  }

  const ext = fileName.split('.').pop() ?? 'bin'
  const storagePath = `${id}/${crypto.randomUUID()}.${ext}`

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from('drawings')
    .createSignedUploadUrl(storagePath)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ uploadUrl: data.signedUrl, storagePath })
}
