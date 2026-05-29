import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Handles Supabase's inconsistent join shape (scalar vs array) from PostgREST
export function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

export function daysSince(date?: string | null): number {
  if (!date) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000))
}

export function isOverdue(date?: string | null): boolean {
  if (!date) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return target < today
}

const SHORT_DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })
const LONG_DATE_FMT  = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
const DATETIME_FMT   = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function formatShortDate(date: string | Date): string {
  return SHORT_DATE_FMT.format(new Date(date))
}

export function formatDate(date: string | Date): string {
  return LONG_DATE_FMT.format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return DATETIME_FMT.format(new Date(date))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function extractStoragePath(fileUrl: string, bucketName: string): string | null {
  if (!fileUrl.startsWith('http')) return fileUrl
  const marker = `/${bucketName}/`
  const idx = fileUrl.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(fileUrl.slice(idx + marker.length).split('?')[0])
}
