'use client'

import { useEffect, useState } from 'react'
import { Users, Shield, ShieldOff, RefreshCw, Factory, CheckCircle, XCircle, Clock } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

type Profile = {
  id: string
  email: string
  display_name: string | null
  role: 'admin' | 'user'
  status: 'pending' | 'approved'
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
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? '사용자 목록을 불러오지 못했습니다.')
    }
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  const updateUser = async (profile: Profile, updates: { role?: string; status?: string }) => {
    setUpdating(profile.id)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: profile.id, ...updates }),
    })

    if (res.ok) {
      setProfiles(prev =>
        prev.map(p => (p.id === profile.id ? { ...p, ...updates } as Profile : p))
      )
    } else {
      const { error } = await res.json()
      toast.error(error ?? '변경에 실패했습니다.')
    }
    setUpdating(null)
  }

  const approveUser = (profile: Profile) => {
    updateUser(profile, { status: 'approved' })
    toast.success(`${profile.display_name ?? profile.email} 승인되었습니다.`)
  }

  const revokeUser = (profile: Profile) => {
    if (!confirm(`${profile.display_name ?? profile.email} 의 접근을 차단하시겠습니까?`)) return
    updateUser(profile, { status: 'pending' })
    toast.success('접근이 차단되었습니다.')
  }

  const toggleRole = (profile: Profile) => {
    const newRole = profile.role === 'admin' ? 'user' : 'admin'
    if (!confirm(`${profile.display_name ?? profile.email} 을(를) ${newRole === 'admin' ? '관리자로 승격' : '일반 사용자로 변경'}하시겠습니까?`)) return
    updateUser(profile, { role: newRole })
    toast.success('역할이 변경되었습니다.')
  }

  const pendingList = profiles.filter(p => p.status === 'pending')
  const approvedList = profiles.filter(p => p.status === 'approved')

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

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* 통계 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">전체 사용자</p>
            <p className="text-2xl font-bold text-gray-900">{profiles.length}</p>
          </div>
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-5">
            <p className="text-sm text-yellow-700 mb-1">승인 대기</p>
            <p className="text-2xl font-bold text-yellow-600">{pendingList.length}</p>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-5">
            <p className="text-sm text-green-700 mb-1">승인 완료</p>
            <p className="text-2xl font-bold text-green-600">{approvedList.length}</p>
          </div>
        </div>

        {/* 승인 대기 */}
        {pendingList.length > 0 && (
          <div className="bg-white rounded-xl border border-yellow-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-yellow-100 bg-yellow-50 flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <h2 className="font-semibold text-yellow-800">승인 대기 ({pendingList.length}명)</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">이름</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">이메일</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">가입일</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">승인</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingList.map(profile => (
                  <tr key={profile.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{profile.display_name ?? '(미설정)'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{profile.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(profile.created_at).toLocaleDateString('ko-KR')}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => approveUser(profile)}
                        disabled={updating === profile.id}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white rounded-md text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {updating === profile.id
                          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          : <CheckCircle className="h-3.5 w-3.5" />
                        }
                        승인
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 승인된 사용자 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">승인된 사용자 ({approvedList.length}명)</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />불러오는 중...
            </div>
          ) : approvedList.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">승인된 사용자가 없습니다.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">이름</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">이메일</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">역할</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">가입일</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {approvedList.map(profile => (
                  <tr key={profile.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{profile.display_name ?? '(미설정)'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{profile.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        profile.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {profile.role === 'admin' ? <Shield className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                        {profile.role === 'admin' ? '관리자' : '일반 사용자'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(profile.created_at).toLocaleDateString('ko-KR')}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleRole(profile)}
                          disabled={updating === profile.id}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
                            profile.role === 'admin'
                              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                          }`}
                        >
                          {updating === profile.id
                            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            : profile.role === 'admin'
                              ? <ShieldOff className="h-3.5 w-3.5" />
                              : <Shield className="h-3.5 w-3.5" />
                          }
                          {profile.role === 'admin' ? '관리자 해제' : '관리자 승격'}
                        </button>
                        {profile.role !== 'admin' && (
                          <button
                            onClick={() => revokeUser(profile)}
                            disabled={updating === profile.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            차단
                          </button>
                        )}
                      </div>
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
