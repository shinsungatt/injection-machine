'use client'

import { useEffect, useState } from 'react'
import { Users, Shield, ShieldOff, RefreshCw, Factory } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

type Profile = {
  id: string
  email: string
  display_name: string | null
  role: 'admin' | 'user'
  created_at: string
}

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchUsers = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    if (res.ok) {
      setProfiles(await res.json())
    } else {
      toast.error('사용자 목록을 불러오지 못했습니다.')
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const toggleRole = async (profile: Profile) => {
    const newRole = profile.role === 'admin' ? 'user' : 'admin'
    const action = newRole === 'admin' ? '관리자로 승격' : '일반 사용자로 변경'

    if (!confirm(`${profile.display_name ?? profile.email} 을(를) ${action}하시겠습니까?`)) return

    setUpdating(profile.id)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: profile.id, role: newRole }),
    })

    if (res.ok) {
      toast.success(`${action}되었습니다.`)
      setProfiles(prev =>
        prev.map(p => (p.id === profile.id ? { ...p, role: newRole } : p))
      )
    } else {
      const { error } = await res.json()
      toast.error(error ?? '역할 변경에 실패했습니다.')
    }
    setUpdating(null)
  }

  const adminCount = profiles.filter(p => p.role === 'admin').length
  const userCount = profiles.filter(p => p.role === 'user').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-700">
              <Factory className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium">사출설비 선택 시스템</span>
            </Link>
            <span className="text-gray-300">/</span>
            <div className="flex items-center gap-1.5 text-gray-900 font-medium">
              <Users className="h-5 w-5 text-blue-600" />
              <span>사용자 관리</span>
            </div>
          </div>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">전체 사용자</p>
            <p className="text-2xl font-bold text-gray-900">{profiles.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">관리자</p>
            <p className="text-2xl font-bold text-blue-600">{adminCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">일반 사용자</p>
            <p className="text-2xl font-bold text-gray-700">{userCount}</p>
          </div>
        </div>

        {/* 사용자 테이블 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">사용자 목록</h2>
            <p className="text-sm text-gray-500 mt-0.5">권한 버튼을 클릭하여 역할을 변경하세요.</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              불러오는 중...
            </div>
          ) : profiles.length === 0 ? (
            <div className="text-center py-16 text-gray-400">사용자가 없습니다.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">이메일</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">역할</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">가입일</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">권한 변경</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {profiles.map(profile => (
                  <tr key={profile.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {profile.display_name ?? '(미설정)'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{profile.email}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          profile.role === 'admin'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {profile.role === 'admin' ? (
                          <Shield className="h-3 w-3" />
                        ) : (
                          <Users className="h-3 w-3" />
                        )}
                        {profile.role === 'admin' ? '관리자' : '일반 사용자'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(profile.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleRole(profile)}
                        disabled={updating === profile.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          profile.role === 'admin'
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                        }`}
                      >
                        {updating === profile.id ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : profile.role === 'admin' ? (
                          <ShieldOff className="h-3.5 w-3.5" />
                        ) : (
                          <Shield className="h-3.5 w-3.5" />
                        )}
                        {profile.role === 'admin' ? '관리자 해제' : '관리자 승격'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
