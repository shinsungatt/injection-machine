# Plan: user-auth (사용자 인증 + 권한 관리)

> **Feature**: user-auth
> **작성일**: 2026-02-26
> **상태**: Plan Phase
> **프로젝트**: 사출성형 설비 선택 시스템 v1.1.0

---

## 1. 개요

### 1.1 배경 및 목적
현재 injection-machine 시스템은 인증 없이 누구나 접근 가능한 상태입니다.
v1.1.0에서 사용자 인증 및 프로젝트별 권한 관리를 추가하여 데이터 보안을 강화하고
사용자별 개인화된 환경을 제공합니다.

### 1.2 기대 효과
- 데이터 보안: 승인된 사용자만 시스템 접근 가능
- 사용자 격리: 각 사용자의 프로젝트/데이터 독립 관리
- 관리 편의성: 관리자의 사용자 및 권한 통합 관리

---

## 2. 기능 요구사항

### 2.1 Must Have (필수)

#### FR-01: 회원가입
- 이메일 + 비밀번호로 회원가입
- 이름(표시명) 입력
- 이메일 중복 검사
- 비밀번호 강도 검증 (최소 8자, 영문+숫자)

#### FR-02: 로그인
- 이메일 + 비밀번호 로그인
- 로그인 상태 유지 (세션 관리)
- 로그아웃 기능
- 비로그인 상태에서 보호된 페이지 접근 시 로그인 페이지 리다이렉트

#### FR-03: 인증 상태 관리
- 페이지 새로고침 시 로그인 상태 유지
- 세션 만료 시 자동 로그아웃
- Navbar에 로그인한 사용자 정보 표시

#### FR-04: 데이터 격리
- 사용자는 본인이 생성한 프로젝트만 접근 가능
- 설비(machines)는 공용 데이터 (모든 인증 사용자 접근)
- 프로젝트(projects)/파트(parts)/추천(recommendations)는 사용자별 격리

#### FR-05: 권한 구분 (Role)
- **admin**: 모든 데이터 접근 가능, 사용자 관리
- **user**: 본인 프로젝트만 접근, 설비는 읽기만 가능
- 기본 역할: user

### 2.2 Nice to Have (선택)

#### FR-06: 비밀번호 재설정
- 이메일로 비밀번호 재설정 링크 발송
- Supabase Auth 내장 기능 활용

#### FR-07: 프로필 수정
- 표시명 변경
- 비밀번호 변경

---

## 3. 기술 스택

### 3.1 인증
- **Supabase Auth**: 이메일/비밀번호 인증 (이미 @supabase/supabase-js 설치됨)
- **Supabase RLS (Row Level Security)**: DB 레벨 데이터 격리
- **Next.js Middleware**: 페이지 접근 제어

### 3.2 영향 범위
- `src/lib/supabase.ts`: Supabase 클라이언트 업데이트
- `src/middleware.ts`: 신규 생성 (페이지 보호)
- `src/app/auth/`: 신규 생성 (로그인/회원가입 페이지)
- `src/components/Navbar.tsx`: 사용자 정보 표시 업데이트
- `src/app/api/**`: 모든 API에 인증 미들웨어 추가
- Supabase RLS 정책 설정

---

## 4. 데이터 모델 변경

### 4.1 profiles 테이블 (신규)
```sql
profiles:
- id (UUID, FK → auth.users.id, PK)
- email (text)
- display_name (text)
- role (text, default: 'user') -- 'admin' | 'user'
- created_at (timestamp)
```

### 4.2 기존 테이블 변경
```sql
-- projects 테이블에 user_id 컬럼 추가
ALTER TABLE projects ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- 기존 데이터: admin 계정으로 마이그레이션
```

### 4.3 RLS 정책
```sql
-- projects: 본인 데이터만 접근
-- machines: 모든 인증 사용자 읽기, admin만 쓰기
-- parts: 프로젝트 소유자만 접근
-- recommendations: 파트 소유자만 접근
```

---

## 5. 페이지 구조

### 5.1 신규 페이지
```
/auth/login          - 로그인 페이지
/auth/signup         - 회원가입 페이지
/auth/callback       - OAuth 콜백 (향후 확장)
```

### 5.2 보호 페이지 (인증 필요)
```
/                    - 홈 (인증 필요)
/machines/**         - 설비 관리
/projects/**         - 프로젝트 관리
```

### 5.3 공개 페이지
```
/auth/**             - 로그인/회원가입
/public/manual.html  - 사용 설명서
```

---

## 6. 구현 순서

1. Supabase Auth 설정 (프로젝트 설정에서 활성화)
2. `profiles` 테이블 생성 + RLS 정책
3. 기존 테이블 `user_id` 컬럼 추가 + RLS 정책
4. `src/middleware.ts` 생성 (페이지 보호)
5. `src/lib/supabase.ts` 업데이트 (서버/클라이언트 분리)
6. `/auth/login`, `/auth/signup` 페이지 구현
7. `Navbar.tsx` 업데이트 (사용자 정보 + 로그아웃)
8. API Routes 인증 검사 추가
9. 기존 데이터 마이그레이션 (admin 계정 생성)

---

## 7. 비기능 요구사항

- **보안**: JWT 토큰 기반, HTTPS 통신 (Vercel 자동)
- **UX**: 로그인 상태 즉시 반영, 부드러운 리다이렉트
- **하위 호환성**: 기존 설비 7대 데이터 유지, 프로젝트는 admin으로 마이그레이션

---

## 8. 완료 기준

- [ ] 회원가입 후 로그인 가능
- [ ] 로그인 없이 /projects 접근 시 /auth/login으로 리다이렉트
- [ ] 사용자 A의 프로젝트가 사용자 B에게 보이지 않음
- [ ] 로그인 후 Navbar에 사용자 이름 표시
- [ ] 로그아웃 후 세션 삭제
- [ ] Vercel 배포 후 정상 동작

---

**작성자**: 개발팀
**검토일**: 2026-02-26
