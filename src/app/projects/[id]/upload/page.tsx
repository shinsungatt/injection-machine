'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Upload, FileSpreadsheet, CheckCircle } from 'lucide-react'

const COLUMNS = [
  { name: 'part_number', required: true, desc: '파트 번호' },
  { name: 'part_name', required: true, desc: '파트 명칭' },
  { name: 'material', required: true, desc: '재료 (PP/ABS/PA66/PC/POM 등)' },
  { name: 'part_weight_g', required: true, desc: '파트 중량 (g)' },
  { name: 'projected_area_cm2', required: true, desc: '투영면적 (cm²)' },
  { name: 'cavity_count', required: true, desc: '캐비티 수' },
  { name: 'runner_weight_g', required: false, desc: '런너 중량 (기본값: 파트중량×0.15)' },
  { name: 'mold_width_mm', required: false, desc: '금형 너비 (mm)' },
  { name: 'mold_height_mm', required: false, desc: '금형 높이 (mm)' },
  { name: 'mold_depth_mm', required: false, desc: '금형 두께 (mm)' },
]

export default function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ count: number } | null>(null)

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
          <p className="text-gray-500 mt-0.5">파트리스트 Excel 파일을 업로드합니다</p>
        </div>
      </div>

      {result ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">{result.count}개 파트 등록 완료</h2>
            <p className="text-gray-500 mb-6">파트리스트가 성공적으로 등록되었습니다.</p>
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
            <CardHeader><CardTitle className="text-base">Excel 컬럼 형식</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-3">첫 번째 행을 헤더로 인식합니다. 컬럼명은 대소문자를 구분하지 않습니다.</p>
              <div className="space-y-1.5">
                {COLUMNS.map(col => (
                  <div key={col.name} className="flex items-center gap-3 text-sm">
                    <code className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs w-44 shrink-0">
                      {col.name}
                    </code>
                    <Badge variant={col.required ? 'default' : 'secondary'} className="text-xs shrink-0">
                      {col.required ? '필수' : '선택'}
                    </Badge>
                    <span className="text-gray-600">{col.desc}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <p className="text-sm text-blue-700 font-medium mb-1">샘플 데이터 예시</p>
              <div className="overflow-x-auto">
                <table className="text-xs font-mono border-collapse">
                  <thead>
                    <tr className="bg-blue-100">
                      {['part_number','part_name','material','part_weight_g','projected_area_cm2','cavity_count'].map(h => (
                        <th key={h} className="border border-blue-300 px-2 py-1">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white">
                      {['P001','도어트림','PP','250','180','2'].map((v, i) => (
                        <td key={i} className="border border-blue-200 px-2 py-1">{v}</td>
                      ))}
                    </tr>
                    <tr className="bg-blue-50">
                      {['P002','인스트럭터','ABS','480','320','1'].map((v, i) => (
                        <td key={i} className="border border-blue-200 px-2 py-1">{v}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
