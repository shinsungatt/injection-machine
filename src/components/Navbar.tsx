'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Factory, FolderOpen, LayoutDashboard, BookOpen } from 'lucide-react'

const navItems = [
  { href: '/', label: '대시보드', icon: LayoutDashboard },
  { href: '/machines', label: '설비 관리', icon: Factory },
  { href: '/projects', label: '프로젝트', icon: FolderOpen },
]

export function Navbar() {
  const pathname = usePathname()

  return (
    <nav className="border-b bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <Factory className="h-7 w-7 text-blue-600" />
            <span className="font-bold text-lg text-gray-900">사출설비 선택 시스템</span>
          </div>
          <div className="flex gap-1 items-center">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  pathname === href || (href !== '/' && pathname.startsWith(href))
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
            <a
              href="/manual.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors bg-green-600 text-white hover:bg-green-700 ml-2"
            >
              <BookOpen className="h-4 w-4" />
              사용설명서
            </a>
          </div>
        </div>
      </div>
    </nav>
  )
}
