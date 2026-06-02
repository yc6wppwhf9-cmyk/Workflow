'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'

interface DateInputProps {
  value: string          // ISO: YYYY-MM-DD
  onChange: (iso: string) => void
  disabled?: boolean
  className?: string
}

function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

function displayToIso(display: string): string {
  const parts = display.split('/')
  if (parts.length === 3) {
    const [d, m, y] = parts
    if (d.length === 2 && m.length === 2 && y.length === 4) {
      return `${y}-${m}-${d}`
    }
  }
  return ''
}

export function DateInput({ value, onChange, disabled, className }: DateInputProps) {
  const [display, setDisplay] = useState(isoToDisplay(value))

  useEffect(() => {
    setDisplay(isoToDisplay(value))
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value.replace(/[^0-9/]/g, '')

    // Auto-insert slashes after day and month
    if (raw.length === 2 && !raw.includes('/') && display.length < 2) raw += '/'
    if (raw.length === 5 && raw.split('/').length === 2 && display.length < 5) raw += '/'

    if (raw.length > 10) return
    setDisplay(raw)

    const iso = displayToIso(raw)
    onChange(iso || (raw === '' ? '' : value))
  }

  function handleBlur() {
    const iso = displayToIso(display)
    if (iso) {
      setDisplay(isoToDisplay(iso))
      onChange(iso)
    } else if (!display.trim()) {
      onChange('')
    }
  }

  return (
    <Input
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      placeholder="DD/MM/YYYY"
      className={className}
      maxLength={10}
    />
  )
}
