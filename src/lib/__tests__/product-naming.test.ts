import { describe, it, expect } from 'vitest'
import {
  normaliseRange,
  formatRangeName,
  parseRangeName,
  isAutoPlaceholderName,
  canAutoRename,
  nextSequence,
} from '../product-naming'

describe('normaliseRange', () => {
  it('uppercases and collapses whitespace', () => {
    expect(normaliseRange('  new   york ')).toBe('NEW YORK')
    expect(normaliseRange('Rock')).toBe('ROCK')
  })

  it('returns empty string for nullish input', () => {
    expect(normaliseRange(null)).toBe('')
    expect(normaliseRange(undefined)).toBe('')
    expect(normaliseRange('   ')).toBe('')
  })
})

describe('formatRangeName', () => {
  it('zero-pads to three digits', () => {
    expect(formatRangeName('rock', 1)).toBe('ROCK 001')
    expect(formatRangeName('ROCK', 12)).toBe('ROCK 012')
    expect(formatRangeName('New York', 3)).toBe('NEW YORK 003')
  })

  it('grows past three digits rather than truncating', () => {
    expect(formatRangeName('ROCK', 1234)).toBe('ROCK 1234')
  })

  it('returns empty string when the range or sequence is unusable', () => {
    expect(formatRangeName('', 1)).toBe('')
    expect(formatRangeName('ROCK', 0)).toBe('')
    expect(formatRangeName('ROCK', -2)).toBe('')
    expect(formatRangeName('ROCK', NaN)).toBe('')
  })
})

describe('parseRangeName', () => {
  it('splits a rangewise name into range and sequence', () => {
    expect(parseRangeName('ROCK 001')).toEqual({ range: 'ROCK', seq: 1 })
    expect(parseRangeName('NEW YORK 012')).toEqual({ range: 'NEW YORK', seq: 12 })
    expect(parseRangeName('CONNECT 003')).toEqual({ range: 'CONNECT', seq: 3 })
  })

  it('rejects free-text names with no trailing number', () => {
    expect(parseRangeName('COLLEGE BACKPACK')).toBeNull()
    expect(parseRangeName('LAPTOP')).toBeNull()
    expect(parseRangeName('')).toBeNull()
    expect(parseRangeName(null)).toBeNull()
  })

  it('round-trips with formatRangeName', () => {
    expect(parseRangeName(formatRangeName('cupcake', 7))).toEqual({ range: 'CUPCAKE', seq: 7 })
  })
})

describe('isAutoPlaceholderName', () => {
  it('detects the placeholder produced at product creation', () => {
    expect(isAutoPlaceholderName('Backpack PRIORITY MSA0PMC4')).toBe(true)
    expect(isAutoPlaceholderName('Luggage MSA0PMC4')).toBe(true)
  })

  it('does not misread an all-letters word as a timestamp', () => {
    // Regression: "BACKPACK" is eight upper-case letters. Without requiring a
    // digit this matched, and real product names got silently overwritten.
    expect(isAutoPlaceholderName('COLLEGE BACKPACK')).toBe(false)
    expect(isAutoPlaceholderName('LAPTOP')).toBe(false)
  })

  it('does not match a properly assigned rangewise name', () => {
    expect(isAutoPlaceholderName('ROCK 001')).toBe(false)
    expect(isAutoPlaceholderName('CONNECT 003')).toBe(false)
  })
})

describe('canAutoRename', () => {
  it('allows renaming while the product still has the placeholder', () => {
    expect(canAutoRename({ name: 'Backpack PRIORITY MSA0PMC4', product_range: null })).toBe(true)
  })

  it('allows renaming when there is no name at all', () => {
    expect(canAutoRename({ name: '', product_range: null })).toBe(true)
  })

  it('refuses once a range has been assigned', () => {
    // The whole point: a merch re-upload must not clobber a deliberate name.
    expect(canAutoRename({ name: 'ROCK 001', product_range: 'ROCK' })).toBe(false)
  })

  it('refuses a hand-typed name even with no range set', () => {
    expect(canAutoRename({ name: 'CONNECT 003', product_range: null })).toBe(false)
    expect(canAutoRename({ name: 'COLLEGE BACKPACK', product_range: null })).toBe(false)
  })
})

describe('nextSequence', () => {
  it('starts at 1 for an empty range', () => {
    expect(nextSequence([])).toBe(1)
  })

  it('appends after a contiguous run', () => {
    expect(nextSequence([1, 2, 3])).toBe(4)
  })

  it('fills the lowest gap so deleted numbers get reused', () => {
    expect(nextSequence([1, 3, 4])).toBe(2)
  })

  it('ignores junk values', () => {
    expect(nextSequence([1, NaN, 0, -5, 2])).toBe(3)
  })

  it('is order-independent', () => {
    expect(nextSequence([5, 1, 3, 2])).toBe(4)
  })
})
