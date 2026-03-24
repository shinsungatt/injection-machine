import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

const PROMPT = `이 도면(PDF)에서 사출성형 부품 정보를 추출해 JSON으로만 응답하세요.

추출 항목:
- part_number: 도번 / 품번 (문자열, 없으면 null)
- part_name: 품명 / 제품명 (문자열, 없으면 null)
- material: 재질 / 소재 예) "ABS", "PC+ABS", "PP-GF30" (없으면 null)
- width_mm: 가로 최대 치수 mm (숫자, 없으면 null)
- height_mm: 세로 최대 치수 mm (숫자, 없으면 null)
- depth_mm: 높이/두께 치수 mm (숫자, 없으면 null)
- projected_area_cm2: 투영면적 cm² (숫자, 없으면 null — 있으면 가로×세로/100 으로 계산)
- part_weight_g: 중량 g (숫자, 없으면 null)
- cavity_count: 캐비티 수 (정수, 없으면 1)
- finish: 표면처리 / 도장사양 (문자열, 없으면 null)
- notes: 특이사항 슬라이드구조/언더컷/공차 등 (문자열, 없으면 null)

도면 표제란(title block), 치수선, BOM 테이블을 우선 참조하세요.
반드시 JSON만 응답하고 다른 텍스트는 포함하지 마세요.`

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 })
  }

  // ── 파일 정보 조회 ────────────────────────────────────────────────────────
  const { data: file, error: dbErr } = await supabase
    .from('project_files')
    .select('file_data, storage_path, name, file_type')
    .eq('id', fileId)
    .eq('project_id', id)
    .single()

  if (dbErr || !file) {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 })
  }

  if (file.file_type !== 'pdf') {
    return NextResponse.json({ error: 'PDF 파일만 AI 분석이 가능합니다.' }, { status: 400 })
  }

  // ── PDF base64 획득 ───────────────────────────────────────────────────────
  let pdfBase64: string

  if (file.storage_path) {
    // Supabase Storage에서 다운로드
    const admin = createAdminClient()
    const { data: blob, error: dlErr } = await admin.storage
      .from('drawings')
      .download(file.storage_path as string)
    if (dlErr || !blob) {
      return NextResponse.json({ error: `파일 다운로드 실패: ${dlErr?.message}` }, { status: 500 })
    }
    pdfBase64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
  } else if (file.file_data) {
    // DB에 base64로 저장된 경우
    pdfBase64 = file.file_data as string
  } else {
    return NextResponse.json({ error: '파일 데이터가 없습니다.' }, { status: 404 })
  }

  // ── Claude Vision 분석 ────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: pdfBase64,
          },
        } as Parameters<typeof client.messages.create>[0]['messages'][0]['content'][0],
        {
          type: 'text',
          text: PROMPT,
        },
      ],
    }],
  })

  const rawText = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  // JSON 파싱 (마크다운 코드블록 제거)
  const jsonStr = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  let extracted: Record<string, unknown>
  try {
    extracted = JSON.parse(jsonStr)
  } catch {
    return NextResponse.json({ error: `JSON 파싱 실패: ${rawText.slice(0, 200)}` }, { status: 500 })
  }

  // projected_area_cm2 자동 계산 (없을 때)
  if (!extracted.projected_area_cm2 && extracted.width_mm && extracted.height_mm) {
    extracted.projected_area_cm2 =
      Math.round(((extracted.width_mm as number) * (extracted.height_mm as number)) / 100 * 100) / 100
  }

  // notes에 finish 포함
  const finishNote = extracted.finish ? `finish:${extracted.finish}` : null
  const combinedNotes = [finishNote, extracted.notes].filter(Boolean).join(' | ') || null

  return NextResponse.json({
    part_number:        extracted.part_number   ?? null,
    part_name:          extracted.part_name     ?? null,
    material:           extracted.material      ?? null,
    part_weight_g:      extracted.part_weight_g ?? 0,
    projected_area_cm2: extracted.projected_area_cm2 ?? 0,
    cavity_count:       extracted.cavity_count  ?? 1,
    width_mm:           extracted.width_mm      ?? null,
    height_mm:          extracted.height_mm     ?? null,
    depth_mm:           extracted.depth_mm      ?? null,
    notes:              combinedNotes,
    _fileName:          file.name,
    _tokensUsed:        message.usage.input_tokens + message.usage.output_tokens,
  })
}
