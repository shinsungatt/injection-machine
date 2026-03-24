'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, FolderOpen, ArrowRight, Calendar, CheckCircle, Clock, FileEdit } from 'lucide-react'
import type { Project } from '@/lib/supabase'

type CustomerGroup = {
  name: string
  projects: Project[]
  latestAt: string
  completedCount: number
  analyzingCount: number
  draftCount: number
}

const STATUS_COLOR: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  analyzing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
}
const STATUS_LABEL: Record<string, string> = {
  draft: '초안', analyzing: '분석중', completed: '완료',
}

function groupByCustomer(projects: Project[]): CustomerGroup[] {
  const map = new Map<string, Project[]>()
  for (const p of projects) {
    const key = p.name || '(미입력)'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  return [...map.entries()]
    .map(([name, projs]) => {
      const sorted = [...projs].sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      return {
        name,
        projects: sorted,
        latestAt: sorted[0]?.updated_at ?? sorted[0]?.created_at ?? '',
        completedCount: projs.filter(p => p.status === 'completed').length,
        analyzingCount: projs.filter(p => p.status === 'analyzing').length,
        draftCount:     projs.filter(p => p.status === 'draft').length,
      }
    })
    .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
}

export default function CustomersPage() {
  const [groups, setGroups] = useState<CustomerGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => {
        setGroups(groupByCustomer(Array.isArray(data) ? data : []))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const toggle = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">로딩중...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">고객사 이력</h1>
        <p className="text-gray-500 mt-1">프로젝트명 기준으로 그룹화된 고객사별 모델 이력</p>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500">아직 프로젝트가 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <Card key={g.name} className="overflow-hidden">
              {/* 고객사 헤더 행 */}
              <CardHeader
                className="pb-3 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggle(g.name)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-blue-600 shrink-0" />
                    <div>
                      <CardTitle className="text-base">{g.name}</CardTitle>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        최근 활동: {new Date(g.latestAt).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                      모델 {g.projects.length}개
                    </span>
                    {g.completedCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        <CheckCircle className="h-3 w-3" /> 완료 {g.completedCount}
                      </span>
                    )}
                    {g.analyzingCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        <Clock className="h-3 w-3" /> 분석중 {g.analyzingCount}
                      </span>
                    )}
                    {g.draftCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        <FileEdit className="h-3 w-3" /> 초안 {g.draftCount}
                      </span>
                    )}
                    <ArrowRight
                      className={`h-4 w-4 text-gray-400 transition-transform ${expanded.has(g.name) ? 'rotate-90' : ''}`}
                    />
                  </div>
                </div>
              </CardHeader>

              {/* 모델 목록 (펼침) */}
              {expanded.has(g.name) && (
                <CardContent className="pt-0 pb-3">
                  <div className="border-t divide-y divide-gray-100">
                    {g.projects.map(p => (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        className="flex items-center justify-between px-2 py-3 hover:bg-gray-50 transition-colors rounded"
                      >
                        <div className="flex items-center gap-3">
                          <FolderOpen className="h-4 w-4 text-gray-400 shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{p.model_name}</p>
                            {p.description && (
                              <p className="text-xs text-gray-400 line-clamp-1">{p.description}</p>
                            )}
                            <p className="text-xs text-gray-400">
                              {new Date(p.created_at).toLocaleDateString('ko-KR')} 생성
                              {p.updated_at !== p.created_at && ` · ${new Date(p.updated_at).toLocaleDateString('ko-KR')} 수정`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`${STATUS_COLOR[p.status]} border-0 hover:${STATUS_COLOR[p.status]}`}>
                            {STATUS_LABEL[p.status]}
                          </Badge>
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
