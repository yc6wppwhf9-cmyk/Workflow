// Rangewise product naming: "<RANGE> <NNN>" — ROCK 001, CUPCAKE 012, NEW YORK 003.
//
// The range is the collection the product belongs to (what the team already
// records as family_name, and what shows up in illustration filenames like
// "NEW YORK-12.png"). The sequence numbers products within that range.
//
// Pure helpers only — allocating the next number needs the database, so that
// lives in /api/assign-range-name.

/** Width of the zero-padded sequence: 001, 012, 123. Beyond 999 it just grows. */
const SEQ_PAD = 3

/** Uppercase, collapse internal whitespace, trim. The canonical form of a range. */
export function normaliseRange(raw: string | null | undefined): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
}

/** "ROCK" + 1 -> "ROCK 001". Returns '' for an empty range so callers can bail. */
export function formatRangeName(range: string | null | undefined, seq: number): string {
  const r = normaliseRange(range)
  if (!r || !Number.isFinite(seq) || seq < 1) return ''
  return `${r} ${String(Math.floor(seq)).padStart(SEQ_PAD, '0')}`
}

/**
 * Split a rangewise name back into its parts: "ROCK 001" -> { range: 'ROCK', seq: 1 }.
 * Returns null for anything that isn't <range> <number>, so free-text names like
 * "COLLEGE BACKPACK" are correctly rejected.
 */
export function parseRangeName(name: string | null | undefined): { range: string; seq: number } | null {
  const m = String(name ?? '').trim().match(/^(.+?)\s+(\d{1,6})$/)
  if (!m) return null
  const range = normaliseRange(m[1])
  const seq = parseInt(m[2], 10)
  if (!range || seq < 1) return null
  return { range, seq }
}

/**
 * Is this still the placeholder that product creation generates?
 *
 * new-product-form builds "<Category>[ <BRAND>] <base36 timestamp>", e.g.
 * "Backpack PRIORITY MSA0PMC4". The timestamp is the tell: a run of 6-11
 * upper-case alphanumerics containing at least one DIGIT.
 *
 * The digit requirement is load-bearing — without it "COLLEGE BACKPACK" matches,
 * because "BACKPACK" is eight upper-case letters. Real product names get
 * misclassified as placeholders and silently overwritten.
 */
export function isAutoPlaceholderName(name: string | null | undefined): boolean {
  const last = String(name ?? '').trim().split(/\s+/).pop() ?? ''
  return /^(?=[0-9A-Z]*\d)[0-9A-Z]{6,11}$/.test(last)
}

/**
 * Should an automated writer (tech pack / merch Excel import) be allowed to
 * rename this product?
 *
 * Only when nobody has deliberately named it. A product with a range assigned has
 * been named on purpose and must not be clobbered by the next spreadsheet upload
 * — that is the bug this whole scheme exists to close.
 */
export function canAutoRename(product: {
  name?: string | null
  product_range?: string | null
}): boolean {
  if (normaliseRange(product.product_range)) return false
  return !String(product.name ?? '').trim() || isAutoPlaceholderName(product.name)
}

/**
 * Pick the next free sequence number in a range, given the numbers already taken.
 * Fills the lowest gap rather than always appending, so a deleted product's number
 * gets reused instead of leaving a permanent hole in the range.
 */
export function nextSequence(taken: number[]): number {
  const used = new Set(taken.filter(n => Number.isFinite(n) && n >= 1).map(Math.floor))
  let n = 1
  while (used.has(n)) n++
  return n
}
