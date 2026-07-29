'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Palette, Weight, Ruler, Package, ChevronLeft, ChevronRight, X, Trash2, Loader2, Check } from 'lucide-react'
import { getColorHex } from '@/lib/color-maps'
import type { ColourVariant, ProductFile, Profile } from '@/lib/types'

interface ColourVariantsTabProps {
  variants: ColourVariant[]
  files: ProductFile[]
  profile: Profile
}

function ColorCard({
  variant,
  images,
  deleteMode,
  selected,
  onToggle,
}: {
  variant: ColourVariant
  images: ProductFile[]
  deleteMode: boolean
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const hex = getColorHex(variant.colourTag)

  const hasSpecs = variant.weight || variant.dimensions?.length || variant.materials?.length

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: hex + '22' }}>
          <div className="h-8 w-8 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: hex }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{variant.colourTag}</p>
            <p className="text-xs text-gray-500 truncate">{variant.styleName}</p>
          </div>
        </div>

        {/* Specs */}
        {hasSpecs && (
          <div className="px-4 py-3 border-t border-gray-100 space-y-2">
            {variant.weight && (
              <div className="flex items-center gap-2 text-xs">
                <Weight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="text-gray-500">Weight:</span>
                <span className="font-medium text-gray-800">{variant.weight} g</span>
              </div>
            )}
            {(variant.dimensions?.length || variant.dimensions?.width) && (
              <div className="flex items-center gap-2 text-xs">
                <Ruler className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="text-gray-500">Size:</span>
                <span className="font-medium text-gray-800">
                  {[variant.dimensions.length, variant.dimensions.width, variant.dimensions.height]
                    .filter(Boolean).join(' × ')}{' '}
                  {variant.dimensions.unit || 'in'}
                </span>
              </div>
            )}
            {variant.materials?.length > 0 && (
              <div className="flex items-start gap-2 text-xs">
                <Package className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                <span className="text-gray-500 shrink-0">Material:</span>
                <span className="font-medium text-gray-800">{variant.materials.join(', ')}</span>
              </div>
            )}
            {variant.uniquePurpose && (
              <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5">
                {variant.uniquePurpose}
              </div>
            )}
          </div>
        )}

        {/* Image thumbnails */}
        {images.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100">
            {deleteMode ? (
              /* Delete mode: show ALL images, click to (de)select */
              <div className="grid grid-cols-4 gap-1.5">
                {images.map(img => {
                  const isSel = selected.has(img.id)
                  return (
                    <button
                      key={img.id}
                      onClick={() => onToggle(img.id)}
                      className={`aspect-square rounded overflow-hidden bg-gray-100 relative focus:outline-none ring-2 ${isSel ? 'ring-red-500' : 'ring-transparent'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.file_url} alt={img.name} className={`w-full h-full object-cover transition-opacity ${isSel ? 'opacity-60' : 'opacity-80'}`} />
                      <span className={`absolute top-1 right-1 h-5 w-5 rounded-full flex items-center justify-center border ${isSel ? 'bg-red-600 border-red-600 text-white' : 'bg-white/80 border-gray-300 text-transparent'}`}>
                        <Check className="h-3 w-3" />
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {images.slice(0, 7).map((img, i) => (
                  <div
                    key={img.id}
                    className="aspect-square rounded overflow-hidden bg-gray-100 cursor-pointer relative group"
                    onClick={() => setLightboxIndex(i)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.file_url} alt={img.name} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
                  </div>
                ))}
                {images.length > 7 && (
                  <div
                    className="aspect-square rounded bg-gray-100 flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => setLightboxIndex(7)}
                  >
                    <span className="text-xs font-medium text-gray-600">+{images.length - 7}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {images.length === 0 && (
          <div className="px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center py-2">No images tagged for this colour</p>
          </div>
        )}

      </div>

      {/* Lightbox (view only — disabled in delete mode) */}
      {!deleteMode && lightboxIndex !== null && images[lightboxIndex!] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            onClick={() => setLightboxIndex(null)}
          >
            <X className="h-5 w-5" />
          </button>
          {images.length > 1 && (
            <>
              <button
                className="absolute left-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                onClick={e => { e.stopPropagation(); setLightboxIndex(i => i !== null ? (i - 1 + images.length) % images.length : null) }}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                className="absolute right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                onClick={e => { e.stopPropagation(); setLightboxIndex(i => i !== null ? (i + 1) % images.length : null) }}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
          <div className="flex flex-col items-center gap-3 max-w-5xl max-h-screen p-16" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[lightboxIndex].file_url}
              alt={images[lightboxIndex].name}
              className="max-h-[80vh] max-w-full object-contain rounded-lg"
            />
            <p className="text-white/70 text-sm">{variant.colourTag}</p>
            {images.length > 1 && (
              <p className="text-white/40 text-xs">{lightboxIndex + 1} / {images.length}</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export function ColourVariantsTab({ variants, files, profile }: ColourVariantsTabProps) {
  const router = useRouter()
  const isAdmin = profile.role === 'admin'
  const [deleteMode, setDeleteMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  // Strip ATTRIBUTES template placeholder tags like "Color" / "Colour"
  const PLACEHOLDER = /^colou?rs?$/i
  const realVariants = variants.filter(v => !PLACEHOLDER.test((v.colourTag || '').trim()))
  const displayVariants = realVariants.length > 0 ? realVariants : variants

  // Group files by colour_tag
  const filesByColor = new Map<string, ProductFile[]>()
  const untaggedImages: ProductFile[] = []
  for (const f of files) {
    if (f.file_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name)) {
      if (f.colour_tag) {
        if (!filesByColor.has(f.colour_tag)) filesByColor.set(f.colour_tag, [])
        filesByColor.get(f.colour_tag)!.push(f)
      } else {
        untaggedImages.push(f)
      }
    }
  }

  const imagesForVariant = (v: ColourVariant): ProductFile[] =>
    filesByColor.get(v.styleName) || filesByColor.get(v.colourTag) || []

  // All image ids currently shown in the colour cards (deduped), for "Select all".
  const allShownIds = Array.from(
    new Set(displayVariants.flatMap(v => imagesForVariant(v).map(f => f.id))),
  )

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    if (!window.confirm(`Delete ${selected.size} image(s)? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const res = await fetch('/api/delete-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      })
      const json = await res.json() as { ok?: boolean; deleted?: number; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed')
      toast.success(`${json.deleted ?? selected.size} image(s) deleted`)
      setSelected(new Set())
      setDeleteMode(false)
      router.refresh()
    } catch {
      toast.error('Could not delete images')
    } finally {
      setDeleting(false)
    }
  }

  if (displayVariants.length === 0) {
    return (
      <div className="max-w-3xl">
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <Palette className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No colour variants yet</p>
          <p className="text-xs text-gray-400 mt-1">Upload the merchandising Excel to populate colour variants</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-4">
      {/* Stats */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-4 py-2.5">
          <Palette className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-semibold text-gray-900">{displayVariants.length}</span>
          <span className="text-sm text-gray-500">colour variant{displayVariants.length !== 1 ? 's' : ''}</span>
        </div>
        {filesByColor.size > 0 && (
          <div className="text-xs text-gray-400">
            {[...filesByColor.values()].reduce((a, b) => a + b.length, 0)} images tagged across {filesByColor.size} colour{filesByColor.size !== 1 ? 's' : ''}
          </div>
        )}
        {isAdmin && (
          <button
            onClick={() => { setDeleteMode(d => !d); setSelected(new Set()) }}
            className={`ml-auto inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              deleteMode
                ? 'bg-gray-800 text-white border-gray-800 hover:bg-gray-900'
                : 'text-red-600 border-red-200 hover:bg-red-50'
            }`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleteMode ? 'Cancel' : 'Delete Images'}
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {deleteMode && (
        <div className="flex items-center gap-3 flex-wrap bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <span className="text-sm font-medium text-red-700">{selected.size} selected</span>
          <button
            onClick={() => setSelected(new Set(allShownIds))}
            className="text-xs font-medium text-gray-700 border border-gray-300 rounded px-2 py-1 hover:bg-white"
          >
            Select all ({allShownIds.length})
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs font-medium text-gray-700 border border-gray-300 rounded px-2 py-1 hover:bg-white"
            >
              Clear
            </button>
          )}
          <button
            onClick={deleteSelected}
            disabled={selected.size === 0 || deleting}
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete selected{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
      )}

      {/* Variant cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayVariants.map((variant, i) => (
          <ColorCard
            key={`${variant.styleName || variant.colourTag}-${i}`}
            variant={variant}
            deleteMode={isAdmin && deleteMode}
            selected={selected}
            onToggle={toggle}
            images={imagesForVariant(variant)}
          />
        ))}
      </div>

      {untaggedImages.length > 0 && (
        <div className="text-xs text-gray-400 text-center pt-2">
          {untaggedImages.length} image{untaggedImages.length !== 1 ? 's' : ''} in Files tab not yet tagged to a colour
        </div>
      )}
    </div>
  )
}
