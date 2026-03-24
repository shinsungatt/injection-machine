import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// 서버 사이드 로그아웃: HttpOnly 쿠키를 서버에서 직접 제거
export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const { origin } = new URL(request.url)
  // 303 See Other: POST 후 GET으로 변환하여 리다이렉트 (307은 POST 메서드 유지로 오류 발생)
  return NextResponse.redirect(`${origin}/auth/login`, { status: 303 })
}
