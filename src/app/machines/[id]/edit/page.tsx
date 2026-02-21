'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import { MachineForm } from '@/components/MachineForm'
import type { Machine } from '@/lib/supabase'

export default function EditMachinePage({ params }: { params: Promise<{ id: string }> }) {
  const [machine, setMachine] = useState<Machine | null>(null)
  const [id, setId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    params.then(p => {
      setId(p.id)
      fetch(`/api/machines/${p.id}`)
        .then(r => r.json())
        .then(data => { setMachine(data); setLoading(false) })
    })
  }, [params])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">로딩중...</div>
  if (!machine) return <div className="text-center text-gray-500">설비를 찾을 수 없습니다.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/machines">
          <Button variant="ghost" size="icon"><ChevronLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">설비 수정</h1>
          <p className="text-gray-500 mt-0.5">{machine.name}</p>
        </div>
      </div>
      <MachineForm machine={machine} machineId={id} />
    </div>
  )
}
