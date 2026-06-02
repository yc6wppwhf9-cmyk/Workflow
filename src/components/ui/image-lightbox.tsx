'use client'

import { useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Download, ExternalLink } from 'lucide-react'

export interface LightboxImage {
  url: string
  name?: string
  badge?: React.ReactNode
}

interface ImageLightboxProps {
  images: LightboxImage[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
}

export function ImageLightbox({ images, index, onClose, onNavigate }: ImageLightboxProps) {
  const current = images[index]
  const hasPrev = index > 0
  const hasNext = index < images.length - 1

  const prev = useCallback(() => { if (hasPrev) onNavigate(index - 1) }, [hasPrev, index, onNavigate])
  const next = useCallback(() => { if (hasNext) onNavigate(index + 1) }, [hasNext, index, onNavigate])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')      onClose()
      if (e.key === 'ArrowLeft')   prev()
      if (e.key === 'ArrowRight')  next()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, prev, next])

  if (!current) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/92 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10">
        <p className="text-white/50 text-sm truncate max-w-xs">{current.name || ''}</p>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-white/40 text-sm mr-2">{index + 1} / {images.length}</span>
          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href={current.url}
            download={current.name || 'image'}
            onClick={e => e.stopPropagation()}
            className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Status badge */}
      {current.badge && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10" onClick={e => e.stopPropagation()}>
          {current.badge}
        </div>
      )}

      {/* Prev */}
      {hasPrev && (
        <button
          onClick={e => { e.stopPropagation(); prev() }}
          className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors z-10"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      )}

      {/* Image */}
      <div onClick={e => e.stopPropagation()} className="max-w-[90vw] max-h-[85vh] flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.name || ''}
          className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          style={{ maxWidth: '90vw' }}
        />
      </div>

      {/* Next */}
      {hasNext && (
        <button
          onClick={e => { e.stopPropagation(); next() }}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors z-10"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      )}

      {/* Thumbnail strip — only shown when 3+ images */}
      {images.length >= 3 && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-[80vw] px-2"
          onClick={e => e.stopPropagation()}
        >
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => onNavigate(i)}
              className={`shrink-0 w-12 h-12 rounded-md overflow-hidden border-2 transition-colors ${
                i === index ? 'border-white' : 'border-transparent opacity-50 hover:opacity-80'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
