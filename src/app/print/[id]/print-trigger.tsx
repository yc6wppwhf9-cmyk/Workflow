'use client'

import { useEffect } from 'react'

export function PrintTrigger() {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 600)
    return () => clearTimeout(timer)
  }, [])

  return (
    <button
      onClick={() => window.print()}
      style={{
        position: 'fixed', top: 16, right: 16, background: '#111', color: 'white',
        border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
        fontSize: 13, fontWeight: 600, zIndex: 999,
      }}
      className="no-print"
    >
      Print / Save PDF
    </button>
  )
}
