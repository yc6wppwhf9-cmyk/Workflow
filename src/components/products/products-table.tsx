'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, Package, ChevronRight, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { STAGE_LABELS, STAGE_COLORS, CATEGORY_LABELS, type WorkflowStage, type ProductCategory, type Profile } from '@/lib/types'
import { formatDate } from '@/lib/utils'

interface ProductRow {
  id: string
  name: string
  sku: string
  category: string
  workflow_stage: string
  created_at: string
  creator?: { full_name: string; email: string } | null
  design_data?: { designer_name: string | null; color_skus: string[] | null; channel: string | null }[] | null
  bom_data?: { fg_inv_code: string | null }[] | null
}

interface ProductsTableProps {
  products: ProductRow[]
  profile: Profile
}

export function ProductsTable({ products, profile }: ProductsTableProps) {
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const getDesign = (p: ProductRow) => { const r = p.design_data; return Array.isArray(r) ? r[0] : r }
  const getBom = (p: ProductRow) => { const r = p.bom_data; return Array.isArray(r) ? r[0] : r }

  const filtered = products.filter((p) => {
    const design = getDesign(p)
    const bom = getBom(p)
    const haystack = [
      p.name,
      p.sku,
      design?.designer_name,
      design?.channel,
      bom?.fg_inv_code,
      ...(design?.color_skus || []),
    ].join(' ').toLowerCase()
    const matchSearch = !search || haystack.includes(search.toLowerCase())
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
            placeholder="Search by name, designer, SKU, channel..."
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
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {(Object.entries(CATEGORY_LABELS) as [ProductCategory, string][]).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
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
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Colour SKUs</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">FG INV</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Channel</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((p) => {
              const design = getDesign(p)
              const bom = getBom(p)
              const colourSkus = design?.color_skus || []
              return (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                  {/* Product name + designer stacked */}
                  <td className="px-5 py-3.5">
                    <Link href={`/products/${p.id}`} className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 group-hover:text-blue-600">{p.name}</p>
                        {design?.designer_name && (
                          <p className="text-xs text-gray-400 mt-0.5">{design.designer_name}</p>
                        )}
                      </div>
                    </Link>
                  </td>

                  {/* Colour SKUs */}
                  <td className="px-4 py-3.5">
                    {colourSkus.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {colourSkus.slice(0, 3).map((sku, i) => (
                          <span key={i} className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{sku}</span>
                        ))}
                        {colourSkus.length > 3 && (
                          <span className="text-xs text-gray-400">+{colourSkus.length - 3}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>

                  {/* FG INV */}
                  <td className="px-4 py-3.5 font-mono text-xs text-gray-700">
                    {bom?.fg_inv_code || <span className="text-gray-300">—</span>}
                  </td>

                  {/* Channel */}
                  <td className="px-4 py-3.5 text-gray-600 text-xs">
                    {design?.channel || <span className="text-gray-300">—</span>}
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3.5 text-gray-600 text-sm">
                    {CATEGORY_LABELS[p.category as ProductCategory] || p.category}
                  </td>

                  {/* Stage */}
                  <td className="px-4 py-3.5">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STAGE_COLORS[p.workflow_stage as WorkflowStage]}`}>
                      {STAGE_LABELS[p.workflow_stage as WorkflowStage]}
                    </span>
                  </td>

                  {/* Created */}
                  <td className="px-4 py-3.5 text-gray-400 text-xs">{formatDate(p.created_at)}</td>

                  <td className="pr-4">
                    <Link href={`/products/${p.id}`}>
                      <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-500" />
                    </Link>
                  </td>
                </tr>
              )
            })}
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
