import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PLM System — Product Lifecycle Management',
  description: 'Centralized product lifecycle and workflow management for manufacturing teams',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  )
}
