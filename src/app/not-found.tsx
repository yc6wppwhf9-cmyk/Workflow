import Link from 'next/link'
import { Package } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8">
      <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center">
        <Package className="h-7 w-7 text-gray-400" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900">Page not found</h2>
        <p className="text-sm text-gray-500 mt-1">The page you are looking for does not exist.</p>
      </div>
      <Button asChild variant="outline">
        <Link href="/dashboard">Go to Dashboard</Link>
      </Button>
    </div>
  )
}
