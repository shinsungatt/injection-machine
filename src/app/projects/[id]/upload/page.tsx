'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Upload, FileSpreadsheet, CheckCircle, Info } from 'lucide-react'

const FIELD_ALIASES = [
  {
    field: 'part_number',
    required: false,
    desc: '파트 번호',
    aliases: 'NO, No., 품번, DK입고품번, part_number',
  },
  {
    field: 'part_name',
    required: true,
    desc: '파트 명칭',
    aliases: 'Part Name, 품목명, 품명, SUB품명, part_name',
  },
  {
    field: 'material',
    required: false,
    desc: '재료',
    aliases: 'MATERIAL, Material, 원소재, 소재명, 소재정보 소재명',
  },
  {
    field: 'part_weight_g',
    required: false,
    desc: '파트 중량 (g)',
    aliases: 'WEIGHT(g), Weight (Unit), 설계중량, 중량',
  },
  {
    field: 'projected_area_cm2',
    required: false,
    desc: '투영면적 (cm²)',
    aliases: 'projected_area_cm2, 투영면적',
  },
  {
    field: 'cavity_count',
    required: false,
    desc: '캐비티 수',
    aliases: "CAVITY, Q'ty, 소요량, 수량",
  },
  {
    field: 'runner_weight_g',
    required: false,
    desc: '런너 중량 (기본값: 파트중량×0.15)',
    aliases: 'R/SPRUE(g), runner, 런너',
  },
  {
    field: 'mold_width_mm / height / depth',
    required: false,
    desc: '금형 크기 (mm)',
    aliases: '금형 사이즈(mm) 가로(폭)/세로(길이)/높이(두께)',
  },
]

type UploadResult = {
  count: number
  sheet: string
  skipped: number
  filteredInjection: number
  mappedColumns: string[]
}

export default function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
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
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <h2 className="text-xl font-bold mb-1">{result.count}개 파트 등록 완료</h2>
            <p className="text-sm text-gray-500 mb-4">
              시트: <span className="font-medium text-gray-700">{result.sheet}</span>
              {result.filteredInjection > 0 && ` · 비사출 ${result.filteredInjection}행 제외`}
              {result.skipped > 0 && ` · ${result.skipped}행 건너뜀`}
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center mb-6">
              {result.mappedColumns.map(col => (
                <Badge key={col} variant="secondary" className="text-xs">{col}</Badge>
              ))}
            </div>
            {!result.mappedColumns.includes('projected_area_cm2') && (
              <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-left max-w-sm">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>투영면적이 없어 형체력 계산이 불가합니다. 파트 상세에서 직접 입력하세요.</span>
              </div>
            )}
            <Button onClick={handleGoToProject} className="gap-2">프로젝트로 이동</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Excel 파일 선택</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                <FileSpreadsheet className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 mb-2">.xlsx 또는 .xls 파일을 선택하세요</p>
                {file && <p className="text-blue-600 font-medium mb-2">{file.name}</p>}
                <label className="cursor-pointer">
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-white border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors">
                    <Upload className="h-4 w-4" /> 파일 선택
                  </span>
                </label>
              </div>
              <Button onClick={handleUpload} disabled={!file || uploading} className="w-full gap-2">
                {uploading ? '업로드 중...' : <><Upload className="h-4 w-4" /> 업로드</>}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">자동 인식 컬럼</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-3">
                헤더 위치와 컬럼명을 자동으로 감지합니다. 한국어·영어 혼용 양식을 그대로 올려도 됩니다.
              </p>
              <div className="space-y-2">
                {FIELD_ALIASES.map(col => (
                  <div key={col.field} className="flex items-start gap-3 text-sm">
                    <Badge
                      variant={col.required ? 'default' : 'secondary'}
                      className="text-xs shrink-0 mt-0.5"
                    >
                      {col.required ? '필수' : '선택'}
                    </Badge>
                    <div className="min-w-0">
                      <span className="font-medium text-gray-800">{col.desc}</span>
                      <span className="text-gray-400 ml-2 text-xs">{col.aliases}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
