import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cloudinary } from '@/lib/cloudinary'
import { cloudinaryConfigured, uploadToSupabaseStorage } from '@/lib/storage-fallback'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

function safeFolder(folder: string | null): string {
  const f = folder ?? 'products'
  return /^[a-zA-Z0-9_-]{1,50}$/.test(f) ? f : 'products'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file   = formData.get('file')   as File   | null
  const folder = formData.get('folder') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP, GIF, and BMP images are allowed' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be under 10 MB' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Local / no-Cloudinary fallback → store in Supabase Storage
  if (!cloudinaryConfigured()) {
    const { url, public_id } = await uploadToSupabaseStorage(buffer, file, safeFolder(folder))
    return NextResponse.json({ url, public_id })
  }

  const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder:        safeFolder(folder),
        resource_type: 'image',
        quality:       'auto',
        fetch_format:  'auto',
      },
      (error, res) => {
        if (error || !res) return reject(error ?? new Error('Cloudinary upload failed'))
        resolve({ secure_url: res.secure_url, public_id: res.public_id })
      },
    ).end(buffer)
  })

  return NextResponse.json({ url: result.secure_url, public_id: result.public_id })
}
