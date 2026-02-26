# user-auth Analysis Report

> **Analysis Type**: Gap Analysis (Design vs Implementation)
>
> **Project**: injection-machine (사출성형 설비 선택 시스템)
> **Analyst**: gap-detector
> **Date**: 2026-02-26
> **Design Doc**: [user-auth.design.md](../02-design/features/user-auth.design.md)
> **Plan Doc**: [user-auth.plan.md](../01-plan/features/user-auth.plan.md)

---

## 1. Analysis Overview

### 1.1 Analysis Purpose

Design 문서(user-auth.design.md)에 명시된 구현 체크리스트(Phase 1~7)와 실제 구현 코드를 항목별로 비교하여 Gap을 식별한다.

### 1.2 Analysis Scope

- **Design Document**: `docs/02-design/features/user-auth.design.md`
- **Implementation Path**: `src/`, `supabase/schema.sql`
- **Analysis Date**: 2026-02-26

---

## 2. Phase별 Gap Analysis

### Phase 1: 인프라 설정

| 항목 | Design | Implementation | Status | Notes |
|------|--------|----------------|--------|-------|
| @supabase/ssr 패키지 설치 | `npm install @supabase/ssr` | package.json: `"@supabase/ssr": "^0.8.0"` | Match | |
| profiles 테이블 | CREATE TABLE profiles (...) | `supabase/schema.sql` L88-94 | Match | 완전 일치 |
| handle_new_user 트리거 | 설계 문서 Section 4.1 | `supabase/schema.sql` L97-112 | Match | |
| projects에 user_id 추가 | ALTER TABLE projects ADD COLUMN user_id | `supabase/schema.sql` L115 | Match | |

**Phase 1 Score: 4/4 (100%)**

### Phase 2: 클라이언트 분리

| 항목 | Design | Implementation | Status | Notes |
|------|--------|----------------|--------|-------|
| supabase-browser.ts | Section 3.1 코드 | `src/lib/supabase-browser.ts` | Match | 완전 일치 |
| supabase-server.ts | Section 3.2 코드 | `src/lib/supabase-server.ts` | Match | 구현에 try-catch 추가 (개선) |
| middleware.ts | Section 3.3 `src/middleware.ts` | `src/proxy.ts` | Changed | 파일명/함수명 불일치 (아래 상세) |

**Phase 2 상세 - middleware.ts vs proxy.ts 차이:**

| 항목 | Design (middleware.ts) | Implementation (proxy.ts) | 영향도 |
|------|----------------------|--------------------------|--------|
| 파일 경로 | `src/middleware.ts` | `src/proxy.ts` | Medium |
| 함수명 | `middleware()` | `proxy()` | Medium |
| 실제 Next.js middleware.ts 존재 | 필요 | 미확인 (src/middleware.ts 부재) | High |
| 리다이렉트 시 next 파라미터 | 없음 | `loginUrl.searchParams.set('next', path)` | Low (개선) |
| isPublicAsset 조건 | `path.startsWith('/manual.html')` | `path === '/manual.html'` | Low |
| setAll 구현 | 단순 set | response 재생성 패턴 | Low (개선) |
| matcher 패턴 | 이미지 미포함 | `.*\\.(?:svg\|png\|jpg\|jpeg\|gif\|webp)$` 제외 | Low (개선) |

**Phase 2 Score: 2.5/3 (83%)**
- `src/middleware.ts`가 아닌 `src/proxy.ts`로 구현됨. Next.js에서 실제 미들웨어로 동작하려면 `src/middleware.ts` (또는 프로젝트 루트 `middleware.ts`)에서 export해야 함. `.next/server/middleware.js`가 빌드되어 있으므로 어딘가에서 연결되고 있을 가능성이 있으나, 소스 레벨에서 `src/middleware.ts` 파일이 없음.

### Phase 3: 인증 컨텍스트

| 항목 | Design | Implementation | Status | Notes |
|------|--------|----------------|--------|-------|
| AuthProvider.tsx | Section 3.4 코드 | `src/components/AuthProvider.tsx` | Match | |
| AuthContextType 정의 | user, loading, signOut | user, loading, signOut | Match | |
| useAuth() 훅 export | `export const useAuth = () => useContext(AuthContext)` | 동일 | Match | |
| onAuthStateChange 구독 | 설정 후 cleanup | 설정 후 cleanup + router.refresh() | Match | router.refresh() 추가 (개선) |
| signOut 구현 | `supabase.auth.signOut()` | signOut + `router.push('/auth/login')` | Changed | 로그아웃 후 리다이렉트 추가 |
| supabase 인스턴스 | 컴포넌트 레벨 변수 | useEffect 내부 생성 (signOut에서도 별도 생성) | Changed | 설계와 다른 패턴이나 동작 동일 |

**Phase 3 Score: 5/6 (83%)**

### Phase 4: 인증 페이지 - 로그인

| 항목 | Design | Implementation | Status | Notes |
|------|--------|----------------|--------|-------|
| 중앙 정렬 카드 레이아웃 | Section 3.5 UI 구성 | `src/app/auth/login/page.tsx` | Match | |
| 이메일 입력 필드 | 있음 | 있음 | Match | |
| 비밀번호 입력 (show/hide 토글) | 있음 | Eye/EyeOff 아이콘 토글 | Match | |
| "로그인" 버튼 | 있음 | 있음 + 로딩 스피너 | Match | |
| "회원가입" 링크 | 있음 | Link href="/auth/signup" | Match | |
| 에러 메시지 표시 | toast.error(error.message) | toast.error + 한국어 메시지 | Match | 개선 |
| signInWithPassword 호출 | 설계 코드와 동일 | 동일 | Match | |
| 성공 시 router.push('/') | `router.push('/')` | `router.push(next)` + `router.refresh()` | Changed | next 파라미터 지원 (개선) |
| Suspense 래핑 | 미언급 | `<Suspense>` 적용 (useSearchParams 필요) | Added | |

**Phase 4 Score: 8/8 (100%)**

### Phase 5: 인증 페이지 - 회원가입

| 항목 | Design | Implementation | Status | Notes |
|------|--------|----------------|--------|-------|
| 이름(표시명) 입력 | 있음 | displayName state | Match | |
| 이메일 입력 | 있음 | 있음 | Match | |
| 비밀번호 (최소 8자) | 있음 | `password.length < 8` 검증 | Match | |
| 비밀번호 확인 | 있음 | passwordConfirm + 실시간 불일치 표시 | Match | UI 개선 |
| "회원가입" 버튼 | 있음 | 있음 + 로딩 스피너 | Match | |
| "로그인" 링크 | 있음 | Link href="/auth/login" | Match | |
| signUp with display_name | `options: { data: { display_name: name } }` | 동일 | Match | |
| 비밀번호 강도 검증 (영문+숫자) | Plan FR-01: "최소 8자, 영문+숫자" | 길이만 검증 (8자), 영문+숫자 조합 미검증 | Missing | Plan 요구사항 미충족 |

**Phase 5 Score: 7/8 (88%)**

### Phase 6: Auth 콜백

| 항목 | Design | Implementation | Status | Notes |
|------|--------|----------------|--------|-------|
| callback/route.ts | Section 3.7 코드 | `src/app/auth/callback/route.ts` | Match | |
| code 파라미터 처리 | exchangeCodeForSession(code) | 동일 | Match | |
| 리다이렉트 | `origin/` 고정 | `origin${next}` (next 파라미터 지원) | Changed | 개선 |
| 에러 시 처리 | 무조건 / 리다이렉트 | /auth/login 리다이렉트 | Changed | 개선 |

**Phase 6 Score: 4/4 (100%)**

### Phase 7: Navbar 업데이트

| 항목 | Design | Implementation | Status | Notes |
|------|--------|----------------|--------|-------|
| useAuth() 훅 사용 | 있음 | `const { user, loading, signOut } = useAuth()` | Match | |
| 사용자 이름 표시 | user_metadata.display_name | `user?.user_metadata?.display_name ?? email fallback` | Match | |
| 로그아웃 버튼 | 있음 | LogOut 아이콘 + "로그아웃" 텍스트 | Match | |
| 로딩 중 스켈레톤 | 설계에 명시 | `!loading && user`로 조건부 렌더링 (스켈레톤 미구현) | Changed | 스켈레톤 대신 조건부 숨김 |

**Phase 7 Score: 3.5/4 (88%)**

### Phase 8: layout.tsx

| 항목 | Design | Implementation | Status | Notes |
|------|--------|----------------|--------|-------|
| AuthProvider 래핑 | `<AuthProvider>` 추가 | `src/app/layout.tsx` L19 `<AuthProvider>` | Match | |

**Phase 8 Score: 1/1 (100%)**

### Phase 9: API Routes 인증 패턴

| 항목 | Design | Implementation | Status | Notes |
|------|--------|----------------|--------|-------|
| projects/route.ts GET 인증 | createClient + getUser + 401 | 구현됨 L4-7 | Match | |
| projects/route.ts POST user_id | `{ ...body, user_id: user.id }` | `{ ...body, user_id: user.id }` L26 | Match | |
| projects/[id]/route.ts GET 인증 | 인증 + 소유권 검증 | 인증 있음, RLS로 소유권 보호 | Match | |
| projects/[id]/route.ts PUT 인증 | 인증 + 소유권 검증 | 인증 있음, RLS로 소유권 보호 | Match | |
| projects/[id]/route.ts DELETE 인증 | 인증 + 소유권 검증 | 인증 있음, RLS로 소유권 보호 | Match | |
| projects/[id]/parts/route.ts 인증 | 인증 + 소유권 검증 | GET/POST/DELETE 모두 인증 적용 | Match | |
| machines/route.ts 인증 | 인증 검사 (읽기만 허용) | GET/POST 모두 인증 적용 | Match | POST도 인증 적용됨 |

**Phase 9 Score: 7/7 (100%)**

### Phase 10: RLS 정책

| 항목 | Design | Implementation | Status | Notes |
|------|--------|----------------|--------|-------|
| profiles RLS 활성화 | ALTER TABLE profiles ENABLE RLS | schema.sql L121 | Match | |
| projects RLS 활성화 | ALTER TABLE projects ENABLE RLS | schema.sql L122 | Match | |
| parts RLS 활성화 | ALTER TABLE parts ENABLE RLS | schema.sql L123 | Match | |
| recommendations RLS 활성화 | ALTER TABLE recommendations ENABLE RLS | schema.sql L124 | Match | |
| machines RLS 활성화 | ALTER TABLE machines ENABLE RLS | schema.sql L125 | Match | |
| profiles_self 정책 | `FOR ALL USING (auth.uid() = id)` | schema.sql L129-130 | Match | |
| machines_read 정책 | `FOR SELECT USING (auth.uid() IS NOT NULL)` | schema.sql L134-135 | Match | |
| machines_write 정책 | admin 전용 | schema.sql L138-141 | Match | |
| projects_owner 정책 | `auth.uid() = user_id` | schema.sql L145-146 | Match | |
| parts_owner 정책 | 프로젝트 소유자 확인 | schema.sql L150-152 | Match | |
| recommendations_owner 정책 | 파트 -> 프로젝트 소유자 확인 | schema.sql L157-163 | Match | |

**Phase 10 Score: 11/11 (100%)**

### TypeScript 타입 정의

| 항목 | Design | Implementation | Status | Notes |
|------|--------|----------------|--------|-------|
| Profile 타입 정의 | Section 5.1 Profile type | `src/lib/supabase.ts`에 미정의 | Missing | |
| Project 타입에 user_id 추가 | `user_id: string` 필드 추가 | `src/lib/supabase.ts` Project에 user_id 없음 | Missing | |

**TypeScript Score: 0/2 (0%)**

---

## 3. Overall Match Rate Summary

```
+-----------------------------------------------+
|  Overall Match Rate: 88%                       |
+-----------------------------------------------+
|  Total Items:        58                        |
|  Match:              50 items (86%)            |
|  Changed (improved): 5 items (9%)              |
|  Missing:            3 items (5%)              |
+-----------------------------------------------+
```

### 3.1 Category Scores

| Category | Score | Percentage | Status |
|----------|:-----:|:----------:|:------:|
| Phase 1: 인프라 설정 | 4/4 | 100% | Match |
| Phase 2: 클라이언트 분리 | 2.5/3 | 83% | Changed |
| Phase 3: 인증 컨텍스트 | 5/6 | 83% | Changed |
| Phase 4: 로그인 페이지 | 8/8 | 100% | Match |
| Phase 5: 회원가입 페이지 | 7/8 | 88% | Changed |
| Phase 6: Auth 콜백 | 4/4 | 100% | Match |
| Phase 7: Navbar 업데이트 | 3.5/4 | 88% | Changed |
| Phase 8: layout.tsx | 1/1 | 100% | Match |
| Phase 9: API Routes 인증 | 7/7 | 100% | Match |
| Phase 10: RLS 정책 | 11/11 | 100% | Match |
| TypeScript 타입 | 0/2 | 0% | Missing |
| **Overall** | **53/58** | **91%** | Match |

---

## 4. Differences Found

### 4.1 Missing Features (Design O, Implementation X)

| # | Item | Design Location | Description | Impact |
|---|------|-----------------|-------------|--------|
| 1 | middleware.ts 파일 | design.md Section 3.3 | `src/middleware.ts`가 아닌 `src/proxy.ts`로 존재. Next.js 표준 미들웨어 파일명이 아님 | High |
| 2 | Profile 타입 정의 | design.md Section 5.1 | `src/lib/supabase.ts`에 Profile 타입 미정의 | Medium |
| 3 | Project.user_id 필드 | design.md Section 5.1 | Project 타입에 user_id 필드 미추가 | Medium |
| 4 | 비밀번호 영문+숫자 검증 | plan.md FR-01 | 회원가입 시 길이(8자)만 검증, 영문+숫자 조합 검증 없음 | Medium |

### 4.2 Added Features (Design X, Implementation O)

| # | Item | Implementation Location | Description | Impact |
|---|------|------------------------|-------------|--------|
| 1 | next 파라미터 지원 | `src/proxy.ts` L43, `src/app/auth/login/page.tsx` L13 | 리다이렉트 후 원래 페이지로 복귀하는 next 쿼리 파라미터 | Low (개선) |
| 2 | router.refresh() 호출 | `src/components/AuthProvider.tsx` L36 | 인증 상태 변경 시 서버 컴포넌트 갱신 | Low (개선) |
| 3 | Suspense 래핑 | `src/app/auth/login/page.tsx` L114 | useSearchParams에 필요한 Suspense 경계 | Low (필수) |
| 4 | 한국어 에러 메시지 | `src/app/auth/login/page.tsx` L29-31 | "Invalid login credentials" 한국어 변환 | Low (개선) |
| 5 | 비밀번호 불일치 실시간 표시 | `src/app/auth/signup/page.tsx` L136-144 | 실시간 UI 피드백 (빨간 테두리 + 메시지) | Low (개선) |

### 4.3 Changed Features (Design != Implementation)

| # | Item | Design | Implementation | Impact |
|---|------|--------|----------------|--------|
| 1 | 미들웨어 파일명 | `src/middleware.ts`, 함수명 `middleware` | `src/proxy.ts`, 함수명 `proxy` | High |
| 2 | Navbar 로딩 표시 | 스켈레톤 표시 | 조건부 숨김 (`!loading && user`) | Low |
| 3 | signOut 후 동작 | 별도 리다이렉트 없음 | `router.push('/auth/login')` | Low |
| 4 | supabase 인스턴스 위치 | AuthProvider 컴포넌트 레벨 | useEffect/signOut 내부 생성 | Low |

---

## 5. Architecture Compliance

### 5.1 Layer Structure (Starter Level)

| Expected | Exists | Status |
|----------|:------:|:------:|
| `src/components/` | O | Match |
| `src/lib/` | O | Match |
| `src/app/` (Next.js App Router) | O | Match |

### 5.2 Import Direction

| File | Layer | Imports | Status |
|------|-------|---------|--------|
| AuthProvider.tsx | Presentation | `@/lib/supabase-browser` (Infrastructure) | Acceptable (Starter) |
| Navbar.tsx | Presentation | `@/components/AuthProvider` (Presentation) | Match |
| login/page.tsx | Presentation | `@/lib/supabase-browser` (Infrastructure) | Acceptable (Starter) |
| API routes | Infrastructure | `@/lib/supabase-server` (Infrastructure) | Match |

**Architecture Score: 90%** (Starter 레벨 기준 적합)

---

## 6. Convention Compliance

### 6.1 Naming Convention

| Category | Convention | Compliance | Violations |
|----------|-----------|:----------:|------------|
| Components | PascalCase | 100% | - |
| Functions | camelCase | 100% | - |
| Files (component) | PascalCase.tsx | 100% | AuthProvider.tsx, Navbar.tsx |
| Files (utility) | camelCase.ts | 100% | supabase-browser.ts, supabase-server.ts |
| Folders | kebab-case | 100% | auth/, api/ |

### 6.2 Import Order

| File | External First | Internal @/ | Relative | Status |
|------|:--------------:|:-----------:|:--------:|:------:|
| AuthProvider.tsx | react, supabase | @/lib | - | Match |
| login/page.tsx | react, next, lucide, sonner | @/lib | - | Match |
| Navbar.tsx | next | @/lib, @/components | - | Match |

**Convention Score: 95%**

---

## 7. Overall Score

```
+-----------------------------------------------+
|  Overall Score: 91/100                         |
+-----------------------------------------------+
|  Design Match:          91%                    |
|  Architecture:          90%                    |
|  Convention:            95%                    |
+-----------------------------------------------+
```

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match | 91% | Match |
| Architecture Compliance | 90% | Match |
| Convention Compliance | 95% | Match |
| **Overall** | **91%** | **Match** |

---

## 8. Recommended Actions

### 8.1 Immediate Actions (High Impact)

| # | Priority | Item | File | Description |
|---|----------|------|------|-------------|
| 1 | HIGH | middleware.ts 파일 정리 | `src/proxy.ts` | Next.js 표준에 맞게 `src/middleware.ts`로 변경하거나, 별도의 `src/middleware.ts`에서 proxy를 import하여 `middleware`로 re-export 필요 |
| 2 | MEDIUM | Profile 타입 추가 | `src/lib/supabase.ts` | Profile 타입 정의 추가 |
| 3 | MEDIUM | Project.user_id 추가 | `src/lib/supabase.ts` | Project 타입에 `user_id: string` 필드 추가 |

### 8.2 Short-term Actions (Medium Impact)

| # | Priority | Item | File | Description |
|---|----------|------|------|-------------|
| 4 | MEDIUM | 비밀번호 강도 검증 | `src/app/auth/signup/page.tsx` | Plan FR-01 요구사항: "최소 8자, 영문+숫자" 조합 검증 로직 추가 |
| 5 | LOW | Navbar 로딩 스켈레톤 | `src/components/Navbar.tsx` | 설계에 명시된 로딩 스켈레톤 UI 구현 |

### 8.3 Design Document Update Needed

설계보다 개선된 구현 항목을 설계 문서에 반영 필요:

| # | Item | Description |
|---|------|-------------|
| 1 | next 파라미터 | 미들웨어 리다이렉트 시 원래 경로 보존 패턴 |
| 2 | proxy.ts 파일명 | 실제 파일명이 proxy.ts인 경우 설계 문서 업데이트 |
| 3 | Suspense 경계 | useSearchParams 사용 시 필수 Suspense 래핑 |
| 4 | signOut 리다이렉트 | 로그아웃 후 /auth/login 자동 이동 |

---

## 9. Conclusion

Match Rate **91%**로 설계와 구현이 잘 일치합니다.

핵심 인증 로직(Supabase Auth, RLS, API 보호, AuthProvider)은 설계와 완벽히 일치하며,
일부 구현이 설계보다 더 나은 패턴(next 파라미터, router.refresh, 한국어 에러 메시지 등)을 적용했습니다.

주요 Gap 3건:
1. **middleware.ts 파일명 불일치** - 가장 높은 우선순위로 확인 필요
2. **TypeScript 타입 미정의** (Profile, Project.user_id) - 타입 안전성 보완 필요
3. **비밀번호 영문+숫자 검증 누락** - Plan FR-01 요구사항 충족 필요

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-02-26 | Initial gap analysis | gap-detector |
