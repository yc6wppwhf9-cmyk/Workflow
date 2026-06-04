import { createClient } from '@supabase/supabase-js'

// Cloudinary is the primary image host in production. When its credentials are
// not configured (e.g. local testing), uploads fall back to a public Supabase
// Storage bucket so the app remains fully usable without external services.
export function cloudinaryConfigured(): boolean {
  return !!(process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
}

const BUCKET = 'product-files'

export async function uploadToSupabaseStorage(
  buffer: Buffer,
  file: File,
  folder: string,
): Promise<{ url: string; public_id: string }> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const ext  = (file.name.split('.').pop() || 'bin').toLowerCase()
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  })
  if (error) throw new Error(`Supabase storage upload failed: ${error.message}`)

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, public_id: path }
}
