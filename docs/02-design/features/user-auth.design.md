# Design: user-auth (사용자 인증 + 권한 관리)

> **Feature**: user-auth
> **작성일**: 2026-02-26
> **상태**: Design Phase
> **참조 Plan**: docs/01-plan/features/user-auth.plan.md

---

## 1. 아키텍처 개요

### 1.1 인증 흐름

```
[사용자] → /auth/login 또는 /auth/signup
              ↓
         [Supabase Auth] → JWT 토큰 발급
              ↓
         [Next.js Middleware] → 쿠키 검증 → 보호된 페이지 접근 허용
              ↓
         [Server Component / API Route]
              ↓
         [Supabase RLS] → user_id 기반 데이터 필터링
```

### 1.2 Supabase 클라이언트 분리 전략

`@supabase/ssr` 패키지를 사용하여 환경별로 클라이언트를 분리:

| 환경 | 함수 | 용도 |
|------|------|------|
| Browser (Client Component) | `createBrowserClient()` | 클라이언트 사이드 인증 |
| Server (API Route, Server Component) | `createServerClient()` | 서버 사이드 데이터 조회 |
| Middleware | `createServerClient()` | 세션 검증 및 갱신 |

---

## 2. 파일 구조

### 2.1 신규 파일

```
src/
├── middleware.ts                          # 페이지 보호 미들웨어 (신규)
├── lib/
│   ├── supabase.ts                        # 기존 → 서버용으로 유지
│   ├── supabase-browser.ts                # 신규: 브라우저 클라이언트
│   └── supabase-server.ts                 # 신규: 서버 클라이언트 (쿠키 기반)
├── app/
│   └── auth/
│       ├── login/
│       │   └── page.tsx                   # 로그인 페이지 (신규)
│       ├── signup/
│       │   └── page.tsx                   # 회원가입 페이지 (신규)
│       └── callback/
│           └── route.ts                   # Auth 콜백 핸들러 (신규)
└── components/
    ├── Navbar.tsx                         # 기존 → 사용자 정보 표시 추가
    └── AuthProvider.tsx                   # 신규: 인증 컨텍스트
```

### 2.2 수정 파일

```
src/
├── app/
│   ├── layout.tsx                         # AuthProvider 래핑 추가
│   └── api/
│       ├── projects/route.ts              # user_id 필터링 추가
│       ├── projects/[id]/route.ts         # 소유권 검증 추가
│       ├── projects/[id]/parts/route.ts   # 소유권 검증 추가
│       └── machines/route.ts              # 인증 검사 추가 (읽기만 허용)
supabase/
└── schema.sql                             # RLS 정책 추가
```

---

## 3. 상세 설계

### 3.1 `src/lib/supabase-browser.ts` (신규)

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### 3.2 `src/lib/supabase-server.ts` (신규)

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

### 3.3 `src/middleware.ts` (신규)

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/auth/login', '/auth/signup', '/auth/callback']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // 세션 갱신 (항상 호출해야 함)
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublicPath = PUBLIC_PATHS.some(p => path.startsWith(p))
  const isPublicAsset = path.startsWith('/manual.html') || path.startsWith('/_next') || path.startsWith('/favicon')

  // 비인증 사용자가 보호된 경로 접근 시 → 로그인으로 리다이렉트
  if (!user && !isPublicPath && !isPublicAsset) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // 인증 사용자가 로그인/회원가입 접근 시 → 홈으로 리다이렉트
  if (user && isPublicPath) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

### 3.4 `src/components/AuthProvider.tsx` (신규)

```typescript
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-browser'

type AuthContextType = {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // 초기 세션 확인
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    // 인증 상태 변경 구독
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_, session) => setUser(session?.user ?? null)
    )

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
```

### 3.5 로그인 페이지: `src/app/auth/login/page.tsx` (신규)

**UI 구성:**
- 중앙 정렬 카드 레이아웃
- 이메일 입력 필드
- 비밀번호 입력 필드 (show/hide 토글)
- "로그인" 버튼
- "회원가입" 링크
- 에러 메시지 표시

**처리 로직:**
```typescript
const supabase = createClient() // browser client
const { error } = await supabase.auth.signInWithPassword({ email, password })
if (error) → toast.error(error.message)
else → router.push('/')  // 미들웨어가 세션 처리
```

### 3.6 회원가입 페이지: `src/app/auth/signup/page.tsx` (신규)

**UI 구성:**
- 표시명(이름) 입력 필드
- 이메일 입력 필드
- 비밀번호 입력 필드 (최소 8자)
- 비밀번호 확인 필드
- "회원가입" 버튼
- "로그인" 링크

**처리 로직:**
```typescript
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: { data: { display_name: name } }
})
// profiles 테이블은 DB 트리거로 자동 생성
if (!error) → router.push('/') 또는 이메일 확인 안내
```

### 3.7 Auth 콜백: `src/app/auth/callback/route.ts` (신규)

```typescript
import { createClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}/`)
}
```

### 3.8 `src/components/Navbar.tsx` 변경사항

**추가 요소:**
- `useAuth()` 훅으로 user 정보 가져오기
- 우측에 사용자 이름 + 로그아웃 버튼 표시
- 로딩 중에는 스켈레톤 표시

```
기존: [로고] [대시보드] [설비관리] [프로젝트] [사용설명서]
변경: [로고] [대시보드] [설비관리] [프로젝트] [사용설명서] | [👤 이름] [로그아웃]
```

### 3.9 API Route 인증 패턴

모든 API Route에서 아래 패턴 적용:

```typescript
import { createClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // user.id 기반으로 RLS가 자동 필터링
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })
  // → RLS 정책에 의해 자동으로 auth.uid() = user_id 조건 적용
}
```

---

## 4. 데이터베이스 설계

### 4.1 profiles 테이블 (신규)

```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 자동 프로필 생성 트리거
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### 4.2 projects 테이블 변경

```sql
ALTER TABLE projects ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- 기존 데이터 처리: 첫 번째 admin 계정으로 할당 (마이그레이션 시 수동 실행)
-- UPDATE projects SET user_id = '[admin-uuid]' WHERE user_id IS NULL;
```

### 4.3 RLS 정책

```sql
-- RLS 활성화
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;

-- profiles: 본인만 접근
CREATE POLICY "profiles_self" ON profiles
  FOR ALL USING (auth.uid() = id);

-- machines: 모든 인증 사용자 읽기, admin만 수정
CREATE POLICY "machines_read" ON machines
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "machines_write" ON machines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- projects: 본인 소유 데이터만
CREATE POLICY "projects_owner" ON projects
  FOR ALL USING (auth.uid() = user_id);

-- parts: 프로젝트 소유자만
CREATE POLICY "parts_owner" ON parts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE id = parts.project_id AND user_id = auth.uid())
  );

-- recommendations: 파트 소유자만
CREATE POLICY "recommendations_owner" ON recommendations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM parts p
      JOIN projects pr ON p.project_id = pr.id
      WHERE p.id = recommendations.part_id AND pr.user_id = auth.uid()
    )
  );
```

---

## 5. TypeScript 타입 정의

### 5.1 `src/lib/supabase.ts` 추가 타입

```typescript
export type Profile = {
  id: string
  email: string
  display_name: string | null
  role: 'admin' | 'user'
  created_at: string
}

// Project 타입에 user_id 추가
export type Project = {
  id: string
  name: string
  model_name: string
  description: string | null
  status: 'draft' | 'analyzing' | 'completed'
  user_id: string          // 신규 추가
  created_at: string
  updated_at: string
}
```

---

## 6. 설치 패키지

```bash
npm install @supabase/ssr
```

> `@supabase/supabase-js`는 이미 설치됨. `@supabase/ssr`만 추가하면 됨.

---

## 7. 구현 순서 (Do Phase 체크리스트)

### Phase 1: 인프라 설정
- [ ] `npm install @supabase/ssr`
- [ ] Supabase 대시보드에서 Auth 이메일 확인 설정 (개발용: 끄기 권장)
- [ ] `supabase/schema.sql`에 profiles 테이블, 트리거, RLS 정책 추가
- [ ] Supabase SQL Editor에서 스키마 실행
- [ ] `projects` 테이블에 `user_id` 컬럼 추가

### Phase 2: 클라이언트 분리
- [ ] `src/lib/supabase-browser.ts` 생성
- [ ] `src/lib/supabase-server.ts` 생성
- [ ] `src/middleware.ts` 생성

### Phase 3: 인증 컨텍스트
- [ ] `src/components/AuthProvider.tsx` 생성
- [ ] `src/app/layout.tsx`에 `<AuthProvider>` 래핑

### Phase 4: 인증 페이지
- [ ] `src/app/auth/login/page.tsx` 구현
- [ ] `src/app/auth/signup/page.tsx` 구현
- [ ] `src/app/auth/callback/route.ts` 구현

### Phase 5: Navbar 업데이트
- [ ] `src/components/Navbar.tsx`에 사용자 정보 + 로그아웃 버튼 추가

### Phase 6: API Routes 업데이트
- [ ] `src/app/api/projects/route.ts`: 인증 검사 + user_id 삽입
- [ ] `src/app/api/projects/[id]/route.ts`: 소유권 검증
- [ ] `src/app/api/projects/[id]/parts/route.ts`: 소유권 검증
- [ ] `src/app/api/machines/route.ts`: 인증 검사

### Phase 7: 검증 및 배포
- [ ] 로컬 테스트: 회원가입 → 로그인 → 프로젝트 생성 → 다른 계정 격리 확인
- [ ] Vercel 환경변수 확인 (기존 SUPABASE 변수 유지)
- [ ] `git push` → Vercel 자동 배포

---

## 8. 에러 처리

| 상황 | 처리 방법 |
|------|----------|
| 이메일 중복 | "이미 사용 중인 이메일입니다" toast 표시 |
| 비밀번호 불일치 | 폼 검증으로 submit 전 차단 |
| 인증 만료 | 미들웨어가 자동으로 /auth/login 리다이렉트 |
| 권한 없는 접근 | RLS 정책으로 DB 레벨 차단 + API 401 반환 |
| 네트워크 오류 | toast.error() + 재시도 유도 |

---

## 9. 완료 기준 (Plan의 완료 기준 연결)

| Plan 요구사항 | 구현 방법 | 검증 방법 |
|-------------|---------|---------|
| 회원가입 후 로그인 가능 | signup 페이지 + Supabase Auth | 실제 회원가입 테스트 |
| 비인증 접근 차단 | middleware.ts | /projects 직접 접근 시 리다이렉트 확인 |
| 사용자 데이터 격리 | RLS 정책 | 계정 A 프로젝트가 계정 B에 미노출 |
| Navbar 사용자 표시 | AuthProvider + Navbar 변경 | 로그인 후 이름 표시 확인 |
| 로그아웃 동작 | signOut() + 미들웨어 | 로그아웃 후 접근 차단 확인 |
| Vercel 배포 | 기존 배포 설정 유지 | 배포 후 인증 동작 확인 |

---

**작성자**: 개발팀
**검토일**: 2026-02-26
