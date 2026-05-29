import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cloudinary } from '@/lib/cloudinary'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file   = formData.get('file')   as File   | null
  const folder = formData.get('folder') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder:        folder ?? 'products',
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
