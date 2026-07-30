import { createClient } from '@supabase/supabase-js'
import { parseStorageUrl } from '@/lib/storage-path'

// Collects a product's uploaded files for an outgoing email: documents as real
// attachments, images as embedded thumbnails.
//
// Shared so every notification carries the same evidence. The BOM hand-off used
// to be the only mail with the merchandising Excel, which left the person
// actually assigned the work to go and find it.

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export interface EmailAttachment {
  filename: string
  content: string
  type: string
}

export interface FileContent {
  /** Thumbnails + attachment names, to drop into the email body. */
  imageHtml: string
  attachments: EmailAttachment[]
}

const isCloudinaryUrl = (url: string) => url.startsWith('https://res.cloudinary.com')

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`

export async function buildFileContent(product_id: string, depts: string[]): Promise<FileContent> {
  // The cap used to be 20 rows for images and documents combined, which starved
  // the spreadsheet: a merch upload inserts dozens of colour images in the same
  // batch as the Excel, so the newest-20 window was all images and the sheet the
  // BOM team actually needs never reached the email. Take a wide window and
  // split by type here, so the document quota is independent of image count.
  const { data: files } = await adminSupabase
    .from('product_files')
    .select('name, file_url, file_type')
    .eq('product_id', product_id)
    .in('department', depts)
    .order('created_at', { ascending: false })
    .limit(200)

  const imageFiles = (files ?? []).filter(f => f.file_type?.startsWith('image/')).slice(0, 6)
  // Attach every uploaded document, not the newest three — the sampling and
  // merchandising teams upload several sheets per product and the BOM team needs
  // all of them. The real limit is the message size, enforced below.
  const otherFiles = (files ?? []).filter(f => f.file_type && !f.file_type.startsWith('image/')).slice(0, 15)

  // Resolve image URLs
  const imageUrls: string[] = []
  for (const img of imageFiles) {
    if (isCloudinaryUrl(img.file_url)) {
      imageUrls.push(img.file_url)
      continue
    }
    const loc = parseStorageUrl(img.file_url)
    const { data: urlData } = loc
      ? await adminSupabase.storage.from(loc.bucket).createSignedUrl(loc.path, 60 * 60 * 24 * 7) // 7 days
      : { data: null }
    // Fall back to the stored URL — a public bucket URL still renders in mail.
    if (urlData?.signedUrl) imageUrls.push(urlData.signedUrl)
    else if (/^https?:\/\//i.test(img.file_url)) imageUrls.push(img.file_url)
  }

  // Attach the uploaded documents (Excel, PDFs) exactly as uploaded — the raw
  // bytes straight from storage, under the original filename. Nothing is
  // re-generated from the parsed data, so the recipient opens the same workbook
  // the merchandising team sent.
  //
  // Resend caps a message at 40 MB; base64 inflates by ~4/3, so budget the raw
  // bytes well under that and skip the rest rather than have the send fail
  // wholesale and deliver nothing.
  const MAX_RAW_BYTES = 22 * 1024 * 1024
  const attachments: EmailAttachment[] = []
  const skipped: string[] = []
  let budget = MAX_RAW_BYTES

  for (const file of otherFiles) {
    if (isCloudinaryUrl(file.file_url)) continue
    const loc = parseStorageUrl(file.file_url)
    if (!loc) {
      console.error('[email-attachments] cannot resolve storage path for', file.file_url)
      skipped.push(file.name)
      continue
    }
    try {
      const { data: blob, error } = await adminSupabase.storage.from(loc.bucket).download(loc.path)
      if (error || !blob) {
        // Never silent: a missing attachment is exactly the kind of failure the
        // recipient cannot see and will not report as a bug.
        console.error('[email-attachments] download failed', loc.path, error?.message)
        skipped.push(file.name)
        continue
      }
      if (blob.size > budget) {
        console.warn('[email-attachments] over size budget, skipped', file.name, blob.size)
        skipped.push(file.name)
        continue
      }
      budget -= blob.size
      const buffer = await blob.arrayBuffer()
      attachments.push({
        filename: file.name,
        content: Buffer.from(buffer).toString('base64'),
        type: file.file_type || 'application/octet-stream',
      })
    } catch (err) {
      console.error('[email-attachments] error', loc.path, err)
      skipped.push(file.name)
    }
  }

  // Name the attached documents. This block used to render only when there were
  // images, so an email carrying just the merchandising Excel said nothing about
  // it and looked like the sheet had been left out.
  const docList = attachments.length > 0 ? `
      <p style="font-size:12px;font-weight:600;color:#374151;margin:0 0 6px 0;">
        Attached (${plural(attachments.length, 'file')}):
      </p>
      <ul style="margin:0 0 12px 0;padding-left:18px;color:#475569;font-size:13px;">
        ${attachments.map(a => `<li>${a.filename}</li>`).join('')}
      </ul>` : ''

  // Say so when a file could not be attached, so nobody assumes the email is
  // the complete hand-off. The product page always has every file.
  const skippedNote = skipped.length > 0 ? `
      <p style="margin:0 0 12px;color:#b45309;font-size:12px;">
        Could not attach ${plural(skipped.length, 'file')} (${skipped.join(', ')}) — open the product to download ${skipped.length !== 1 ? 'them' : 'it'}.
      </p>` : ''

  const thumbs = imageUrls.length > 0 ? `
      <p style="font-size:12px;font-weight:600;color:#374151;margin:0 0 10px 0;">
        ${plural(imageUrls.length, 'image')}:
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${imageUrls.map(url =>
          `<img src="${url}" style="width:130px;height:100px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;" />`
        ).join('')}
      </div>` : ''

  const imageHtml = docList || skippedNote || thumbs ? `
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;">
      ${docList}${skippedNote}${thumbs}
    </div>` : ''

  return { imageHtml, attachments }
}
