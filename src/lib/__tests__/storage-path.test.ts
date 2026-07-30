import { describe, it, expect } from 'vitest'
import { parseStorageUrl } from '../storage-path'

const PROJECT = 'https://unuggtqicilzzzxxtizd.supabase.co'

describe('parseStorageUrl', () => {
  it('extracts bucket and path from a public Storage URL', () => {
    expect(parseStorageUrl(
      `${PROJECT}/storage/v1/object/public/product-files/abc123/1730000000000-x9f2.xlsx`
    )).toEqual({ bucket: 'product-files', path: 'abc123/1730000000000-x9f2.xlsx' })
  })

  it('strips the token from a signed URL', () => {
    expect(parseStorageUrl(
      `${PROJECT}/storage/v1/object/sign/product-files/abc/sheet.xlsx?token=ey.J9.abc`
    )).toEqual({ bucket: 'product-files', path: 'abc/sheet.xlsx' })
  })

  it('handles authenticated URLs', () => {
    expect(parseStorageUrl(
      `${PROJECT}/storage/v1/object/authenticated/product-files/a/b.pdf`
    )).toEqual({ bucket: 'product-files', path: 'a/b.pdf' })
  })

  it('percent-decodes names with spaces', () => {
    // The item master really is named with two spaces.
    expect(parseStorageUrl(
      `${PROJECT}/storage/v1/object/public/product-files/p1/item%20%20master.xlsx`
    )).toEqual({ bucket: 'product-files', path: 'p1/item  master.xlsx' })
  })

  it('keeps nested folder paths intact', () => {
    expect(parseStorageUrl(
      `${PROJECT}/storage/v1/object/public/product-files/a/b/c/d.png`
    )?.path).toBe('a/b/c/d.png')
  })

  it('reports a non-default bucket rather than assuming ours', () => {
    expect(parseStorageUrl(
      `${PROJECT}/storage/v1/object/public/avatars/u/1.png`
    )).toEqual({ bucket: 'avatars', path: 'u/1.png' })
  })

  it('treats a bare path as living in the default bucket', () => {
    expect(parseStorageUrl('abc123/sheet.xlsx'))
      .toEqual({ bucket: 'product-files', path: 'abc123/sheet.xlsx' })
  })

  it('trims leading slashes that would 404', () => {
    expect(parseStorageUrl('/abc/sheet.xlsx')?.path).toBe('abc/sheet.xlsx')
  })

  it('honours an explicit default bucket', () => {
    expect(parseStorageUrl('a/b.png', 'other-bucket')?.bucket).toBe('other-bucket')
  })

  it('returns null for Cloudinary URLs so callers fetch them directly', () => {
    expect(parseStorageUrl('https://res.cloudinary.com/demo/image/upload/v1/a.png')).toBeNull()
  })

  it('returns null for an http URL that is not a Storage object', () => {
    expect(parseStorageUrl(`${PROJECT}/rest/v1/products`)).toBeNull()
  })

  it('returns null for empty, blank and missing values', () => {
    expect(parseStorageUrl('')).toBeNull()
    expect(parseStorageUrl('   ')).toBeNull()
    expect(parseStorageUrl(null)).toBeNull()
    expect(parseStorageUrl(undefined)).toBeNull()
    expect(parseStorageUrl('///')).toBeNull()
  })

  it('returns null when a Storage URL has a bucket but no object path', () => {
    expect(parseStorageUrl(`${PROJECT}/storage/v1/object/public/product-files/`)).toBeNull()
  })
})
