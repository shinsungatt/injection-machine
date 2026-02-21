'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeft } from 'lucide-react'

export default function NewProjectPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', model_name: '', description: '' })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.model_name) { toast.error('필수 항목을 입력하세요.'); return }
    setSaving(true)
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) {
      const data = await res.json()
      toast.success('프로젝트가 생성되었습니다.')
      router.push(`/projects/${data.id}`)
    } else {
      const err = await res.json()
      toast.error(err.error || '생성 실패')
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-3">
        <Link href="/projects">
          <Button variant="ghost" size="icon"><ChevronLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">새 프로젝트</h1>
          <p className="text-gray-500 mt-0.5">신규 모델 개발 프로젝트를 생성합니다</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader><CardTitle className="text-base">프로젝트 정보</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">프로젝트명 *</Label>
              <Input id="name" name="name" value={form.name} onChange={handleChange}
                placeholder="예: 2024 신차 내장 파트 설비 선정" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model_name">모델명 *</Label>
              <Input id="model_name" name="model_name" value={form.model_name} onChange={handleChange}
                placeholder="예: MODEL-X2024" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">설명</Label>
              <Textarea id="description" name="description" value={form.description} onChange={handleChange}
                placeholder="프로젝트 설명 (선택)" rows={3} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>{saving ? '생성중...' : '프로젝트 생성'}</Button>
              <Button type="button" variant="outline" onClick={() => router.push('/projects')}>취소</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
