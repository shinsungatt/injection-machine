'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { Machine } from '@/lib/supabase'

type Props = {
  machine?: Partial<Machine>
  machineId?: string
}

export function MachineForm({ machine, machineId }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: machine?.name ?? '',
    manufacturer: machine?.manufacturer ?? '',
    clamping_force_ton: machine?.clamping_force_ton?.toString() ?? '',
    shot_weight_max_g: machine?.shot_weight_max_g?.toString() ?? '',
    injection_pressure_max_mpa: machine?.injection_pressure_max_mpa?.toString() ?? '',
    platen_width_mm: machine?.platen_width_mm?.toString() ?? '',
    platen_height_mm: machine?.platen_height_mm?.toString() ?? '',
    tie_bar_x_mm: machine?.tie_bar_x_mm?.toString() ?? '',
    tie_bar_y_mm: machine?.tie_bar_y_mm?.toString() ?? '',
    daylight_max_mm: machine?.daylight_max_mm?.toString() ?? '',
    screw_diameter_mm: machine?.screw_diameter_mm?.toString() ?? '',
    notes: machine?.notes ?? '',
    is_active: machine?.is_active ?? true,
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.clamping_force_ton || !form.shot_weight_max_g) {
      toast.error('필수 항목을 입력하세요.')
      return
    }
    setSaving(true)

    const payload = {
      name: form.name,
      manufacturer: form.manufacturer,
      clamping_force_ton: parseFloat(form.clamping_force_ton),
      shot_weight_max_g: parseFloat(form.shot_weight_max_g),
      injection_pressure_max_mpa: parseFloat(form.injection_pressure_max_mpa || '0'),
      platen_width_mm: parseFloat(form.platen_width_mm || '0'),
      platen_height_mm: parseFloat(form.platen_height_mm || '0'),
      tie_bar_x_mm: parseFloat(form.tie_bar_x_mm || '0'),
      tie_bar_y_mm: parseFloat(form.tie_bar_y_mm || '0'),
      daylight_max_mm: parseFloat(form.daylight_max_mm || '0'),
      screw_diameter_mm: parseFloat(form.screw_diameter_mm || '0'),
      notes: form.notes || null,
      is_active: form.is_active,
    }

    const url = machineId ? `/api/machines/${machineId}` : '/api/machines'
    const method = machineId ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setSaving(false)
    if (res.ok) {
      toast.success(machineId ? '설비가 수정되었습니다.' : '설비가 등록되었습니다.')
      router.push('/machines')
    } else {
      const err = await res.json()
      toast.error(err.error || '저장 실패')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="name">설비명 *</Label>
            <Input id="name" name="name" value={form.name} onChange={handleChange}
              placeholder="예: LS Electric 250T" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manufacturer">제조사</Label>
            <Input id="manufacturer" name="manufacturer" value={form.manufacturer} onChange={handleChange}
              placeholder="예: LS Electric" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clamping_force_ton">형체력 (ton) *</Label>
            <Input id="clamping_force_ton" name="clamping_force_ton" type="number" step="0.1"
              value={form.clamping_force_ton} onChange={handleChange} placeholder="예: 250" required />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">사출 사양</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="shot_weight_max_g">최대 사출량 (g, PS기준) *</Label>
            <Input id="shot_weight_max_g" name="shot_weight_max_g" type="number" step="0.1"
              value={form.shot_weight_max_g} onChange={handleChange} placeholder="예: 650" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="injection_pressure_max_mpa">최대 사출압력 (MPa)</Label>
            <Input id="injection_pressure_max_mpa" name="injection_pressure_max_mpa" type="number" step="0.1"
              value={form.injection_pressure_max_mpa} onChange={handleChange} placeholder="예: 200" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="screw_diameter_mm">스크류 직경 (mm)</Label>
            <Input id="screw_diameter_mm" name="screw_diameter_mm" type="number" step="0.1"
              value={form.screw_diameter_mm} onChange={handleChange} placeholder="예: 55" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">금형 수용 사양</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="platen_width_mm">형판 너비 (mm)</Label>
            <Input id="platen_width_mm" name="platen_width_mm" type="number" step="0.1"
              value={form.platen_width_mm} onChange={handleChange} placeholder="예: 620" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="platen_height_mm">형판 높이 (mm)</Label>
            <Input id="platen_height_mm" name="platen_height_mm" type="number" step="0.1"
              value={form.platen_height_mm} onChange={handleChange} placeholder="예: 620" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tie_bar_x_mm">타이바 간격 X (mm)</Label>
            <Input id="tie_bar_x_mm" name="tie_bar_x_mm" type="number" step="0.1"
              value={form.tie_bar_x_mm} onChange={handleChange} placeholder="예: 460" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tie_bar_y_mm">타이바 간격 Y (mm)</Label>
            <Input id="tie_bar_y_mm" name="tie_bar_y_mm" type="number" step="0.1"
              value={form.tie_bar_y_mm} onChange={handleChange} placeholder="예: 460" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="daylight_max_mm">최대 데이라이트 (mm)</Label>
            <Input id="daylight_max_mm" name="daylight_max_mm" type="number" step="0.1"
              value={form.daylight_max_mm} onChange={handleChange} placeholder="예: 1000" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">기타</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="notes">비고</Label>
            <Textarea id="notes" name="notes" value={form.notes} onChange={handleChange}
              placeholder="설비 관련 특이사항..." rows={2} />
          </div>
          <Separator />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" name="is_active" checked={form.is_active}
              onChange={handleChange} className="w-4 h-4" />
            <span className="text-sm">활성 상태 (추천 대상에 포함)</span>
          </label>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? '저장중...' : (machineId ? '수정 저장' : '설비 등록')}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/machines')}>
          취소
        </Button>
      </div>
    </form>
  )
}
