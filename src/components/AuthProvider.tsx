'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

type UserRole = 'admin' | 'user'

type AuthContextType = {
  user: User | null
  role: UserRole | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  signOut: async () => {},
})

type AuthProviderProps = {
  children: React.ReactNode
  initialUser: User | null
  initialRole: UserRole | null
}

export function AuthProvider({ children, initialUser, initialRole }: AuthProviderProps) {
  // 서버에서 읽어온 초기값으로 시작 → 클라이언트 쿠키 파싱 불필요
  const [user, setUser] = useState<User | null>(initialUser)
  const [role, setRole] = useState<UserRole | null>(initialRole)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let mounted = true

    const loadProfile = async (userId: string) => {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()
      if (mounted) setRole((data?.role as UserRole) ?? 'user')
    }

    // 로그인 이후 변경만 처리 (초기값은 서버에서 이미 전달됨)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted || event === 'INITIAL_SESSION') return
        const currentUser = session?.user ?? null
        setUser(currentUser)
        if (currentUser) {
          await loadProfile(currentUser.id)
          router.refresh()
        } else {
          setRole(null)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [router])

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    // router.push 대신 full reload → 서버 쿠키 완전 초기화 보장
    window.location.href = '/auth/login'
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
