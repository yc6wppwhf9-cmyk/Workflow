import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
})

export { cloudinary }

// Extract the Cloudinary public_id from a secure_url.
// URL format: https://res.cloudinary.com/{cloud}/image/upload/v{ver}/{public_id}.{ext}
export function getCloudinaryPublicId(url: string): string | null {
  try {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^./]+)?$/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

export function isCloudinaryUrl(url: string): boolean {
  return url.startsWith('https://res.cloudinary.com')
}
