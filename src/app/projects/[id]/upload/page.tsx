'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Upload, FileSpreadsheet, CheckCircle, Info, AlertTriangle, Check, X as XIcon } from 'lucide-react'

// 인식 가능한 컬럼 목록 (업로드 전 안내용)
const FIELD_ALIASES = [
  { field: 'part_number', required: false, desc: '파트 번호', aliases: 'NO, No., 품번, 도번, 부품번호, 연번' },
  { field: 'part_name',   required: true,  desc: '파트 명칭', aliases: '품목명, 품명, SUB품명, 부품명, 제품명, 명칭' },
  { field: 'material',    required: false, desc: '재료',     aliases: 'MATERIAL, 원소재, 소재명, 재질, 소재' },
  { field: 'part_weight_g',     required: false, desc: '파트 중량 (g)', aliases: '중량, 설계중량, 단중, WEIGHT, 예상중량' },
  { field: 'projected_area_cm2', required: false, desc: '투영면적 (cm²)', aliases: '투영면적, projected area' },
  { field: 'cavity_count',      required: false, desc: '캐비티 수', aliases: "CAVITY, Q'ty, 소요량, 수량, 형사양" },
  { field: 'runner_weight_g',   required: false, desc: '런너 중량 (기본값: ×0.15)', aliases: 'R/SPRUE, runner, 런너, S/R 중량' },
  { field: 'product_size',      required: false, desc: '제품 사이즈 (mm)', aliases: '제품사이즈, 크기 WxHxD, 외형사이즈' },
  { field: 'finish',            required: false, desc: '표면처리/후가공', aliases: 'FINISH, 표면처리, 후가공, 도장, 도금' },
  { field: 'cycle_time_sec',    required: false, desc: '사이클타임 (sec)', aliases: 'C/T, C/T(sec), 사이클타임' },
  { field: 'mold_width_mm / height / depth', required: false, desc: '금형 크기 (mm)', aliases: '금형 사이즈(mm) 가로/세로/높이' },
]

// 필드명 → 한글 레이블
const FIELD_LABEL: Record<string, string> = {
  part_number: '파트번호', part_name: '파트명', material: '재질',
  part_weight_g: '중량(g)', projected_area_cm2: '투영면적', cavity_count: '캐비티',
  runner_weight_g: '런너중량', product_size: '제품사이즈',
  product_width_mm: '제품가로', product_height_mm: '제품세로', product_depth_mm: '제품높이',
  mold_width_mm: '금형가로', mold_height_mm: '금형세로', mold_depth_mm: '금형높이',
  cycle_time_sec: 'C/T', finish: '표면처리',
  is_injection: '사출구분', part_type: '파트타입', mold_type: '금형구분',
}

type UploadResult = {
  count: number
  sheet: string
  skipped: number
  filteredInjection: number
  mappedColumns: string[]
  unmappedHeaders: string[]
}

export default function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  const handleUpload = async () => {
    if (!file) { toast.error('파일을 선택하세요.'); return }
    const { id } = await params
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/projects/${id}/upload`, { method: 'POST', body: formData })
    setUploading(false)
    if (res.ok) {
      const data = await res.json()
      setResult(data)
      toast.success(`${data.count}개 파트가 등록되었습니다.`)
    } else {
      const err = await res.json()
      toast.error(err.error || '업로드 실패')
    }
  }

  const handleGoToProject = async () => {
    const { id } = await params
    router.push(`/projects/${id}`)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleGoToProject}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Excel 업로드</h1>
          <p className="text-gray-500 mt-0.5">고객사 파트리스트를 그대로 업로드하세요</p>
        </div>
      </div>

      {result ? (
        <Card>
          <CardContent className="py-6 space-y-5">
            <div className="flex flex-col items-center text-center pb-2">
              <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
              <h2 className="text-xl font-bold mb-1">{result.count}개 파트 등록 완료</h2>
              <p className="text-sm text-gray-500">
                시트: <span className="font-medium text-gray-700">{result.sheet}</span>
                {result.filteredInjection > 0 && ` · 비사출 ${result.filteredInjection}행 제외`}
                {result.skipped > 0 && ` · ${result.skipped}행 건너뜀`}
              </p>
            </div>

            {/* 인식된 컬럼 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                인식된 컬럼 ({result.mappedColumns.length}개)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.mappedColumns.map(col => (
                  <span
                    key={col}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200"
                  >
                    <Check className="h-3 w-3" />
                    {FIELD_LABEL[col] ?? col}
                  </span>
                ))}
              </div>
            </div>

            {/* 미인식 컬럼 */}
            {result.unmappedHeaders && result.unmappedHeaders.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  미인식 컬럼 ({result.unmappedHeaders.length}개) — 자동 매핑 안 됨
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.unmappedHeaders.map(h => (
                    <span
                      key={h}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200"
                    >
                      <XIcon className="h-3 w-3" />
                      {h}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  위 컬럼은 자동 인식되지 않았습니다. 아래 인식 가능 컬럼명과 비교하여 파일의 헤더를 수정하거나,
                  파트 상세에서 직접 입력하세요.
                </p>
              </div>
            )}

            {/* 투영면적 누락 경고 */}
            {!result.mappedColumns.includes('projected_area_cm2') && !result.mappedColumns.some(c => c.startsWith('product')) && (
              <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>투영면적이 없어 형체력 계산이 불가합니다. 파트 상세에서 직접 입력하거나 제품 사이즈 컬럼을 추가하세요.</span>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button onClick={handleGoToProject} className="gap-2">프로젝트로 이동</Button>
              <Button variant="outline" onClick={() => setResult(null)} className="gap-2">
                <Upload className="h-4 w-4" /> 다시 업로드
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Excel 파일 선택</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  dragOver ? 'border-blue-500 bg-blue-50' : file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'
                }`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-input-upload')?.click()}
              >
                <FileSpreadsheet className={`h-10 w-10 mx-auto mb-3 ${file ? 'text-green-500' : 'text-gray-400'}`} />
                {file ? (
                  <div>
                    <p className="text-green-700 font-medium">{file.name}</p>
                    <p className="text-xs text-green-500 mt-1">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-600 mb-2">.xlsx 또는 .xls 파일을 드래그하거나 클릭하세요</p>
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors">
                      <Upload className="h-4 w-4" /> 파일 선택
                    </span>
                  </div>
                )}
                <input id="file-input-upload" type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
              </div>
              <Button onClick={handleUpload} disabled={!file || uploading} className="w-full gap-2">
                {uploading ? '분석 중...' : <><Upload className="h-4 w-4" /> 업로드</>}
              </Button>
            </CardContent>
          </Card>

          {/* 인식 가능 컬럼 안내 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">자동 인식 컬럼 목록</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                헤더 행을 자동으로 찾아 아래 컬럼명을 인식합니다. 한국어·영어 혼용, 공백 포함 등 유사 표기도 자동 매핑됩니다.
              </p>
              <div className="divide-y divide-gray-100">
                {FIELD_ALIASES.map(col => (
                  <div key={col.field} className="flex items-start gap-3 py-2.5 text-sm">
                    <Badge
                      variant={col.required ? 'default' : 'secondary'}
                      className="text-xs shrink-0 mt-0.5 min-w-[36px] justify-center"
                    >
                      {col.required ? '필수' : '선택'}
                    </Badge>
                    <div className="min-w-[110px] font-medium text-gray-800">{col.desc}</div>
                    <div className="text-gray-400 text-xs leading-relaxed">{col.aliases}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3 pt-3 border-t">
                * 인식 안 된 컬럼은 업로드 후 결과 화면에서 표시됩니다. 필요시 파일의 헤더명을 위 예시와 맞춰 수정하세요.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
