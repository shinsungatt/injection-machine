'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ChevronLeft, Plus, BarChart2, Trash2, RefreshCw,
  FileSpreadsheet, FileText, Box, Layers, X, Upload, CheckCircle2, CheckSquare,
  Sparkles,
} from 'lucide-react'
import type { Project, Part } from '@/lib/supabase'
import { calcRequiredClampingForce, predictCycleTime } from '@/lib/algorithm'

const STATUS_LABEL: Record<string, string> = { draft: '초안', analyzing: '분석중', completed: '완료' }
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  analyzing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
}

function getMaterialColor(material: string) {
  const upper = material.toUpperCase()
  if (upper.startsWith('PP')) return 'bg-yellow-100 text-yellow-700'
  if (upper.startsWith('ABS')) return 'bg-blue-100 text-blue-700'
  if (upper.startsWith('PA')) return 'bg-purple-100 text-purple-700'
  if (upper.startsWith('PC')) return 'bg-red-100 text-red-700'
  if (upper.startsWith('POM')) return 'bg-green-100 text-green-700'
  return 'bg-gray-100 text-gray-600'
}

type ProjectFile = {
  id: string
  file_type: string
  name: string
  file_size: number | null
  file_url: string | null
  created_at: string
}

type AnalysisResult = {
  part_number: string | null
  part_name: string | null
  material: string | null
  part_weight_g: number
  projected_area_cm2: number
  cavity_count: number
  width_mm: number | null
  height_mm: number | null
  depth_mm: number | null
  notes: string | null
  _fileName: string
  _tokensUsed: number
}

type UploadCardConfig = {
  type: 'excel' | 'pdf' | 'cad' | 'stp'
  label: string
  accept: string
  icon: React.ReactNode
  color: string
  desc: string
}

const UPLOAD_CARDS: UploadCardConfig[] = [
  {
    type: 'excel', label: '파트리스트 Excel', accept: '.xlsx,.xls,.csv',
    icon: <FileSpreadsheet className="h-5 w-5" />,
    color: 'border-green-300 bg-green-50',
    desc: '고객사 파트리스트 업로드 → 예상TON 자동 계산',
  },
  {
    type: 'pdf', label: '도면 PDF', accept: '.pdf',
    icon: <FileText className="h-5 w-5" />,
    color: 'border-red-300 bg-red-50',
    desc: '파트 도면 PDF 첨부',
  },
  {
    type: 'cad', label: '도면 CAD', accept: '.dwg,.dxf,.sldprt,.prt',
    icon: <Box className="h-5 w-5" />,
    color: 'border-blue-300 bg-blue-50',
    desc: 'CAD 도면 파일 첨부',
  },
  {
    type: 'stp', label: 'STP 파일', accept: '.stp,.step,.igs,.iges',
    icon: <Layers className="h-5 w-5" />,
    color: 'border-purple-300 bg-purple-50',
    desc: '3D 모델 STP/STEP 파일 첨부',
  },
]

function UploadCard({
  config, files, onUpload, onDelete, onAnalyze, uploading, uploadProgress, analyzingFileId,
}: {
  config: UploadCardConfig
  files: ProjectFile[]
  onUpload: (type: string, file: File) => void
  onDelete: (fileId: string) => void
  onAnalyze?: (fileId: string) => void
  uploading: string | null
  uploadProgress: number
  analyzingFileId: string | null
}) {
  const [drag, setDrag] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const isUploading = uploading === config.type

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) onUpload(config.type, f)
  }

  const hasFiles = files.length > 0

  return (
    <Card className={`border-2 ${drag ? 'border-blue-400 bg-blue-50' : hasFiles ? 'border-green-400 bg-green-50' : config.color}`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          {config.icon}
          {config.label}
          {hasFiles && (
            <span className="ml-auto flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-normal">{files.length}개</span>
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-gray-400">{config.desc}</p>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {/* 업로드된 파일 목록 */}
        {files.length > 0 && (
          <div className="space-y-1">
            {files.map(f => (
              <div key={f.id} className="flex items-center gap-2 text-xs bg-white rounded border border-green-200 px-2 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                <span className="flex-1 truncate font-medium text-gray-700">{f.name}</span>
                {f.file_size && <span className="text-gray-400 shrink-0">{(f.file_size / 1024 / 1024).toFixed(1)}MB</span>}
                {config.type === 'pdf' && onAnalyze && (
                  <button
                    onClick={() => onAnalyze(f.id)}
                    disabled={!!analyzingFileId}
                    className="flex items-center gap-1 text-purple-600 hover:text-purple-800 shrink-0 disabled:opacity-40"
                    title="AI 도면 분석"
                  >
                    {analyzingFileId === f.id
                      ? <RefreshCw className="h-3 w-3 animate-spin" />
                      : <Sparkles className="h-3 w-3" />}
                    AI분석
                  </button>
                )}
                {f.file_url && (
                  <a href={f.file_url} target="_blank" rel="noreferrer"
                    className="text-blue-500 hover:underline shrink-0">열기</a>
                )}
                <button onClick={() => onDelete(f.id)} className="text-red-400 hover:text-red-600 shrink-0">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 드래그 & 드롭 업로드 영역 */}
        <div
          className="border border-dashed border-gray-300 rounded-lg p-3 text-center cursor-pointer hover:border-gray-400 transition-colors"
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
          onClick={() => ref.current?.click()}
        >
          <input ref={ref} type="file" accept={config.accept} className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) { onUpload(config.type, f); e.target.value = '' } }} />
          {isUploading ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-center gap-2 text-xs text-blue-600">
                <RefreshCw className="h-3 w-3 animate-spin" />
                {uploadProgress > 0 ? `${uploadProgress}%` : '업로드 중...'}
              </div>
              {uploadProgress > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1 text-xs text-gray-400">
              <Upload className="h-3 w-3" />
              {files.length > 0 ? '추가 업로드' : '클릭 또는 드래그'}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [parts, setParts] = useState<Part[]>([])
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [analyzingFile, setAnalyzingFile] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [applyingPart, setApplyingPart] = useState(false)
  const [selectedParts, setSelectedParts] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const fetchData = useCallback((id: string) => {
    Promise.all([
      fetch(`/api/projects/${id}`).then(r => r.json()),
      fetch(`/api/projects/${id}/parts`).then(r => r.json()),
      fetch(`/api/projects/${id}/files`).then(r => r.json()),
    ]).then(([p, pts, files]) => {
      setProject(p)
      setParts(Array.isArray(pts) ? pts : [])
      setProjectFiles(Array.isArray(files) ? files : [])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    params.then(p => { setProjectId(p.id); fetchData(p.id) })
  }, [params, fetchData])

  const handleDeletePart = async (partId: string, name: string) => {
    if (!confirm(`"${name}" 파트를 삭제하시겠습니까?`)) return
    const res = await fetch(`/api/parts/${partId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('삭제되었습니다.')
      setSelectedParts(prev => { const s = new Set(prev); s.delete(partId); return s })
      fetchData(projectId)
    } else toast.error('삭제 실패')
  }

  const handleBulkDelete = async () => {
    if (selectedParts.size === 0) return
    if (!confirm(`선택한 ${selectedParts.size}개 파트를 삭제하시겠습니까?`)) return
    setBulkDeleting(true)
    const res = await fetch(`/api/projects/${projectId}/parts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedParts) }),
    })
    setBulkDeleting(false)
    if (res.ok) {
      const data = await res.json()
      toast.success(`${data.deleted}개 파트가 삭제되었습니다.`)
      setSelectedParts(new Set())
      fetchData(projectId)
    } else {
      const err = await res.json()
      toast.error(err.error || '삭제 실패')
    }
  }

  const toggleSelectPart = (id: string) => {
    setSelectedParts(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const toggleSelectAll = () => {
    if (selectedParts.size === parts.length) {
      setSelectedParts(new Set())
    } else {
      setSelectedParts(new Set(parts.map(p => p.id)))
    }
  }

  const handleFileUpload = async (type: string, file: File) => {
    setUploading(type)
    setUploadProgress(0)
    try {
      if (type === 'excel') {
        // Excel은 기존 방식 유지 (파트 파싱이 필요)
        const fd = new FormData()
        fd.append('file', file)
        fd.append('type', type)
        const res = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body: fd })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          toast.error(errData.error || `서버 오류 (${res.status})`)
          return
        }
        const data = await res.json()
        toast.success(`파트리스트 업로드 완료 — ${data.count}개 파트 등록`)
        fetchData(projectId)
        return
      }

      // ── PDF / CAD / STP: Supabase Storage 직접 업로드 (용량 제한 없음) ──
      // Step 1: 서명된 업로드 URL 발급
      const presignRes = await fetch(`/api/projects/${projectId}/files/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileType: type }),
      })
      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({}))
        toast.error(err.error || '업로드 URL 생성 실패')
        return
      }
      const { uploadUrl, storagePath } = await presignRes.json()

      // Step 2: XHR로 Supabase Storage에 직접 PUT (진행률 추적 가능)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.onload = () => {
          if (xhr.status < 400) resolve()
          else reject(new Error(`스토리지 업로드 오류 (${xhr.status})`))
        }
        xhr.onerror = () => reject(new Error('네트워크 오류'))
        xhr.send(file)
      })

      // Step 3: 메타데이터 DB 저장
      const confirmRes = await fetch(`/api/projects/${projectId}/files/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath, fileName: file.name, fileType: type, fileSize: file.size }),
      })
      if (!confirmRes.ok) {
        const err = await confirmRes.json().catch(() => ({}))
        toast.error(err.error || '파일 정보 저장 실패')
        return
      }

      toast.success(`${file.name} 업로드 완료`)
      fetchData(projectId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류'
      toast.error(`업로드 중 오류: ${msg}`)
    } finally {
      setUploading(null)
      setUploadProgress(0)
    }
  }

  const handleFileDelete = async (fileId: string) => {
    const res = await fetch(`/api/projects/${projectId}/files/${fileId}`, { method: 'DELETE' })
    if (res.ok) { toast.success('파일이 삭제되었습니다.'); fetchData(projectId) }
    else toast.error('삭제 실패')
  }

  const handleAnalyzeFile = async (fileId: string) => {
    setAnalyzingFile(fileId)
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${fileId}/analyze`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'AI 분석 실패')
        return
      }
      const data = await res.json()
      setAnalysisResult(data)
      toast.success('AI 도면 분석 완료')
    } catch {
      toast.error('AI 분석 중 오류가 발생했습니다.')
    } finally {
      setAnalyzingFile(null)
    }
  }

  const handleApplyAnalysis = async () => {
    if (!analysisResult) return
    setApplyingPart(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/parts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          part_number:        analysisResult.part_number || `PDF-${Date.now()}`,
          part_name:          analysisResult.part_name || analysisResult._fileName,
          material:           analysisResult.material || 'ABS',
          part_weight_g:      analysisResult.part_weight_g || 0,
          projected_area_cm2: analysisResult.projected_area_cm2 || 0,
          cavity_count:       analysisResult.cavity_count || 1,
          runner_weight_g:    (analysisResult.part_weight_g || 0) * 0.15,
          notes:              analysisResult.notes,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || '파트 추가 실패')
        return
      }
      toast.success('파트가 추가되었습니다.')
      setAnalysisResult(null)
      fetchData(projectId)
    } catch {
      toast.error('파트 추가 중 오류가 발생했습니다.')
    } finally {
      setApplyingPart(false)
    }
  }

  const handleAnalyze = async () => {
    if (parts.length === 0) { toast.error('파트를 먼저 등록하세요.'); return }
    setAnalyzing(true)
    const res = await fetch(`/api/projects/${projectId}/recommend`, { method: 'POST' })
    setAnalyzing(false)
    if (res.ok) {
      toast.success('설비 추천 분석이 완료되었습니다.')
      router.push(`/projects/${projectId}/result`)
    } else {
      const err = await res.json()
      toast.error(err.error || '분석 실패')
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">로딩중...</div>
  if (!project) return <div className="text-center text-gray-500">프로젝트를 찾을 수 없습니다.</div>

  // 파일 타입별 분류
  const filesByType = (type: string) => projectFiles.filter(f => f.file_type === type)

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/projects">
          <Button variant="ghost" size="icon"><ChevronLeft className="h-5 w-5" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <Badge className={`${STATUS_COLOR[project.status]} border-0`}>
              {STATUS_LABEL[project.status]}
            </Badge>
          </div>
          <p className="text-gray-500 mt-0.5">{project.model_name}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/projects/${projectId}/parts/new`}>
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> 파트 수동 입력
            </Button>
          </Link>
          {project.status === 'completed' && (
            <Link href={`/projects/${projectId}/result`}>
              <Button variant="outline" size="sm" className="gap-2 text-green-700 border-green-300 hover:bg-green-50">
                <BarChart2 className="h-4 w-4" /> 결과 보기
              </Button>
            </Link>
          )}
          <Button size="sm" onClick={handleAnalyze} disabled={analyzing || parts.length === 0} className="gap-2">
            {analyzing
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> 분석중...</>
              : <><BarChart2 className="h-4 w-4" /> 설비 추천 실행</>}
          </Button>
        </div>
      </div>

      {/* 파일 업로드 4개 카드 */}
      <div>
        <h2 className="text-sm font-medium text-gray-500 mb-3">파일 업로드</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {UPLOAD_CARDS.map(cfg => (
            <UploadCard
              key={cfg.type}
              config={cfg}
              files={filesByType(cfg.type)}
              onUpload={handleFileUpload}
              onDelete={handleFileDelete}
              onAnalyze={cfg.type === 'pdf' ? handleAnalyzeFile : undefined}
              uploading={uploading}
              uploadProgress={uploadProgress}
              analyzingFileId={analyzingFile}
            />
          ))}
        </div>
      </div>

      {/* AI 분석 결과 패널 */}
      {analysisResult && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2 text-purple-800">
              <Sparkles className="h-4 w-4" />
              AI 도면 분석 결과 — {analysisResult._fileName}
            </CardTitle>
            <button onClick={() => setAnalysisResult(null)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: '도번', value: analysisResult.part_number },
                { label: '품명', value: analysisResult.part_name },
                { label: '재질', value: analysisResult.material },
                { label: '중량(g)', value: analysisResult.part_weight_g || '-' },
                { label: '투영면적(cm²)', value: analysisResult.projected_area_cm2 || '-' },
                { label: '캐비티', value: analysisResult.cavity_count },
                { label: '크기(mm)', value: analysisResult.width_mm ? `${analysisResult.width_mm}×${analysisResult.height_mm}×${analysisResult.depth_mm}` : '-' },
                { label: '표면처리/비고', value: analysisResult.notes || '-' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white rounded-lg px-3 py-2 border border-purple-100">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{value ?? '-'}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleApplyAnalysis}
                disabled={applyingPart}
                className="gap-2 bg-purple-600 hover:bg-purple-700"
              >
                {applyingPart
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> 추가 중...</>
                  : <><Plus className="h-4 w-4" /> 이 데이터로 파트 추가</>}
              </Button>
              <p className="text-xs text-gray-400">토큰 사용: {analysisResult._tokensUsed}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 파트 목록 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">파트 목록 ({parts.length}개)</CardTitle>
          <div className="flex items-center gap-3">
            {selectedParts.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5 h-8"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting
                  ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />}
                선택 삭제 ({selectedParts.size}개)
              </Button>
            )}
            {parts.length > 0 && (
              <p className="text-xs text-gray-400">
                예상TON = 투영면적 × 수지압력 × 캐비티 / 1000 × 1.2
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {parts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
              <p className="text-sm">파트리스트 Excel을 업로드하거나 수동으로 파트를 입력하세요.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <button
                        onClick={toggleSelectAll}
                        className="flex items-center justify-center w-full"
                        title={selectedParts.size === parts.length ? '전체 해제' : '전체 선택'}
                      >
                        {selectedParts.size === parts.length && parts.length > 0
                          ? <CheckSquare className="h-4 w-4 text-blue-600" />
                          : <div className={`h-4 w-4 rounded border-2 ${selectedParts.size > 0 ? 'border-blue-400 bg-blue-100' : 'border-gray-300'}`} />
                        }
                      </button>
                    </TableHead>
                    <TableHead className="w-32">파트번호</TableHead>
                    <TableHead>품명</TableHead>
                    <TableHead>재료</TableHead>
                    <TableHead className="text-right bg-yellow-50 font-semibold text-yellow-700">예상TON</TableHead>
                    <TableHead className="text-right bg-yellow-50 font-semibold text-yellow-700">C/T(sec)</TableHead>
                    <TableHead className="text-right">투영면적(cm²)</TableHead>
                    <TableHead className="text-right">캐비티</TableHead>
                    <TableHead className="text-right">중량(g)</TableHead>
                    <TableHead className="text-right">금형W×H</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parts.map(p => {
                    const expectedTon = calcRequiredClampingForce(p)
                    const isSelected = selectedParts.has(p.id)
                    return (
                      <TableRow
                        key={p.id}
                        className={isSelected ? 'bg-blue-50' : ''}
                        onClick={() => toggleSelectPart(p.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <TableCell onClick={e => e.stopPropagation()} className="px-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectPart(p.id)}
                            className="h-4 w-4 accent-blue-600 cursor-pointer"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{p.part_number}</TableCell>
                        <TableCell className="font-medium">{p.part_name}</TableCell>
                        <TableCell>
                          <Badge className={`${getMaterialColor(p.material)} border-0 text-xs`}>
                            {p.material}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right bg-yellow-50">
                          <span className="font-bold text-yellow-800">{expectedTon.toFixed(0)}T</span>
                        </TableCell>
                        <TableCell className="text-right bg-yellow-50">
                          {p.cycle_time_sec != null ? (
                            <span className="font-semibold text-yellow-800">{p.cycle_time_sec}s</span>
                          ) : (
                            <span className="font-semibold text-blue-600">
                              {predictCycleTime(p)}s
                              <span className="text-xs font-normal text-gray-400 ml-1">(예측)</span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{p.projected_area_cm2}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{p.cavity_count}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{p.part_weight_g}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-gray-400">
                          {p.mold_width_mm && p.mold_height_mm ? `${p.mold_width_mm}×${p.mold_height_mm}` : '-'}
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600"
                            onClick={() => handleDeletePart(p.id, p.part_name)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
