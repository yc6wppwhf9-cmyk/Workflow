import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Streams a stored file back under its ORIGINAL filename.
//
// Files are saved to storage under a generated path (see lib/storage-fallback.ts),
// so linking straight at file_url makes the browser save the random storage name.
// The HTML `download` attribute can't fix that because storage is a different
// origin, and browsers ignore `download` cross-origin. Proxying through this
// same-origin route lets us set Content-Disposition with the real name.
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

  // Supabase Storage can set the filename itself via ?download= — redirect so the
  // bytes never stream through this function (no response-size ceiling).
  if (file.file_url.includes('/storage/v1/object/public/')) {
    const url = new URL(file.file_url)
    url.searchParams.set('download', filename)
    return NextResponse.redirect(url.toString())
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
