'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, Package, ChevronRight, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { STAGE_LABELS, STAGE_COLORS, type WorkflowStage, type Profile } from '@/lib/types'
import { formatDate } from '@/lib/utils'

interface ProductRow {
  id: string
  name: string
  sku: string
  category: string
  workflow_stage: string
  created_at: string
  creator?: { full_name: string; email: string } | null
}

interface ProductsTableProps {
  products: ProductRow[]
  profile: Profile
}

export function ProductsTable({ products, profile }: ProductsTableProps) {
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const filtered = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
    const matchStage = stageFilter === 'all' || p.workflow_stage === stageFilter
    const matchCategory = categoryFilter === 'all' || p.category === categoryFilter
    return matchSearch && matchStage && matchCategory
  })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name or SKU..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter className="h-4 w-4 mr-2 text-gray-400" />
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {Object.entries(STAGE_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {['bag', 'luggage', 'backpack', 'wallet', 'accessory', 'other'].map((c) => (
              <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">By</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                <td className="px-5 py-3.5">
                  <Link href={`/products/${p.id}`} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <Package className="h-4 w-4 text-blue-500" />
                    </div>
                    <span className="font-medium text-gray-900 group-hover:text-blue-600">{p.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-3.5 text-gray-500 font-mono text-xs">{p.sku}</td>
                <td className="px-4 py-3.5">
                  <span className="capitalize text-gray-600">{p.category}</span>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STAGE_COLORS[p.workflow_stage as WorkflowStage]}`}>
                    {STAGE_LABELS[p.workflow_stage as WorkflowStage]}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-gray-500 text-xs">{formatDate(p.created_at)}</td>
                <td className="px-4 py-3.5 text-gray-500 text-xs">{p.creator?.full_name || '—'}</td>
                <td className="pr-4">
                  <Link href={`/products/${p.id}`}>
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-500" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{search || stageFilter !== 'all' ? 'No products match your filters.' : 'No products yet.'}</p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">Showing {filtered.length} of {products.length} products</p>
    </div>
  )
}
