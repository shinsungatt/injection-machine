import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/components/AuthProvider'
import { createClient } from '@/lib/supabase-server'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '사출설비 선택 시스템',
  description: '파트리스트 기반 최적 사출성형 설비 자동 추천 시스템',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // role만 전달 (User 객체 직렬화 시 hydration 오류 방지)
  let initialRole: 'admin' | 'user' | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    initialRole = (profile?.role as 'admin' | 'user') ?? 'user'
  }

  return (
    <html lang="ko">
      <body className={`${geist.className} antialiased bg-gray-50 min-h-screen`}>
        <AuthProvider initialRole={initialRole}>
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </body>
    </html>
  )
}
