'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Plus, Pencil, Trash2, Factory, Upload, FileSpreadsheet,
  ChevronDown, ChevronUp, Check, X, Search, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react'
import type { Machine } from '@/lib/supabase'

// ─── 인라인 편집 셀 (단일 숫자) ─────────────────────────────────────────────
function EditableCell({ value, machineId, field, onSaved }: {
  value: number; machineId: string; field: keyof Machine
  onSaved: (id: string, field: keyof Machine, val: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  const open = () => { setDraft(String(value)); setEditing(true); setTimeout(() => inputRef.current?.select(), 0) }
  const cancel = () => setEditing(false)
  const save = async () => {
    const num = parseFloat(draft)
    if (isNaN(num) || num <= 0) { toast.error('올바른 숫자를 입력하세요'); return }
    const res = await fetch(`/api/machines/${machineId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: num }),
    })
    if (res.ok) { onSaved(machineId, field, num); setEditing(false); toast.success('저장되었습니다') }
    else toast.error('저장 실패')
  }
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }

  if (editing) return (
    <div className="flex items-center gap-1 justify-end">
      <Input ref={inputRef} type="number" step="any" value={draft}
        onChange={e => setDraft(e.target.value)} onKeyDown={onKey}
        className="h-7 w-24 text-right font-mono text-sm p-1" />
      <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600 hover:text-green-700" onClick={save}><Check className="h-3.5 w-3.5" /></Button>
      <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400 hover:text-gray-600" onClick={cancel}><X className="h-3.5 w-3.5" /></Button>
    </div>
  )
  return (
    <div className="flex items-center gap-1 justify-end cursor-pointer group rounded px-1 hover:bg-blue-50" onClick={open} title="클릭하여 수정">
      <span className="font-mono text-sm">{value}</span>
      <Pencil className="h-3 w-3 text-gray-300 group-hover:text-blue-400 transition-colors shrink-0" />
    </div>
  )
}

// ─── 인라인 편집 셀 (X × Y 쌍) ──────────────────────────────────────────────
function EditablePairCell({ x, y, machineId, fieldX, fieldY, onSaved }: {
  x: number; y: number; machineId: string
  fieldX: keyof Machine; fieldY: keyof Machine
  onSaved: (id: string, updates: Partial<Machine>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [dx, setDx] = useState(String(x))
  const [dy, setDy] = useState(String(y))
  const inputRef = useRef<HTMLInputElement>(null)

  const open = () => { setDx(String(x)); setDy(String(y)); setEditing(true); setTimeout(() => inputRef.current?.select(), 0) }
  const cancel = () => setEditing(false)
  const save = async () => {
    const nx = parseFloat(dx), ny = parseFloat(dy)
    if (isNaN(nx) || isNaN(ny) || nx <= 0 || ny <= 0) { toast.error('올바른 숫자를 입력하세요'); return }
    const res = await fetch(`/api/machines/${machineId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [fieldX]: nx, [fieldY]: ny }),
    })
    if (res.ok) { onSaved(machineId, { [fieldX]: nx, [fieldY]: ny }); setEditing(false); toast.success('저장되었습니다') }
    else toast.error('저장 실패')
  }
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }

  if (editing) return (
    <div className="flex items-center gap-1 justify-end">
      <Input ref={inputRef} type="number" step="any" value={dx} onChange={e => setDx(e.target.value)} onKeyDown={onKey}
        className="h-7 w-20 text-right font-mono text-sm p-1" />
      <span className="text-gray-400 text-xs">×</span>
      <Input type="number" step="any" value={dy} onChange={e => setDy(e.target.value)} onKeyDown={onKey}
        className="h-7 w-20 text-right font-mono text-sm p-1" />
      <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600 hover:text-green-700" onClick={save}><Check className="h-3.5 w-3.5" /></Button>
      <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400 hover:text-gray-600" onClick={cancel}><X className="h-3.5 w-3.5" /></Button>
    </div>
  )
  return (
    <div className="flex items-center gap-1 justify-end cursor-pointer group rounded px-1 hover:bg-blue-50" onClick={open} title="클릭하여 수정">
      <span className="font-mono text-sm">{x} × {y}</span>
      <Pencil className="h-3 w-3 text-gray-300 group-hover:text-blue-400 transition-colors shrink-0" />
    </div>
  )
}

// ─── 정렬 헤더 버튼 ──────────────────────────────────────────────────────────
type SortDir = 'asc' | 'desc' | null
function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <button className={`flex items-center gap-1 font-medium hover:text-blue-600 transition-colors ${active ? 'text-blue-600' : 'text-gray-600'}`} onClick={onClick}>
      {label} <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

const COLUMNS = [
  { name: 'name', req: true, desc: '설비명' },
  { name: 'manufacturer', req: false, desc: '제조사' },
  { name: 'clamping_force_ton', req: true, desc: '형체력 (ton)' },
  { name: 'shot_weight_max_g', req: true, desc: '최대 사출량 (g, PS기준)' },
  { name: 'injection_pressure_max_mpa', req: false, desc: '최대 사출압력 (MPa)' },
  { name: 'platen_width_mm', req: false, desc: '형판 너비 (mm)' },
  { name: 'platen_height_mm', req: false, desc: '형판 높이 (mm)' },
  { name: 'tie_bar_x_mm', req: false, desc: '타이바 간격 X (mm)' },
  { name: 'tie_bar_y_mm', req: false, desc: '타이바 간격 Y (mm)' },
  { name: 'daylight_max_mm', req: false, desc: '최대 데이라이트 (mm)' },
  { name: 'screw_diameter_mm', req: false, desc: '스크류 직경 (mm)' },
  { name: 'notes', req: false, desc: '비고' },
]

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────
export default function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [filter, setFilter] = useState('')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchMachines = useCallback(() => {
    fetch('/api/machines')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMachines(data)
        } else {
          toast.error(data?.error ?? '설비 데이터를 불러올 수 없습니다.')
          setMachines([])
        }
        setLoading(false)
      })
      .catch(() => { toast.error('서버 연결 오류'); setLoading(false) })
  }, [])

  useEffect(() => { fetchMachines() }, [fetchMachines])

  const handleCellSaved = (id: string, field: keyof Machine, val: number) =>
    setMachines(prev => prev.map(m => m.id === id ? { ...m, [field]: val } : m))
  const handlePairSaved = (id: string, updates: Partial<Machine>) =>
    setMachines(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m))

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 설비를 삭제하시겠습니까?`)) return
    const res = await fetch(`/api/machines/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('삭제되었습니다.'); setMachines(prev => prev.filter(m => m.id !== id)) }
    else toast.error('삭제에 실패했습니다.')
  }

  const handleUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext ?? '')) { toast.error('.xlsx / .xls / .csv 파일만 가능합니다.'); return }
    setUploading(true)
    const formData = new FormData(); formData.append('file', file)
    const res = await fetch('/api/machines/upload', { method: 'POST', body: formData })
    setUploading(false)
    if (res.ok) {
      const data = await res.json(); toast.success(`${data.count}대 설비가 등록되었습니다.`)
      setShowUpload(false); fetchMachines()
    } else { const err = await res.json(); toast.error(err.error || '업로드 실패') }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) handleUpload(file); e.target.value = ''
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) handleUpload(file)
  }

  // 이름 정렬 토글: null → asc → desc → null
  const toggleSort = () => setSortDir(d => d === null ? 'asc' : d === 'asc' ? 'desc' : null)

  // 필터 + 정렬 적용
  const filtered = machines
    .filter(m => filter === '' || m.name.toLowerCase().includes(filter.toLowerCase()) || m.manufacturer.toLowerCase().includes(filter.toLowerCase()))
  const sorted = sortDir === null ? filtered : [...filtered].sort((a, b) => {
    const cmp = a.name.localeCompare(b.name, 'ko', { numeric: true })
    return sortDir === 'asc' ? cmp : -cmp
  })

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">로딩중...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">설비 관리</h1>
          <p className="text-gray-500 mt-1">사출성형 설비 데이터베이스</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setShowUpload(v => !v)}>
            <FileSpreadsheet className="h-4 w-4" /> Excel 일괄 등록
            {showUpload ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          <Link href="/machines/new">
            <Button className="gap-2"><Plus className="h-4 w-4" /> 설비 등록</Button>
          </Link>
        </div>
      </div>

      {/* Excel 업로드 패널 */}
      {showUpload && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-blue-800">Excel 일괄 등록</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${dragOver ? 'border-blue-500 bg-blue-100' : 'border-blue-300 bg-white hover:border-blue-400'} ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-blue-600 font-medium">업로드 중...</p>
                </div>
              ) : (
                <><Upload className="h-8 w-8 text-blue-400 mx-auto mb-2" />
                  <p className="font-medium text-blue-700">파일을 드래그하거나 클릭하여 선택</p>
                  <p className="text-sm text-blue-500 mt-1">.xlsx / .xls / .csv 지원</p></>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {COLUMNS.map(col => (
                <div key={col.name} className="flex items-center gap-2 text-xs">
                  <code className="font-mono bg-white border border-blue-200 px-1.5 py-0.5 rounded text-blue-700 w-44 shrink-0">{col.name}</code>
                  <Badge variant={col.req ? 'default' : 'secondary'} className="text-xs shrink-0 h-4">{col.req ? '필수' : '선택'}</Badge>
                  <span className="text-gray-600">{col.desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 설비 목록 */}
      {machines.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Factory className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">등록된 설비가 없습니다.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={() => setShowUpload(true)}>
                <FileSpreadsheet className="h-4 w-4" /> Excel 일괄 등록
              </Button>
              <Link href="/machines/new"><Button className="gap-2"><Plus className="h-4 w-4" /> 수동 등록</Button></Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base shrink-0">
                총 {machines.length}대
                {filter && <span className="text-gray-400 font-normal text-sm ml-2">→ {sorted.length}대</span>}
              </CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input placeholder="설비명 또는 제조사 검색..." value={filter}
                  onChange={e => setFilter(e.target.value)} className="pl-8 h-8 text-sm" />
              </div>
              <p className="text-xs text-gray-400 shrink-0">숫자 클릭 시 바로 수정</p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {/* 설비명 - 정렬 버튼 */}
                  <TableHead>
                    <SortHeader
                      label="설비명"
                      active={sortDir !== null}
                      dir={sortDir}
                      onClick={toggleSort}
                    />
                  </TableHead>
                  <TableHead>제조사</TableHead>
                  <TableHead className="text-right">형체력(T)</TableHead>
                  <TableHead className="text-right">최대사출량(g)</TableHead>
                  <TableHead className="text-right">타이바 X×Y(mm)</TableHead>
                  <TableHead className="text-right">형판 W×H(mm)</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-400">검색 결과가 없습니다.</TableCell>
                  </TableRow>
                ) : sorted.map(m => (
                  <TableRow key={m.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-gray-600">{m.manufacturer}</TableCell>
                    <TableCell>
                      <EditableCell value={m.clamping_force_ton} machineId={m.id} field="clamping_force_ton" onSaved={handleCellSaved} />
                    </TableCell>
                    <TableCell>
                      <EditableCell value={m.shot_weight_max_g} machineId={m.id} field="shot_weight_max_g" onSaved={handleCellSaved} />
                    </TableCell>
                    <TableCell>
                      <EditablePairCell x={m.tie_bar_x_mm} y={m.tie_bar_y_mm} machineId={m.id}
                        fieldX="tie_bar_x_mm" fieldY="tie_bar_y_mm" onSaved={handlePairSaved} />
                    </TableCell>
                    <TableCell>
                      <EditablePairCell x={m.platen_width_mm} y={m.platen_height_mm} machineId={m.id}
                        fieldX="platen_width_mm" fieldY="platen_height_mm" onSaved={handlePairSaved} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.is_active ? 'default' : 'secondary'}
                        className={m.is_active ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}>
                        {m.is_active ? '활성' : '비활성'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Link href={`/machines/${m.id}/edit`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="전체 수정">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600"
                          onClick={() => handleDelete(m.id, m.name)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
