// product_files.file_url is not stored consistently:
//   * uploads routed through /api/upload-file save the full public Storage URL
//     (see lib/storage-fallback.ts, which returns getPublicUrl)
//   * direct client uploads save a bucket-relative object path
//   * images may live on Cloudinary entirely
//
// The Storage SDK's download() and createSignedUrl() take an object path, never
// a URL. Passing a URL fails, which is how the merchandising Excel went missing
// from the BOM hand-off email for months: the failure was caught and ignored.
// One helper, so every caller resolves the same way.

export const DEFAULT_BUCKET = 'product-files'

const OBJECT_PATH = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/

/**
 * Resolve a stored file reference into the bucket and object path needed by the
 * Storage SDK. Returns null when the reference is not Supabase Storage (e.g. a
 * Cloudinary URL), which callers should handle by fetching the URL directly.
 */
export function parseStorageUrl(
  fileUrl: string | null | undefined,
  defaultBucket: string = DEFAULT_BUCKET,
): { bucket: string; path: string } | null {
  const raw = (fileUrl ?? '').trim()
  if (!raw) return null

  if (/^https?:\/\//i.test(raw)) {
    const m = raw.match(OBJECT_PATH)
    if (!m) return null
    // Drop any query string (signed URLs carry a token) before decoding.
    const path = decodeURIComponent(m[2].split('?')[0])
    return path ? { bucket: m[1], path } : null
  }

  // Bucket-relative path. Leading slashes would produce an empty first segment
  // and a 404 that reads like a missing file.
  const path = raw.replace(/^\/+/, '')
  return path ? { bucket: defaultBucket, path } : null
}
