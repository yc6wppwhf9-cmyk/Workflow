'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard,
  Package,
  Users,
  BarChart3,
  Settings,
  LogOut,
  ChevronRight,
  TrendingUp,
  GitBranch,
  Menu,
  X,
  FlaskConical,
  LineChart,
  Eye,
  Lightbulb,
  Megaphone,
  Pencil,
  Plus,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import { SAMPLE_APPROVER_EMAIL, type Profile } from '@/lib/types'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/products',  label: 'Products',  icon: Package },
  { href: '/reports',   label: 'Reports',   icon: BarChart3 },
]

const managementItems = [
  { href: '/management',          label: 'Management',       icon: TrendingUp },
  { href: '/pipeline',            label: 'Pipeline',         icon: GitBranch },
  { href: '/reports/management',  label: 'Management Review',icon: LineChart },
]

const adminItems = [
  { href: '/admin/users',    label: 'Users',    icon: Users },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  profile: Profile
}

export function Sidebar({ profile }: SidebarProps) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const isMyDesigns  = pathname === '/dashboard' && searchParams.get('f') === 'mywork'
  const [open, setOpen] = useState(false)

  // Close mobile drawer on route change
  useEffect(() => { setOpen(false) }, [pathname])

  function handleLogout() {
    window.location.href = '/api/auth/signout'
  }

  const navLink = (href: string, label: string, Icon: React.ElementType) => {
    // Dashboard link should not appear active when "My Designs" filter is active
    const active = href === '/dashboard'
      ? pathname === href && !isMyDesigns
      : pathname === href || pathname.startsWith(href + '/')
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group',
          active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
        {active && <ChevronRight className="h-3 w-3 ml-auto" />}
      </Link>
    )
  }

  const sidebarContent = (
    <aside className="w-64 flex flex-col bg-gray-900 text-white h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <Image src="/logo.png" alt="Logo" width={110} height={40} className="object-contain" priority />
        {/* Close button — mobile only */}
        <button
          onClick={() => setOpen(false)}
          className="lg:hidden text-gray-400 hover:text-white p-1 rounded"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Main</p>
        {navItems.map(({ href, label, icon }) => navLink(href, label, icon))}

        {profile.role === 'merchandising_head' && (
          <>
            <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-2">My Work</p>
            {navLink('/sampling-review', 'Sampling Review', FlaskConical)}
            {navLink('/merch-new-development', 'New Development', Lightbulb)}
            {navLink('/new-development', 'Create Development', Plus)}
          </>
        )}

        {['design_head'].includes(profile.role) && (
          <>
            <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-2">My Work</p>
            {navLink('/illustration-review', 'Review Queue', Eye)}
            <Link
              href="/dashboard?f=mywork"
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group',
                isMyDesigns ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <Pencil className="h-4 w-4 shrink-0" />
              My Designs
            </Link>
            {navLink('/new-development', 'New Development', Lightbulb)}
          </>
        )}

        {profile.role === 'sampling' && (
          <>
            <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-2">My Work</p>
            {navLink('/sampling-queue', 'Sampling Queue', FlaskConical)}
          </>
        )}

        {profile.role === 'merchandising' && (
          <>
            <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-2">My Work</p>
            {navLink('/new-development', 'New Development', Lightbulb)}
          </>
        )}

        {profile.email === SAMPLE_APPROVER_EMAIL && (
          <>
            <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-2">My Work</p>
            {navLink('/sample-approval', 'Sample Approval', CheckCircle2)}
          </>
        )}

        {profile.role === 'design' && (
          <>
            <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-2">My Work</p>
            {navLink('/new-development', 'New Development', Lightbulb)}
          </>
        )}

        {profile.role === 'purchase_head' && (
          <>
            <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-2">My Work</p>
            {navLink('/purchase-new-development', 'New Development', Lightbulb)}
          </>
        )}

        {['marketing', 'marketing_head'].includes(profile.role) && (
          <>
            <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-2">My Work</p>
            {navLink('/marketing', 'Marketing Queue', Megaphone)}
          </>
        )}

        {['management'].includes(profile.role) && (
          <>{navLink('/illustration-review', 'Illustration Review', Eye)}</>
        )}

        {['admin', 'management'].includes(profile.role) && (
          <>
            <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-2">Management</p>
            {managementItems.map(({ href, label, icon }) => navLink(href, label, icon))}
          </>
        )}

        {profile.role === 'admin' && (
          <>
            <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-2">New Development</p>
            {navLink('/new-development', 'Design Upload', Lightbulb)}
            {navLink('/merch-new-development', 'Merch View', Lightbulb)}
            {navLink('/purchase-new-development', 'Purchase View', Lightbulb)}
            <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-2">Admin</p>
            {adminItems.map(({ href, label, icon }) => navLink(href, label, icon))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-gray-800 p-3 shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback className="bg-gray-700 text-white text-xs">
              {getInitials(profile.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{profile.full_name}</p>
            <p className="text-xs text-gray-400 truncate capitalize">{profile.role.replace('_', ' ')}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded hover:bg-gray-700"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )

  return (
    <>
      {/* ── Mobile top bar ───────────────────────────────────────────── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-gray-900 flex items-center gap-3 px-4 border-b border-gray-800">
        <button
          onClick={() => setOpen(true)}
          className="text-gray-300 hover:text-white p-1 rounded"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        <Image src="/logo.png" alt="Logo" width={90} height={32} className="object-contain" priority />
      </div>

      {/* ── Mobile backdrop ──────────────────────────────────────────── */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Mobile slide-in drawer ───────────────────────────────────── */}
      <div className={cn(
        'lg:hidden fixed inset-y-0 left-0 z-50 transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        {sidebarContent}
      </div>

      {/* ── Desktop sidebar (always visible) ────────────────────────── */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen">
        {sidebarContent}
      </div>
    </>
  )
}
