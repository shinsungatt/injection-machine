import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import { MachineForm } from '@/components/MachineForm'

export default function NewMachinePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/machines">
          <Button variant="ghost" size="icon"><ChevronLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">설비 등록</h1>
          <p className="text-gray-500 mt-0.5">새로운 사출성형 설비를 등록합니다</p>
        </div>
      </div>
      <MachineForm />
    </div>
  )
}
