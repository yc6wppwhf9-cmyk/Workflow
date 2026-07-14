import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const PUBLIC_MARKER = '/storage/v1/object/public/'

// Streams a stored file back under its ORIGINAL filename.
//
// Files are saved to storage under a generated path (see lib/storage-fallback.ts),
// so linking straight at file_url makes the browser save the random storage name.
// The HTML `download` attribute can't fix that because storage is a different
// origin, and browsers ignore `download` cross-origin. This same-origin route
// resolves the real name and hands back a URL that carries it.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // URL comes from our own DB row, never from the caller.
  const { data: file } = await supabase
    .from('product_files')
    .select('name, file_url, file_type')
    .eq('id', id)
    .single()
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const filename = file.name || 'download'

  // Supabase Storage: mint a short-lived signed URL with the download filename.
  // Signed URLs work whether or not the bucket is public (a public URL against a
  // private bucket 404s with "Bucket not found"), and the bytes never stream
  // through this function, so there's no response-size ceiling.
  const markerAt = file.file_url.indexOf(PUBLIC_MARKER)
  if (markerAt !== -1) {
    const rest = decodeURIComponent(file.file_url.slice(markerAt + PUBLIC_MARKER.length).split('?')[0])
    const slash = rest.indexOf('/')
    const bucket = slash === -1 ? rest : rest.slice(0, slash)
    const path = slash === -1 ? '' : rest.slice(slash + 1)

    const admin = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(path, 120, { download: filename })

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: `Storage error for bucket "${bucket}": ${error?.message ?? 'no signed URL'}` },
        { status: 502 },
      )
    }
    return NextResponse.redirect(data.signedUrl)
  }

  // Other hosts (e.g. Cloudinary): proxy the bytes and set the header ourselves.
  const upstream = await fetch(file.file_url)
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Could not fetch file' }, { status: 502 })
  }

  // Non-ASCII/quotes break the plain filename param — keep an ASCII fallback plus RFC 5987.
  const asciiName = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'")

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': file.file_type || upstream.headers.get('content-type') || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
}
