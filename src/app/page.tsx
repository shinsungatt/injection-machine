'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Factory, FolderOpen, Plus, ArrowRight, CheckCircle, BookOpen, Building2 } from 'lucide-react'
import type { Project, Machine } from '@/lib/supabase'

const STATUS_LABEL: Record<string, string> = {
  draft: '초안',
  analyzing: '분석중',
  completed: '완료',
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then(r => r.json()),
      fetch('/api/machines').then(r => r.json()),
    ]).then(([p, m]) => {
      setProjects(Array.isArray(p) ? p : [])
      setMachines(Array.isArray(m) ? m : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">로딩중...</div>
  }

  const activeMachines = machines.filter(m => m.is_active).length
  const completedProjects = projects.filter(p => p.status === 'completed').length
  const customerCount = new Set(projects.map(p => p.name).filter(Boolean)).size

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-gray-500 mt-1">사출성형 설비 선택 시스템에 오신 것을 환영합니다</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">등록 설비</CardTitle>
            <Factory className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeMachines}</div>
            <p className="text-sm text-gray-500 mt-1">활성 설비 대수</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">전체 프로젝트</CardTitle>
            <FolderOpen className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{projects.length}</div>
            <p className="text-sm text-gray-500 mt-1">등록된 프로젝트 수</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">분석 완료</CardTitle>
            <CheckCircle className="h-5 w-5 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{completedProjects}</div>
            <p className="text-sm text-gray-500 mt-1">추천 완료 프로젝트</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">고객사</CardTitle>
            <Building2 className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{customerCount}</div>
            <p className="text-sm text-gray-500 mt-1">등록 고객사 수</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>빠른 실행</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link href="/projects/new">
              <Button className="w-full justify-start gap-2">
                <Plus className="h-4 w-4" /> 새 프로젝트 생성
              </Button>
            </Link>
            <Link href="/machines/new">
              <Button variant="outline" className="w-full justify-start gap-2">
                <Factory className="h-4 w-4" /> 설비 등록
              </Button>
            </Link>
            <Link href="/machines">
              <Button variant="outline" className="w-full justify-start gap-2">
                <Factory className="h-4 w-4" /> 설비 목록 보기
              </Button>
            </Link>
            <Link href="/manual.html">
              <Button variant="outline" className="w-full justify-start gap-2">
                <BookOpen className="h-4 w-4" /> 사용설명서 보기
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>최근 프로젝트</CardTitle>
            <Link href="/projects">
              <Button variant="ghost" size="sm">전체 보기</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-gray-500 text-sm">프로젝트가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {projects.slice(0, 5).map(p => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="block">
                    <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                      <div>
                        <p className="font-medium text-sm">{p.name}</p>
                        <p className="text-xs text-gray-500">{p.model_name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={p.status === 'completed' ? 'default' : 'secondary'}
                          className={p.status === 'completed' ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}
                        >
                          {STATUS_LABEL[p.status]}
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
