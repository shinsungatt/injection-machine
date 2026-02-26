'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Factory, Eye, EyeOff, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase-browser'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      toast.error(
        error.message === 'Invalid login credentials'
          ? '이메일 또는 비밀번호가 올바르지 않습니다.'
          : error.message
      )
      setLoading(false)
      return
    }

    toast.success('로그인 되었습니다.')
    router.push(next)
    router.refresh()
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          이메일
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="example@company.com"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          비밀번호
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="비밀번호 입력"
            className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
      >
        {loading ? (
          <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <LogIn className="h-4 w-4" />
        )}
        {loading ? '로그인 중...' : '로그인'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Factory className="h-8 w-8 text-blue-600" />
            <span className="font-bold text-xl text-gray-900">사출설비 선택 시스템</span>
          </div>
          <p className="text-gray-500 text-sm">계정에 로그인하세요</p>
        </div>

        {/* 카드 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-xl font-semibold text-gray-900 mb-6">로그인</h1>

          <Suspense fallback={<div className="h-40 animate-pulse bg-gray-100 rounded-lg" />}>
            <LoginForm />
          </Suspense>

          <p className="text-center text-sm text-gray-500 mt-6">
            계정이 없으신가요?{' '}
            <Link href="/auth/signup" className="text-blue-600 hover:underline font-medium">
              회원가입
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
