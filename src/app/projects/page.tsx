'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, FolderOpen, Trash2, ArrowRight, Upload, FileSpreadsheet, X } from 'lucide-react'
import type { Project } from '@/lib/supabase'

const STATUS_LABEL: Record<string, string> = { draft: '초안', analyzing: '분석중', completed: '완료' }
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  analyzing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
}

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  // 새 프로젝트 + 파트리스트 업로드 패널
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', model_name: '', description: '' })
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchProjects = () => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => { setProjects(Array.isArray(data) ? data : []); setLoading(false) })
  }

  useEffect(() => { fetchProjects() }, [])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 프로젝트를 삭제하시겠습니까?\n(파트 목록과 추천 결과도 함께 삭제됩니다)`)) return
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('삭제되었습니다.'); fetchProjects() }
    else toast.error('삭제 실패')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ''
  }

  // 프로젝트 생성 + 파트리스트 업로드 (선택)
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.model_name) { toast.error('프로젝트명과 모델명을 입력하세요.'); return }
    setSaving(true)

    // 1) 프로젝트 생성
    const res = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) { const e = await res.json(); toast.error(e.error || '생성 실패'); setSaving(false); return }
    const project = await res.json()

    // 2) 파트리스트 파일이 있으면 업로드
    if (file) {
      const fd = new FormData(); fd.append('file', file)
      const upRes = await fetch(`/api/projects/${project.id}/upload`, { method: 'POST', body: fd })
      if (upRes.ok) {
        const upData = await upRes.json()
        toast.success(`프로젝트 생성 완료 + 파트 ${upData.count}개 등록`)
      } else {
        const err = await upRes.json()
        toast.warning(`프로젝트는 생성됐지만 파트 업로드 실패: ${err.error}`)
      }
    } else {
      toast.success('프로젝트가 생성되었습니다.')
    }

    setSaving(false)
    setForm({ name: '', model_name: '', description: '' })
    setFile(null)
    setShowCreate(false)
    router.push(`/projects/${project.id}`)
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">로딩중...</div>

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">프로젝트</h1>
          <p className="text-gray-500 mt-1">신규 모델 프로젝트 목록</p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreate(v => !v)}>
          <Plus className="h-4 w-4" /> 새 프로젝트
        </Button>
      </div>

      {/* 새 프로젝트 생성 패널 */}
      {showCreate && (
        <Card className="border-blue-200">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">새 프로젝트 생성</CardTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowCreate(false)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pname">프로젝트명 *</Label>
                  <Input id="pname" placeholder="예: 2025 신차 내장 설비 선정"
                    value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mname">모델명 *</Label>
                  <Input id="mname" placeholder="예: MODEL-X2025"
                    value={form.model_name} onChange={e => setForm(p => ({ ...p, model_name: e.target.value }))} required />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="desc">설명 (선택)</Label>
                  <Textarea id="desc" placeholder="프로젝트 설명..." rows={2}
                    value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                </div>
              </div>

              {/* 파트리스트 업로드 영역 */}
              <div className="space-y-1.5">
                <Label>파트리스트 Excel 업로드 <span className="text-gray-400 font-normal">(선택 - 나중에도 가능)</span></Label>
                <div
                  className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors cursor-pointer ${dragOver ? 'border-blue-500 bg-blue-50' : file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                  {file ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileSpreadsheet className="h-6 w-6 text-green-500" />
                      <div className="text-left">
                        <p className="text-sm font-medium text-green-700">{file.name}</p>
                        <p className="text-xs text-green-500">{(file.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-red-500 ml-2"
                        onClick={e => { e.stopPropagation(); setFile(null) }}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Upload className="h-6 w-6 text-gray-400" />
                      <p className="text-sm text-gray-500">파트리스트 파일을 드래그하거나 클릭하여 선택</p>
                      <p className="text-xs text-gray-400">.xlsx / .xls / .csv</p>
                    </div>
                  )}
                </div>

                {/* 필수 컬럼 안내 */}
                <div className="flex flex-wrap gap-2 mt-1">
                  {['part_number', 'part_name', 'material', 'part_weight_g', 'projected_area_cm2', 'cavity_count'].map(c => (
                    <code key={c} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{c}</code>
                  ))}
                  <span className="text-xs text-gray-400 self-center">필수 컬럼</span>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <Button type="submit" disabled={saving} className="gap-2">
                  {saving ? '생성중...' : <><Plus className="h-4 w-4" />{file ? '프로젝트 생성 + 파트 업로드' : '프로젝트 생성'}</>}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowCreate(false); setFile(null) }}>취소</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* 프로젝트 카드 목록 */}
      {projects.length === 0 && !showCreate ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">프로젝트가 없습니다.</p>
            <Button className="gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> 첫 프로젝트 생성
            </Button>
          </CardContent>
        </Card>
      ) : projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <Badge className={`${STATUS_COLOR[p.status]} hover:${STATUS_COLOR[p.status]} border-0`}>
                    {STATUS_LABEL[p.status]}
                  </Badge>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 -mt-1 -mr-1"
                    onClick={() => handleDelete(p.id, p.name)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{p.name}</h3>
                <p className="text-sm text-gray-500 mb-1">{p.model_name}</p>
                {p.description && <p className="text-xs text-gray-400 mb-3 line-clamp-2">{p.description}</p>}
                <p className="text-xs text-gray-400 mb-4">
                  {new Date(p.created_at).toLocaleDateString('ko-KR')}
                </p>
                <Link href={`/projects/${p.id}`} className="block">
                  <Button variant="outline" className="w-full gap-2 text-sm">
                    프로젝트 열기 <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
