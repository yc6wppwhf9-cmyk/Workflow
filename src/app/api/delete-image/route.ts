import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cloudinary, getCloudinaryPublicId, isCloudinaryUrl } from '@/lib/cloudinary'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { file_url, file_id } = await req.json() as { file_url: string; file_id: string }

  if (!file_id) return NextResponse.json({ error: 'file_id required' }, { status: 400 })

  // Delete from Cloudinary (only for Cloudinary-hosted files)
  if (file_url && isCloudinaryUrl(file_url)) {
    const publicId = getCloudinaryPublicId(file_url)
    if (publicId) {
      await cloudinary.uploader.destroy(publicId).catch(() => {})
    }
  }

  await supabase.from('product_files').delete().eq('id', file_id)

  return NextResponse.json({ ok: true })
}
