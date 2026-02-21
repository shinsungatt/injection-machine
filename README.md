# 사출성형 설비 선택 시스템

파트리스트(BOM) 기반으로 최적 사출성형 설비를 자동 추천하는 웹 애플리케이션입니다.

## 시작하기

### 1. Supabase 설정

1. [supabase.com](https://supabase.com)에서 무료 계정 생성
2. 새 프로젝트 생성
3. **SQL Editor**에서 `supabase/schema.sql` 파일 전체 내용 실행
4. **Project Settings > API**에서 URL과 anon key 복사

### 2. 환경변수 설정

`.env.local` 파일을 열어 실제 값으로 교체:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key
```

### 3. 개발 서버 실행

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000 접속

---

## 주요 기능

- **설비 DB 관리**: 사출성형 설비 CRUD (형체력/사출량/타이바 간격 등)
- **프로젝트 관리**: 신규 모델 프로젝트 생성 및 관리
- **Excel 업로드**: 파트리스트 일괄 등록
- **수동 입력**: 파트 직접 입력 (실시간 필요 형체력/사출량 계산 미리보기)
- **자동 추천**: 형체력/사출량/금형크기 3가지 조건으로 최적 설비 자동 선택
- **결과 시각화**: 파트별 1~3순위 추천 설비 + 활용률 차트

## 설비 추천 알고리즘

### 형체력 계산
```
필요 형체력 (ton) = 투영면적(cm²) × 수지압력(kgf/cm²) × 캐비티수 / 1000 × 1.2
```

### 사출량 계산
```
필요 사출량 (g) = (파트중량 × 캐비티수 + 런너중량) / 0.8 × 재료보정계수
```

### 추천 기준
- 형체력, 사출량 조건 충족
- 금형이 타이바/형판 내에 들어감
- 형체력 활용률 60~85% 범위 최우선

## Excel 업로드 형식

| 컬럼명 | 필수 |
|--------|------|
| part_number | 필수 |
| part_name | 필수 |
| material | 필수 (PP/ABS/PA66/PC/POM 등) |
| part_weight_g | 필수 |
| projected_area_cm2 | 필수 |
| cavity_count | 필수 |
| runner_weight_g | 선택 |
| mold_width_mm | 선택 |
| mold_height_mm | 선택 |
| mold_depth_mm | 선택 |
