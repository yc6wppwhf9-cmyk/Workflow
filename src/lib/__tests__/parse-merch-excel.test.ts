import { describe, it, expect } from 'vitest'
import {
  normaliseStyleName,
  filterSkusForProduct,
  extractColorTag,
  extractProductBaseName,
  type ParsedSKU,
} from '../parse-merch-excel'

function makeSku(styleName: string, overrides: Partial<ParsedSKU> = {}): ParsedSKU {
  return {
    styleName,
    weight: '500gm',
    color: 'Blue',
    dimensions: '18/12/6',
    height: '18',
    numberOfZips: '3',
    pocketCompartment: '2',
    mainCompartment: '1',
    uniquePurpose: 'School',
    laptopCompartment: 'NA',
    rainCover: 'Yes',
    backPadded: 'Yes',
    seasonYear: '2024-2025',
    bottleSlot: 'Yes',
    character: 'NA',
    theme: 'NA',
    mainMaterial: '600D Polyester',
    material: '190T Taffeta',
    designerName: 'Riya',
    ...overrides,
  }
}

describe('normaliseStyleName', () => {
  it('strips FC * prefix', () => {
    expect(normaliseStyleName('FC * Junior Backpack')).toBe('junior backpack')
  })

  it('strips alphanumeric * prefix', () => {
    expect(normaliseStyleName('AB123 * Trekker Pro')).toBe('trekker pro')
  })

  it('lowercases and collapses whitespace', () => {
    expect(normaliseStyleName('  Junior   Backpack  ')).toBe('junior backpack')
  })

  it('returns empty string for empty input', () => {
    expect(normaliseStyleName('')).toBe('')
  })
})

describe('filterSkusForProduct', () => {
  const skus = [
    makeSku('FC * Junior Backpack Blue'),
    makeSku('FC * Junior Backpack Red'),
    makeSku('FC * Trekker Pro Green'),
  ]

  it('returns matching SKUs for product name', () => {
    const result = filterSkusForProduct(skus, 'Junior Backpack')
    expect(result).toHaveLength(2)
    expect(result.map(s => s.styleName)).toEqual([
      'FC * Junior Backpack Blue',
      'FC * Junior Backpack Red',
    ])
  })

  it('falls back to all SKUs when nothing matches', () => {
    const result = filterSkusForProduct(skus, 'Unknown Product')
    expect(result).toHaveLength(3)
  })

  it('returns single exact match', () => {
    const result = filterSkusForProduct(skus, 'Trekker Pro Green')
    expect(result).toHaveLength(1)
  })
})

describe('extractColorTag', () => {
  it('extracts color suffix after product base name', () => {
    expect(extractColorTag('FC * Junior Backpack Blue', 'Junior Backpack')).toBe('Blue')
  })

  it('handles multi-word color', () => {
    expect(extractColorTag('FC * Junior Backpack Dark Red', 'Junior Backpack')).toBe('Dark Red')
  })

  it('returns full name if base not found', () => {
    expect(extractColorTag('FC * Trekker Pro Green', 'Junior Backpack')).toBe('Trekker Pro Green')
  })
})

describe('extractProductBaseName', () => {
  it('extracts common prefix from multiple SKU names', () => {
    const skus = [
      makeSku('FC * Junior Backpack Blue'),
      makeSku('FC * Junior Backpack Red'),
      makeSku('FC * Junior Backpack Green'),
    ]
    const base = extractProductBaseName(skus)
    expect(base.toLowerCase()).toContain('junior backpack')
  })

  it('returns the only name when there is one SKU', () => {
    const skus = [makeSku('FC * Trekker Pro')]
    const base = extractProductBaseName(skus)
    expect(base).toBe('Trekker Pro')
  })

  it('returns empty string for empty array', () => {
    expect(extractProductBaseName([])).toBe('')
  })
})
