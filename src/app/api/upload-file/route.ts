import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cloudinary } from '@/lib/cloudinary'

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp',
  'application/pdf',
]
const MAX_BYTES = 20 * 1024 * 1024 // 20 MB

function safeFolder(folder: string | null): string {
  const f = folder ?? 'products'
  return /^[a-zA-Z0-9_-]{1,50}$/.test(f) ? f : 'products'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file     = formData.get('file')   as File   | null
  const folder   = formData.get('folder') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only images and PDFs are allowed' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be under 20 MB' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder:        safeFolder(folder),
        resource_type: 'auto',  // handles both images and PDFs
        quality:       'auto',
      },
      (error, res) => {
        if (error || !res) return reject(error ?? new Error('Upload failed'))
        resolve({ secure_url: res.secure_url, public_id: res.public_id })
      },
    ).end(buffer)
  })

  return NextResponse.json({ url: result.secure_url, public_id: result.public_id })
}
