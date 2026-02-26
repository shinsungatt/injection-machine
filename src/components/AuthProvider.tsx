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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const loadProfile = async (userId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
    setRole((data?.role as UserRole) ?? 'user')
  }

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user)
      if (user) await loadProfile(user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUser = session?.user ?? null
        setUser(currentUser)
        if (currentUser) {
          await loadProfile(currentUser.id)
        } else {
          setRole(null)
        }
        // INITIAL_SESSION은 페이지 로드 시 기존 세션 복원 이벤트.
        // router.refresh()를 호출하면 React 트리가 재조정되며 role 상태가 초기화될 수 있음.
        if (event !== 'INITIAL_SESSION') {
          router.refresh()
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router])

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
