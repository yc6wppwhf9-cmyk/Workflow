'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, Trash2, Download, Loader2, File } from 'lucide-react'
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

export function FilesTab({ product, profile, files: initialFiles }: FilesTabProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [files, setFiles] = useState(initialFiles)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const supabase = createClient()

    const path = `${product.id}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('product-files')
      .upload(path, file)

    if (uploadError) {
      console.error('Storage upload failed:', uploadError.message)
      alert(`Failed to upload file to storage: ${uploadError.message}. Please check if the 'product-files' bucket is created and configured in your Supabase dashboard.`)
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('product-files')
      .getPublicUrl(path)

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
    setFiles(files.filter((f) => f.id !== fileId))

    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: `deleted file "${fileName}"`,
      department: profile.role,
    })
  }

  return (
    <div className="max-w-3xl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Product Files</CardTitle>
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload File
          </Button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl py-12 text-center cursor-pointer hover:border-blue-300 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Click to upload files</p>
              <p className="text-xs text-gray-400 mt-1">PDFs, images, Excel, Word, etc.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div key={file.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 group">
                  <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <File className="h-4 w-4 text-blue-500" />
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
                    {!file.file_url.startsWith('pending:') && (
                      <a href={file.file_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    )}
                    {(profile.role === 'admin' || file.uploaded_by === profile.id) && (
                      <Button
                        variant="ghost"
                        size="icon"
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
    </div>
  )
}
