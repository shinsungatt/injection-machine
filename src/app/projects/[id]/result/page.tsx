'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronLeft, RefreshCw, AlertTriangle, Download, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import type { Part, Machine, Recommendation } from '@/lib/supabase'
import {
  predictCycleTime, getResinPressure, getMaterialCorrection,
  calcRequiredClampingForce, calcRequiredShotWeight, getFinishFromNotes, hasSlideCore,
  resolveEffectiveThickness,
} from '@/lib/algorithm'

type ResultItem = {
  part: Part
  recommendations: (Recommendation & { machine: Machine })[]
}

const RANK_ICON = ['', '🥇', '🥈', '🥉']

function getMaterialColor(material: string) {
  const upper = material.toUpperCase()
  if (upper.startsWith('PP')) return 'bg-yellow-100 text-yellow-700'
  if (upper.startsWith('ABS')) return 'bg-blue-100 text-blue-700'
  if (upper.startsWith('PA')) return 'bg-purple-100 text-purple-700'
  if (upper.startsWith('PC')) return 'bg-red-100 text-red-700'
  if (upper.startsWith('POM')) return 'bg-green-100 text-green-700'
  return 'bg-gray-100 text-gray-600'
}

// "13호기 LS엠트론 ..." → 13 / 없으면 999
function extractHogiNumber(name: string): number {
  const m = name.match(/^(\d+)호기/)
  return m ? parseInt(m[1]) : 999
}

function UtilizationBar({ value, label }: { value: number; label: string }) {
  const isOptimal = value >= 60 && value <= 85
  const isOver = value > 100
  const color = isOver ? 'bg-red-500' : isOptimal ? 'bg-green-500' : 'bg-yellow-400'
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span className={`font-medium ${isOver ? 'text-red-600' : isOptimal ? 'text-green-600' : 'text-yellow-600'}`}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  )
}

function NoteCell({
  value, onChange, onSave, saving,
}: {
  value: string
  onChange: (v: string) => void
  onSave: () => void
  saving: boolean
}) {
  const composingRef = useRef(false)
  const [focused, setFocused] = useState(false)

  if (!focused && !value) {
    return (
      <button
        onClick={() => setFocused(true)}
        className="text-xs text-gray-300 hover:text-gray-400 transition-colors whitespace-nowrap"
      >
        + 메모
      </button>
    )
  }

  return (
    <div className="relative">
      <textarea
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={focused}
        value={value}
        rows={2}
        className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none focus:outline-none focus:border-blue-400 bg-white"
        style={{ minWidth: '140px' }}
        placeholder="한글 메모 입력..."
        onChange={(e) => { if (!composingRef.current) onChange(e.target.value) }}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={(e) => {
          composingRef.current = false
          onChange((e.target as HTMLTextAreaElement).value)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); onSave() }}
      />
      {saving && (
        <span className="absolute bottom-1 right-1 text-xs text-blue-400">저장중...</span>
      )}
    </div>
  )
}

function CalcSummary({ part }: { part: Part }) {
  const resinPressure = getResinPressure(part.material)
  const materialCorr = getMaterialCorrection(part.material)
  const requiredTon = calcRequiredClampingForce(part)
  const requiredShot = calcRequiredShotWeight(part)
  const runnerWeight = part.runner_weight_g ?? part.part_weight_g * 0.15
  const isCTPredicted = part.cycle_time_sec == null
  const ctValue = isCTPredicted ? predictCycleTime(part) : part.cycle_time_sec!
  const thick = isCTPredicted ? resolveEffectiveThickness(part) : null

  // 두께 출처 표시 레이블
  const thickLabel = thick
    ? thick.source === 'input'
      ? `입력값 ${thick.thicknessMm.toFixed(1)}mm`
      : thick.source === 'safety_default'
      ? `${thick.rawMm.toFixed(1)}mm → 4mm↑ 오류, ${thick.thicknessMm.toFixed(1)}mm 고정`
      : thick.wasClamped
      ? `역산 ${thick.rawMm.toFixed(1)}mm (4mm 제한 적용)`
      : `역산 ${thick.thicknessMm.toFixed(1)}mm`
    : null

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
      <p className="font-semibold text-slate-600 text-xs uppercase tracking-wide">추천 근거 요약</p>
      <div className="grid grid-cols-1 gap-1.5 font-mono text-slate-500">
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className="text-slate-400 shrink-0">형체력</span>
          <span>
            {part.projected_area_cm2}cm² × {resinPressure}kgf/cm² × {part.cavity_count}캐 / 1000 × 1.2
          </span>
          <span className="text-slate-300">=</span>
          <span className="font-bold text-slate-700">{requiredTon.toFixed(1)} T</span>
        </div>
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className="text-slate-400 shrink-0">사출량</span>
          <span>
            ({part.part_weight_g}g × {part.cavity_count}캐 + {runnerWeight.toFixed(1)}g) / 0.8 × {materialCorr.toFixed(3)}
          </span>
          <span className="text-slate-300">=</span>
          <span className="font-bold text-slate-700">{requiredShot.toFixed(1)} g</span>
        </div>
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className="text-slate-400 shrink-0">C/T</span>
          {isCTPredicted ? (
            <span>
              두께 {thickLabel}
              {thick?.wasClamped && (
                <span className="ml-1 text-amber-500 font-semibold">[클램프]</span>
              )}
              {' '}→ t²×k + dry
            </span>
          ) : (
            <span>실측값 입력</span>
          )}
          <span className="text-slate-300">=</span>
          <span className={`font-bold ${isCTPredicted ? 'text-blue-600' : 'text-slate-700'}`}>
            {ctValue} sec{isCTPredicted ? ' (예측)' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [results, setResults] = useState<ResultItem[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({})
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const fetchResults = useCallback((id: string) => {
    fetch(`/api/projects/${id}/recommend`)
      .then(r => r.json())
      .then(data => {
        const arr: ResultItem[] = Array.isArray(data) ? data : []
        setResults(arr)
        // Initialize notes from DB (don't overwrite locally edited drafts)
        setNotesDraft(prev => {
          const init: Record<string, string> = {}
          for (const { part } of arr) {
            if (!(part.id in prev)) init[part.id] = part.notes ?? ''
          }
          return { ...init, ...prev }
        })
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    params.then(p => { setProjectId(p.id); fetchResults(p.id) })
  }, [params, fetchResults])

  const handleReanalyze = async () => {
    setReanalyzing(true)
    const res = await fetch(`/api/projects/${projectId}/recommend`, { method: 'POST' })
    setReanalyzing(false)
    if (res.ok) { toast.success('재분석 완료'); fetchResults(projectId) }
    else { const e = await res.json(); toast.error(e.error || '실패') }
  }

  const saveNote = async (partId: string) => {
    const value = (notesDraft[partId] ?? '').trim()
    setSavingNoteId(partId)
    await fetch(`/api/parts/${partId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: value || null }),
    })
    setSavingNoteId(null)
  }

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new()

    // ── 시트 1: 요약표 ──────────────────────────────────────────────
    const summaryHeader = [
      '파트번호', '파트명', '재료', '예상TON(T)', 'C/T(sec)', 'C/T구분',
      '추천 호기', '설비 용량(T)', '형체력 활용률(%)', '비고',
    ]
    const summaryData = summaryRows.map(row => [
      row.partNumber,
      row.partName,
      row.material,
      row.expectedTon,
      row.displayCt ?? '',
      row.ctIsPredicted ? '예측' : '실측',
      row.machineName ?? '추천 없음',
      row.machineCapacity > 0 ? row.machineCapacity : '',
      row.hasRec ? parseFloat(row.clampingPct.toFixed(1)) : '',
      notesDraft[row.partId] ?? '',
    ])
    const ws1 = XLSX.utils.aoa_to_sheet([summaryHeader, ...summaryData])
    ws1['!cols'] = [14, 20, 8, 12, 10, 8, 22, 12, 16, 30].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws1, '요약표')

    // ── 시트 2: 파트별 상세 (1~3순위) ──────────────────────────────
    const detailHeader = [
      '파트번호', '파트명', '재료', '투영면적(cm²)', '캐비티수',
      '1순위 설비', '1순위 형체력활용률(%)', '1순위 사출량활용률(%)',
      '2순위 설비', '2순위 형체력활용률(%)', '2순위 사출량활용률(%)',
      '3순위 설비', '3순위 형체력활용률(%)', '3순위 사출량활용률(%)',
      '비고',
    ]
    const detailData = results.map(({ part, recommendations }) => {
      const getRec = (rank: number) => recommendations.find(r => r.rank === rank)
      const r1 = getRec(1), r2 = getRec(2), r3 = getRec(3)
      return [
        part.part_number,
        part.part_name,
        part.material,
        part.projected_area_cm2,
        part.cavity_count,
        r1?.machine?.name ?? '없음',
        r1 ? parseFloat(r1.utilization_clamping_pct.toFixed(1)) : '',
        r1 ? parseFloat(r1.utilization_shot_pct.toFixed(1)) : '',
        r2?.machine?.name ?? '',
        r2 ? parseFloat(r2.utilization_clamping_pct.toFixed(1)) : '',
        r2 ? parseFloat(r2.utilization_shot_pct.toFixed(1)) : '',
        r3?.machine?.name ?? '',
        r3 ? parseFloat(r3.utilization_clamping_pct.toFixed(1)) : '',
        r3 ? parseFloat(r3.utilization_shot_pct.toFixed(1)) : '',
        notesDraft[part.id] ?? '',
      ]
    })
    const ws2 = XLSX.utils.aoa_to_sheet([detailHeader, ...detailData])
    ws2['!cols'] = [14, 20, 8, 14, 10, 22, 18, 18, 22, 18, 18, 22, 18, 18, 30].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws2, '파트별 상세')

    // ── 시트 3: 설비별 배정 현황 ────────────────────────────────────
    const machineHeader = ['설비명', '배정 파트 수', '배정 파트번호 목록']
    const machineData = machineChartData.map(({ name, count }) => {
      const partNums = results
        .filter(r => r.recommendations.find(rec => rec.rank === 1 && rec.machine?.name === name))
        .map(r => r.part.part_number)
        .join(', ')
      return [name, count, partNums]
    })
    if (noRecommendCount > 0) {
      const noRecParts = results
        .filter(r => r.recommendations.length === 0)
        .map(r => r.part.part_number)
        .join(', ')
      machineData.push(['추천 없음', noRecommendCount, noRecParts])
    }
    const ws3 = XLSX.utils.aoa_to_sheet([machineHeader, ...machineData])
    ws3['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 60 }]
    XLSX.utils.book_append_sheet(wb, ws3, '설비별 배정')

    XLSX.writeFile(wb, `설비추천결과_${projectId}.xlsx`)
    toast.success('Excel 파일이 다운로드되었습니다.')
  }

  // ─── 요약표 데이터: 파트별 1순위 설비 ───────────────────────────────────────
  const summaryRows = results
    .map(r => {
      const top = r.recommendations.find(rec => rec.rank === 1)
      const actualCt = r.part.cycle_time_sec
      const predictedCt = predictCycleTime(r.part)
      const p = r.part
      const resinP = getResinPressure(p.material, getFinishFromNotes(p.notes))
      const safety = hasSlideCore(p.notes) ? 1.3 : 1.2
      const corr = getMaterialCorrection(p.material)
      const runner = p.runner_weight_g ?? p.part_weight_g * 0.15
      const requiredShot = calcRequiredShotWeight(p)
      return {
        partId: p.id,
        partNumber: p.part_number,
        partName: p.part_name,
        material: p.material,
        expectedTon: top?.required_clamping_force_ton ?? 0,
        ct: actualCt,
        displayCt: actualCt ?? predictedCt,
        ctIsPredicted: actualCt == null,
        machineName: top?.machine?.name ?? null,
        machineCapacity: top?.machine?.clamping_force_ton ?? 0,
        clampingPct: top?.utilization_clamping_pct ?? 0,
        hogiNum: top?.machine?.name ? extractHogiNumber(top.machine.name) : 999,
        hasRec: !!top,
        // 산출근거
        calc: {
          area: p.projected_area_cm2,
          resinP,
          safety,
          cavity: p.cavity_count,
          weight: p.part_weight_g,
          runner: parseFloat(runner.toFixed(1)),
          corr: parseFloat(corr.toFixed(3)),
          requiredShot: parseFloat(requiredShot.toFixed(1)),
          ctIsPredicted: actualCt == null,
          ctValue: actualCt ?? predictedCt,
        },
      }
    })
    .sort((a, b) => {
      if (sortKey) {
        // 사용자 선택 정렬
        const aVal = a[sortKey as keyof typeof a]
        const bVal = b[sortKey as keyof typeof b]
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          const cmp = aVal.localeCompare(bVal, 'ko', { numeric: true })
          return sortDir === 'asc' ? cmp : -cmp
        }
        const cmp = (aVal as number) - (bVal as number)
        return sortDir === 'asc' ? cmp : -cmp
      }
      // 기본 정렬: 호기 번호 내림차순 (24호기 → 1호기), 추천없음 맨 뒤
      if (!a.hasRec && b.hasRec) return 1
      if (a.hasRec && !b.hasRec) return -1
      return b.hogiNum - a.hogiNum
    })

  // ─── 활용률 차트 데이터 ─────────────────────────────────────────────────────
  const chartData = results
    .map(r => {
      const top = r.recommendations.find(rec => rec.rank === 1)
      if (!top) return null
      return {
        name: r.part.part_number,
        partName: r.part.part_name,
        machine: top.machine?.name ?? '-',
        clamping: parseFloat(top.utilization_clamping_pct.toFixed(1)),
        shot: parseFloat(top.utilization_shot_pct.toFixed(1)),
        required: parseFloat(top.required_clamping_force_ton.toFixed(1)),
      }
    })
    .filter(Boolean) as { name: string; partName: string; machine: string; clamping: number; shot: number; required: number }[]

  // ─── 설비별 집계 (호기 번호 내림차순) ──────────────────────────────────────
  const machineUsage: Record<string, { name: string; count: number }> = {}
  results.forEach(r => {
    const top = r.recommendations.find(rec => rec.rank === 1)
    if (top?.machine) {
      const mid = top.machine.id
      if (!machineUsage[mid]) machineUsage[mid] = { name: top.machine.name, count: 0 }
      machineUsage[mid].count++
    }
  })
  const machineChartData = Object.values(machineUsage)
    .sort((a, b) => extractHogiNumber(b.name) - extractHogiNumber(a.name))
  const noRecommendCount = results.filter(r => r.recommendations.length === 0).length

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">로딩중...</div>

  if (results.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/projects/${projectId}`)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">추천 결과</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <AlertTriangle className="h-10 w-10 text-yellow-400 mb-3" />
            <p className="text-gray-600">추천 결과가 없습니다. 먼저 분석을 실행하세요.</p>
            <Button className="mt-4" onClick={() => router.push(`/projects/${projectId}`)}>
              프로젝트로 이동
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/projects/${projectId}`)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">설비 추천 결과</h1>
            <p className="text-gray-500 mt-0.5">{results.length}개 파트 분석 완료</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportExcel} className="gap-2">
            <Download className="h-4 w-4" />
            Excel 내보내기
          </Button>
          <Button variant="outline" onClick={handleReanalyze} disabled={reanalyzing} className="gap-2">
            {reanalyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            재분석
          </Button>
        </div>
      </div>

      {noRecommendCount > 0 && (
        <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {noRecommendCount}개 파트에 적합한 설비가 없습니다. 설비 DB를 확인하세요.
        </div>
      )}

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">요약표</TabsTrigger>
          <TabsTrigger value="detail">파트별 상세</TabsTrigger>
          <TabsTrigger value="chart">활용률 차트</TabsTrigger>
          <TabsTrigger value="machine">설비별 요약</TabsTrigger>
        </TabsList>

        {/* ────────────────── 요약표 탭 (기본) ────────────────── */}
        <TabsContent value="summary" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                파트별 예상TON / C/T → 추천 호기
                <span className="text-xs font-normal text-gray-400">
                  {sortKey ? `${sortDir === 'asc' ? '▲' : '▼'} 정렬 중 — 헤더 클릭으로 정렬 변경` : '헤더 클릭으로 정렬'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {([
                        { key: 'partNumber', label: '파트번호', cls: 'w-32' },
                        { key: 'partName',   label: '품명',    cls: '' },
                        { key: 'material',   label: '재료',    cls: '' },
                      ] as const).map(col => (
                        <TableHead key={col.key} className={col.cls}>
                          <button onClick={() => handleSort(col.key)}
                            className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                            {col.label}
                            {sortKey === col.key
                              ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                              : <ArrowUpDown className="h-3 w-3 text-gray-300" />}
                          </button>
                        </TableHead>
                      ))}
                      {([
                        { key: 'expectedTon',    label: '예상TON',      cls: 'text-right bg-yellow-50 text-yellow-700 font-semibold' },
                        { key: 'displayCt',      label: 'C/T(sec)',     cls: 'text-right bg-yellow-50 text-yellow-700 font-semibold' },
                        { key: 'machineName',    label: '추천 호기',    cls: 'text-center' },
                        { key: 'machineCapacity',label: '설비 용량',    cls: 'text-right' },
                        { key: 'clampingPct',    label: '형체력 활용률', cls: 'text-right' },
                      ] as const).map(col => (
                        <TableHead key={col.key} className={col.cls}>
                          <button onClick={() => handleSort(col.key)}
                            className="flex items-center gap-1 hover:text-blue-600 transition-colors w-full justify-end">
                            {col.label}
                            {sortKey === col.key
                              ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                              : <ArrowUpDown className="h-3 w-3 text-gray-300" />}
                          </button>
                        </TableHead>
                      ))}
                      <TableHead className="min-w-36">비고</TableHead>
                      <TableHead className="min-w-56 text-xs text-slate-500 font-normal">산출근거</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryRows.map(row => {
                      const isOptimal = row.clampingPct >= 60 && row.clampingPct <= 85
                      return (
                        <TableRow key={row.partNumber}>
                          <TableCell className="font-mono text-sm">{row.partNumber}</TableCell>
                          <TableCell className="font-medium">{row.partName}</TableCell>
                          <TableCell>
                            <Badge className={`${getMaterialColor(row.material)} border-0 text-xs`}>
                              {row.material}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right bg-yellow-50">
                            <span className="font-bold text-yellow-800">{row.expectedTon.toFixed(0)}T</span>
                          </TableCell>
                          <TableCell className="text-right bg-yellow-50">
                            {row.ctIsPredicted ? (
                              <span className="font-semibold text-blue-600">
                                {row.displayCt}s
                                <span className="text-xs font-normal text-gray-400 ml-1">(예측)</span>
                              </span>
                            ) : (
                              <span className="font-semibold text-yellow-800">{row.displayCt}s</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.machineName ? (
                              <span className="font-bold text-blue-700">{row.machineName}</span>
                            ) : (
                              <span className="text-red-500 text-xs">추천 없음</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm text-gray-500">
                            {row.machineCapacity > 0 ? `${row.machineCapacity}T` : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.hasRec ? (
                              <span className={`font-medium text-sm ${
                                isOptimal ? 'text-green-600' :
                                row.clampingPct > 100 ? 'text-red-600' : 'text-yellow-600'
                              }`}>
                                {row.clampingPct.toFixed(1)}%
                              </span>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="min-w-36">
                            <NoteCell
                              value={notesDraft[row.partId] ?? ''}
                              onChange={(v) => setNotesDraft(prev => ({ ...prev, [row.partId]: v }))}
                              onSave={() => saveNote(row.partId)}
                              saving={savingNoteId === row.partId}
                            />
                          </TableCell>
                          <TableCell className="min-w-56">
                            <div className="font-mono text-xs text-slate-500 space-y-1 leading-relaxed">
                              {/* 형체력 산출 */}
                              <div className="flex flex-wrap items-center gap-x-1">
                                <span className="text-slate-400 shrink-0">형체력</span>
                                <span>{row.calc.area}×{row.calc.resinP}×{row.calc.cavity}÷1000×{row.calc.safety}</span>
                                <span className="text-slate-300">=</span>
                                <span className="font-semibold text-slate-700">{row.expectedTon.toFixed(1)}T</span>
                              </div>
                              {/* 사출량 산출 */}
                              {row.calc.weight > 0 && (
                                <div className="flex flex-wrap items-center gap-x-1">
                                  <span className="text-slate-400 shrink-0">사출량</span>
                                  <span>({row.calc.weight}×{row.calc.cavity}+{row.calc.runner})÷0.8×{row.calc.corr}</span>
                                  <span className="text-slate-300">=</span>
                                  <span className="font-semibold text-slate-700">{row.calc.requiredShot}g</span>
                                </div>
                              )}
                              {/* C/T */}
                              <div className="flex items-center gap-x-1">
                                <span className="text-slate-400 shrink-0">C/T</span>
                                <span className={row.calc.ctIsPredicted ? 'text-blue-500' : 'text-slate-600'}>
                                  {row.calc.ctValue}sec{row.calc.ctIsPredicted ? ' (예측)' : ' (실측)'}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ────────────────── 파트별 상세 탭 ────────────────── */}
        <TabsContent value="detail" className="space-y-4 mt-4">
          {results.map(({ part, recommendations }) => (
            <Card key={part.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">{part.part_number}</code>
                    <span className="font-medium">{part.part_name}</span>
                    <Badge className={`${getMaterialColor(part.material)} border-0 text-xs`}>
                      {part.material}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {recommendations[0] && (
                      <span className="bg-yellow-100 text-yellow-800 font-bold px-2 py-0.5 rounded">
                        예상TON: {recommendations[0].required_clamping_force_ton.toFixed(0)}T
                      </span>
                    )}
                    {part.cycle_time_sec != null ? (
                      <span className="bg-yellow-100 text-yellow-800 font-bold px-2 py-0.5 rounded">
                        C/T: {part.cycle_time_sec}s
                      </span>
                    ) : (
                      <span className="bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded text-sm">
                        예상C/T: {predictCycleTime(part)}s
                        <span className="text-xs font-normal ml-1 opacity-70">(예측)</span>
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      투영면적: {part.projected_area_cm2}cm² × {part.cavity_count}캐
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {recommendations.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                    <AlertTriangle className="h-4 w-4" />
                    조건을 만족하는 설비가 없습니다. 설비 DB에 더 큰 설비를 추가하세요.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {recommendations.map(rec => (
                      <div key={rec.id} className={`p-4 rounded-lg border-2 ${rec.rank === 1 ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-lg">{RANK_ICON[rec.rank]}</span>
                          <div>
                            <p className="font-semibold text-sm">{rec.machine?.name}</p>
                            <p className="text-xs text-gray-500">{rec.machine?.clamping_force_ton}T / 사출량 {rec.machine?.shot_weight_max_g}g</p>
                            {(rec.machine?.motor_kw != null || rec.machine?.heater_kw != null) && (
                              <p className="text-xs text-gray-400">
                                모터 {rec.machine?.motor_kw ?? '-'}kW / 히터 {rec.machine?.heater_kw ?? '-'}kW
                              </p>
                            )}
                            {rec.machine?.mold_depth_min_mm != null && rec.machine.mold_depth_min_mm > 0 && (
                              <p className="text-xs text-gray-400">
                                금형두께 {rec.machine.mold_depth_min_mm}~{rec.machine.mold_depth_max_mm}mm
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <UtilizationBar value={rec.utilization_clamping_pct} label="형체력 활용률" />
                          <UtilizationBar value={rec.utilization_shot_pct} label="사출량 활용률" />
                        </div>
                        {rec.notes && <p className="text-xs text-gray-400 mt-2">{rec.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── 추천 근거 요약 ── */}
                <CalcSummary part={part} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ────────────────── 활용률 차트 탭 ────────────────── */}
        <TabsContent value="chart" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">파트별 1순위 설비 활용률</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="text-gray-500 text-sm">차트 데이터가 없습니다.</p>
              ) : (
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart data={chartData} margin={{ top: 10, right: 30, bottom: 60, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-30} textAnchor="end" tick={{ fontSize: 11 }} interval={0} />
                    <YAxis domain={[0, 110]} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      formatter={(value: number | undefined, name: string | undefined) => {
                        const pct = `${(value ?? 0).toFixed(1)}%`
                        const label = name === 'clamping' ? '형체력 활용률' : '사출량 활용률'
                        return [pct, label] as [string, string]
                      }}
                      labelFormatter={(label: unknown) => {
                        const s = String(label)
                        const item = chartData.find(d => d.name === s)
                        return item ? `${s} ${item.partName} (${item.machine})` : s
                      }}
                    />
                    <Legend formatter={v => v === 'clamping' ? '형체력 활용률' : '사출량 활용률'} />
                    <ReferenceLine y={60} stroke="#22c55e" strokeDasharray="4 4" label={{ value: '60%', fill: '#22c55e', fontSize: 11 }} />
                    <ReferenceLine y={85} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '85%', fill: '#f59e0b', fontSize: 11 }} />
                    <Bar dataKey="clamping" name="clamping" radius={[3, 3, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i}
                          fill={entry.clamping >= 60 && entry.clamping <= 85 ? '#3b82f6' : entry.clamping > 100 ? '#ef4444' : '#94a3b8'}
                        />
                      ))}
                    </Bar>
                    <Bar dataKey="shot" name="shot" fill="#a5b4fc" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <p className="text-xs text-gray-400 mt-2 text-center">
                파란 막대: 형체력 활용률 (60~85% 최적) | 보라 막대: 사출량 활용률
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ────────────────── 설비별 요약 탭 ────────────────── */}
        <TabsContent value="machine" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  설비별 배정 파트 수
                  <span className="text-xs font-normal text-gray-400">(호기 번호 내림차순)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {machineChartData.length === 0 ? (
                  <p className="text-gray-500 text-sm">데이터 없음</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, machineChartData.length * 36)}>
                    <BarChart data={machineChartData} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number | undefined) => [`${v ?? 0}개`, '배정 파트']} />
                      <Bar dataKey="count" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">설비별 파트 목록</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {machineChartData.map(({ name, count }) => (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{name}</span>
                        <Badge variant="secondary">{count}개</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {results
                          .filter(r => r.recommendations.find(rec => rec.rank === 1 && rec.machine?.name === name))
                          .map(r => (
                            <Badge key={r.part.id} variant="outline" className="text-xs">
                              {r.part.part_number}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  ))}
                  {noRecommendCount > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm text-red-600">추천 없음</span>
                        <Badge variant="destructive">{noRecommendCount}개</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {results
                          .filter(r => r.recommendations.length === 0)
                          .map(r => (
                            <Badge key={r.part.id} variant="outline" className="text-xs border-red-300 text-red-600">
                              {r.part.part_number}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 요약 통계 */}
          <Card className="mt-4">
            <CardHeader><CardTitle className="text-base">분석 요약</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{results.length}</p>
                  <p className="text-xs text-gray-500 mt-1">전체 파트</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">
                    {results.filter(r => {
                      const top = r.recommendations.find(rec => rec.rank === 1)
                      return top && top.utilization_clamping_pct >= 60 && top.utilization_clamping_pct <= 85
                    }).length}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">최적 범위 파트</p>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">{Object.keys(machineUsage).length}</p>
                  <p className="text-xs text-gray-500 mt-1">사용 설비 종류</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{noRecommendCount}</p>
                  <p className="text-xs text-gray-500 mt-1">추천 불가 파트</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
