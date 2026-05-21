'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Trash2, Download, Loader2, File, FileText, FileSpreadsheet, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import type { Product, Profile, ProductFile } from '@/lib/types'

interface FilesTabProps {
  product: Product
  profile: Profile
  files: ProductFile[]
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

function isImage(file: ProductFile) {
  if (file.file_type?.startsWith('image/')) return true
  return /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(file.name)
}

function FileIcon({ file }: { file: ProductFile }) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return <FileText className="h-4 w-4 text-red-500" />
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return <FileSpreadsheet className="h-4 w-4 text-green-600" />
  return <File className="h-4 w-4 text-blue-500" />
}

export function FilesTab({ product, profile, files: initialFiles }: FilesTabProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [files, setFiles] = useState(initialFiles)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const images = files.filter(isImage)
  const otherFiles = files.filter(f => !isImage(f))

  function openLightbox(idx: number) { setLightboxIndex(idx) }
  function closeLightbox() { setLightboxIndex(null) }
  function prevImage() { setLightboxIndex(i => i !== null ? (i - 1 + images.length) % images.length : null) }
  function nextImage() { setLightboxIndex(i => i !== null ? (i + 1) % images.length : null) }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const supabase = createClient()

    const path = `${product.id}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage.from('product-files').upload(path, file)

    if (uploadError) {
      alert(`Failed to upload: ${uploadError.message}`)
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('product-files').getPublicUrl(path)

    const { data: fileRecord } = await supabase.from('product_files').insert({
      product_id: product.id,
      name: file.name,
      file_url: publicUrl,
      file_type: file.type,
      file_size: file.size,
      department: profile.role,
      uploaded_by: profile.id,
    }).select('*, uploader:profiles!uploaded_by(full_name)').single()

    if (fileRecord) setFiles([fileRecord, ...files])

    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: `uploaded file "${file.name}"`,
      department: profile.role,
    })

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    router.refresh()
  }

  async function handleDelete(fileId: string, fileName: string) {
    const supabase = createClient()
    await supabase.from('product_files').delete().eq('id', fileId)
    setFiles(files.filter(f => f.id !== fileId))
    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: `deleted file "${fileName}"`,
      department: profile.role,
    })
  }

  return (
    <div className="max-w-4xl space-y-4">

      {/* ── Image Gallery ── */}
      {images.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Images ({images.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {images.map((file, idx) => (
                <div
                  key={file.id}
                  className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 cursor-pointer bg-gray-50"
                  onClick={() => openLightbox(idx)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={file.file_url}
                    alt={file.name}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  {(profile.role === 'admin' || file.uploaded_by === profile.id) && (
                    <button
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      onClick={e => { e.stopPropagation(); handleDelete(file.id, file.name) }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <p className="absolute bottom-0 left-0 right-0 text-[10px] text-white bg-black/50 px-1.5 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {file.name}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Other Files ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">
            {otherFiles.length > 0 ? `Files (${otherFiles.length})` : 'Files'}
          </CardTitle>
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </Button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
        </CardHeader>
        <CardContent>
          {otherFiles.length === 0 && images.length === 0 ? (
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl py-12 text-center cursor-pointer hover:border-blue-300 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Click to upload files</p>
              <p className="text-xs text-gray-400 mt-1">PDFs, images, Excel, Word, etc.</p>
            </div>
          ) : otherFiles.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {otherFiles.map(file => (
                <div key={file.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 group">
                  <div className="h-9 w-9 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 border border-gray-200">
                    <FileIcon file={file} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                    <p className="text-xs text-gray-400">
                      {file.file_size ? formatBytes(file.file_size) : '—'} ·{' '}
                      {(file.uploader as { full_name?: string } | null)?.full_name || 'Unknown'} ·{' '}
                      {formatDate(file.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a href={file.file_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                    {(profile.role === 'admin' || file.uploaded_by === profile.id) && (
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(file.id, file.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Lightbox ── */}
      {lightboxIndex !== null && images[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={closeLightbox}
        >
          <button
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            onClick={closeLightbox}
          >
            <X className="h-5 w-5" />
          </button>

          {images.length > 1 && (
            <>
              <button
                className="absolute left-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                onClick={e => { e.stopPropagation(); prevImage() }}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                className="absolute right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                onClick={e => { e.stopPropagation(); nextImage() }}
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
            <p className="text-white/70 text-sm">{images[lightboxIndex].name}</p>
            {images.length > 1 && (
              <p className="text-white/40 text-xs">{lightboxIndex + 1} / {images.length}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
