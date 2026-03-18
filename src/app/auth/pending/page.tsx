'use client'

import { Factory, Clock, LogOut } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'

export default function PendingPage() {
  const { signOut } = useAuth()

  const handleSignOut = () => {
    signOut()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Factory className="h-8 w-8 text-blue-600" />
          <span className="font-bold text-xl text-gray-900">사출설비 선택 시스템</span>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center justify-center w-16 h-16 bg-yellow-100 rounded-full mx-auto mb-4">
            <Clock className="h-8 w-8 text-yellow-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">승인 대기 중</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            회원가입이 완료되었습니다.<br />
            관리자 승인 후 시스템을 이용하실 수 있습니다.<br />
            담당자에게 문의해 주세요.
          </p>

          <button
            onClick={handleSignOut}
            className="mt-6 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>
      </div>
    </div>
  )
}
