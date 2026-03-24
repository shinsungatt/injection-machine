import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/auth/login', '/auth/signup', '/auth/callback', '/auth/pending']
const ADMIN_PATHS = ['/admin']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 세션 갱신 (항상 호출)
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // API 라우트는 자체 인증 처리 (리다이렉트 없이 통과)
  if (path.startsWith('/api/')) return response

  const isPublicPath = PUBLIC_PATHS.some(p => path.startsWith(p))
  const isPublicAsset =
    path.startsWith('/_next') ||
    path.startsWith('/favicon') ||
    path === '/manual.html'

  // 비인증 사용자 → 보호된 경로 접근 시 로그인으로
  if (!user && !isPublicPath && !isPublicAsset) {
    const loginUrl = new URL('/auth/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // 인증 사용자 → profile 조회 (승인 여부 + 역할 확인)
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .single()

    // profile이 없으면 라우팅 보호 건너뜀 (API 라우트에서 개별 처리)
    if (profile) {
      // 미승인 사용자 → 대기 페이지로 (admin은 status 무관하게 통과)
      if (profile.role !== 'admin' && profile.status !== 'approved' && path !== '/auth/pending') {
        return NextResponse.redirect(new URL('/auth/pending', request.url))
      }

      // 승인된 사용자(또는 admin) → 로그인/회원가입/대기 페이지 접근 시 홈으로
      if ((profile.status === 'approved' || profile.role === 'admin') && isPublicPath) {
        return NextResponse.redirect(new URL('/', request.url))
      }

      // 관리자 전용 경로 → 관리자 아니면 홈으로
      if (ADMIN_PATHS.some(p => path.startsWith(p)) && profile.role !== 'admin') {
        return NextResponse.redirect(new URL('/', request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
