'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeft, FileText, ExternalLink } from 'lucide-react'
import { calcRequiredClampingForce, calcRequiredShotWeight, parseProductSize, calcMoldSizeFromProduct, productDimsToProjectedArea } from '@/lib/algorithm'
import type { Part } from '@/lib/supabase'

type PdfFile = { id: string; name: string; file_url: string | null }

const MATERIALS = ['PP', 'ABS', 'PA66', 'PA', 'PC', 'POM', 'PE', 'PS', 'PET', 'TPE']

const emptyForm = {
  part_number: '', part_name: '', material: 'ABS',
  part_weight_g: '', projected_area_cm2: '', cavity_count: '1', runner_weight_g: '',
  product_width_mm: '', product_height_mm: '', product_depth_mm: '',
  mold_width_mm: '', mold_height_mm: '', mold_depth_mm: '',
}

export default function NewPartPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [pdfs, setPdfs] = useState<PdfFile[]>([])
  const composingRef = useRef(false)

  useEffect(() => {
    params.then(({ id }) => {
      fetch(`/api/projects/${id}/files?type=pdf`)
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setPdfs(data.filter(f => f.file_url)) })
    })
  }, [params])

  // 제품 사이즈 일괄 입력 파싱 (예: "100×200×50")
  const handleProductSizeInput = useCallback((raw: string) => {
    const parsed = parseProductSize(raw)
    if (!parsed) return
    setForm(prev => ({
      ...prev,
      product_width_mm:  String(parsed.width),
      product_height_mm: String(parsed.height),
      product_depth_mm:  parsed.depth > 0 ? String(parsed.depth) : prev.product_depth_mm,
    }))
  }, [])

  // 제품 치수 변경 시 투영면적·금형 크기 자동 계산
  useEffect(() => {
    const w = parseFloat(form.product_width_mm)  || 0
    const h = parseFloat(form.product_height_mm) || 0
    const c = parseInt(form.cavity_count)        || 1
    if (w <= 0 || h <= 0) return

    const area = productDimsToProjectedArea(w, h)
    const mold = calcMoldSizeFromProduct(w, h, c)

    setForm(prev => {
      // 값이 바뀐 경우만 업데이트 (무한 루프 방지)
      if (
        prev.projected_area_cm2 === String(area) &&
        prev.mold_width_mm      === String(mold.width) &&
        prev.mold_height_mm     === String(mold.height)
      ) return prev
      return {
        ...prev,
        projected_area_cm2: String(area),
        mold_width_mm:      String(mold.width),
        mold_height_mm:     String(mold.height),
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.product_width_mm, form.product_height_mm, form.cavity_count])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (composingRef.current) return
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false
    const target = e.target as HTMLInputElement
    setForm(prev => ({ ...prev, [target.name]: target.value }))
  }

  // 실시간 계산 미리보기
  const previewPart: Partial<Part> = {
    part_weight_g: parseFloat(form.part_weight_g) || 0,
    projected_area_cm2: parseFloat(form.projected_area_cm2) || 0,
    cavity_count: parseInt(form.cavity_count) || 1,
    runner_weight_g: parseFloat(form.runner_weight_g) || (parseFloat(form.part_weight_g) || 0) * 0.15,
    material: form.material,
  }

  const previewClamping = previewPart.projected_area_cm2! > 0
    ? calcRequiredClampingForce(previewPart as Part).toFixed(1) : '-'
  const previewShot = previewPart.part_weight_g! > 0
    ? calcRequiredShotWeight(previewPart as Part).toFixed(1) : '-'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { id } = await params
    if (!form.part_number || !form.part_name || !form.part_weight_g || !form.projected_area_cm2) {
      toast.error('필수 항목을 입력하세요.')
      return
    }
    setSaving(true)
    const payload = {
      part_number: form.part_number,
      part_name: form.part_name,
      material: form.material,
      part_weight_g: parseFloat(form.part_weight_g),
      projected_area_cm2: parseFloat(form.projected_area_cm2),
      cavity_count: parseInt(form.cavity_count) || 1,
      runner_weight_g: form.runner_weight_g ? parseFloat(form.runner_weight_g) : undefined,
      mold_width_mm: form.mold_width_mm ? parseFloat(form.mold_width_mm) : null,
      mold_height_mm: form.mold_height_mm ? parseFloat(form.mold_height_mm) : null,
      mold_depth_mm: form.mold_depth_mm ? parseFloat(form.mold_depth_mm) : null,
    }
    const res = await fetch(`/api/projects/${id}/parts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) {
      toast.success('파트가 등록되었습니다.')
      router.push(`/projects/${id}`)
    } else {
      const err = await res.json()
      toast.error(err.error || '등록 실패')
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={async () => {
          const { id } = await params; router.push(`/projects/${id}`)
        }}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">파트 수동 입력</h1>
          <p className="text-gray-500 mt-0.5">새 파트를 직접 입력합니다</p>
        </div>
      </div>

      {/* 업로드된 도면 PDF 참조 패널 */}
      {pdfs.length > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm text-amber-700 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              도면 PDF — 투영면적 및 C/T 참조용
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 flex flex-wrap gap-2">
            {pdfs.map(pdf => (
              <a key={pdf.id} href={pdf.file_url!} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs bg-white border border-amber-300 rounded-md px-3 py-1.5 text-amber-800 hover:bg-amber-100 transition-colors">
                <FileText className="h-3 w-3" />
                {pdf.name}
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            ))}
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 제품 사이즈 입력 → 투영면적·금형 크기 자동 계산 */}
        <Card className="border-indigo-200 bg-indigo-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-indigo-800">제품 사이즈 (mm)</CardTitle>
            <p className="text-xs text-indigo-500">
              입력하면 투영면적과 금형 크기가 자동 계산됩니다.&nbsp;
              <span className="font-medium">일괄 입력:</span>&nbsp;
              <button type="button" className="underline text-indigo-600 hover:text-indigo-800"
                onClick={() => {
                  const raw = prompt('제품 사이즈 입력 (예: 100×200×50 또는 100x200x50)')
                  if (raw) handleProductSizeInput(raw)
                }}>
                가로×세로×높이 붙여넣기
              </button>
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="product_width_mm">가로 (mm)</Label>
              <Input id="product_width_mm" name="product_width_mm" type="number" step="0.1"
                value={form.product_width_mm} onChange={handleChange}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={handleCompositionEnd}
                placeholder="예: 150" className="bg-white" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product_height_mm">세로 (mm)</Label>
              <Input id="product_height_mm" name="product_height_mm" type="number" step="0.1"
                value={form.product_height_mm} onChange={handleChange}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={handleCompositionEnd}
                placeholder="예: 200" className="bg-white" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product_depth_mm">높이 (mm)</Label>
              <Input id="product_depth_mm" name="product_depth_mm" type="number" step="0.1"
                value={form.product_depth_mm} onChange={handleChange}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={handleCompositionEnd}
                placeholder="예: 50" className="bg-white" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">파트 기본 정보</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="part_number">파트 번호 *</Label>
              <Input id="part_number" name="part_number" value={form.part_number} onChange={handleChange}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={handleCompositionEnd}
                placeholder="예: P-001" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="part_name">파트명 *</Label>
              <Input id="part_name" name="part_name" value={form.part_name} onChange={handleChange}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={handleCompositionEnd}
                placeholder="예: 도어 인너 트림" required />
            </div>
            <div className="space-y-1.5">
              <Label>재료 *</Label>
              <Select value={form.material} onValueChange={v => setForm(p => ({ ...p, material: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MATERIALS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cavity_count">캐비티 수 *</Label>
              <Input id="cavity_count" name="cavity_count" type="number" min="1"
                value={form.cavity_count} onChange={handleChange} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="part_weight_g">파트 중량 (g) *</Label>
              <Input id="part_weight_g" name="part_weight_g" type="number" step="0.001"
                value={form.part_weight_g} onChange={handleChange} placeholder="예: 250.5" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="projected_area_cm2">
                투영면적 (cm²) *
                {form.product_width_mm && form.product_height_mm &&
                  <span className="ml-1.5 text-xs font-normal text-indigo-500">자동계산</span>}
              </Label>
              <Input id="projected_area_cm2" name="projected_area_cm2" type="number" step="0.01"
                value={form.projected_area_cm2} onChange={handleChange} placeholder="예: 180.0" required
                className={form.product_width_mm && form.product_height_mm ? 'bg-indigo-50 border-indigo-200' : ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="runner_weight_g">런너 중량 (g)</Label>
              <Input id="runner_weight_g" name="runner_weight_g" type="number" step="0.001"
                value={form.runner_weight_g} onChange={handleChange}
                placeholder={`기본값: 파트중량×0.15 = ${((parseFloat(form.part_weight_g)||0)*0.15).toFixed(1)}g`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              금형 크기 (선택)
              {form.product_width_mm && form.product_height_mm &&
                <span className="ml-2 text-xs font-normal text-indigo-500">
                  제품 사이즈 기준 자동 추정 (외곽 100mm + 캐비티 간 60mm)
                </span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="mold_width_mm">가로 (mm)</Label>
              <Input id="mold_width_mm" name="mold_width_mm" type="number" step="0.1"
                value={form.mold_width_mm} onChange={handleChange} placeholder="예: 450"
                className={form.product_width_mm && form.product_height_mm ? 'bg-indigo-50 border-indigo-200' : ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mold_height_mm">세로 (mm)</Label>
              <Input id="mold_height_mm" name="mold_height_mm" type="number" step="0.1"
                value={form.mold_height_mm} onChange={handleChange} placeholder="예: 380"
                className={form.product_width_mm && form.product_height_mm ? 'bg-indigo-50 border-indigo-200' : ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mold_depth_mm">두께 (mm)</Label>
              <Input id="mold_depth_mm" name="mold_depth_mm" type="number" step="0.1"
                value={form.mold_depth_mm} onChange={handleChange} placeholder="예: 250" />
            </div>
          </CardContent>
        </Card>

        {/* 실시간 계산 미리보기 */}
        {(previewClamping !== '-' || previewShot !== '-') && (
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader><CardTitle className="text-sm text-blue-700">계산 미리보기</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-blue-600">필요 형체력</p>
                <p className="text-xl font-bold text-blue-800">{previewClamping} <span className="text-sm font-normal">ton</span></p>
              </div>
              <div>
                <p className="text-xs text-blue-600">필요 사출량 (PS 기준)</p>
                <p className="text-xl font-bold text-blue-800">{previewShot} <span className="text-sm font-normal">g</span></p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>{saving ? '저장중...' : '파트 등록'}</Button>
          <Button type="button" variant="outline" onClick={async () => {
            const { id } = await params; router.push(`/projects/${id}`)
          }}>취소</Button>
        </div>
      </form>
    </div>
  )
}
