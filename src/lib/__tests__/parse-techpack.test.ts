import { describe, it, expect } from 'vitest'
import {
  parseTechPackRows,
  parseTechPackAllVariants,
  parseTechPackWorkbook,
  countFilledFields,
} from '../parse-techpack'

function makeRows(pairs: [string, string][], prefix: string[][] = []): string[][] {
  return [...prefix, ...pairs.map(([label, val]) => [label, val, '', ''])]
}

describe('parseTechPackRows', () => {
  it('extracts designer name and style name', () => {
    const rows = makeRows([
      ['DESIGNER NAME', 'Riya Sharma'],
      ['STYLE NAME', 'Junior Backpack XL'],
    ])
    const result = parseTechPackRows(rows)
    expect(result.designerName).toBe('Riya Sharma')
    expect(result.styleName).toBe('Junior Backpack XL')
  })

  it('extracts season year from YYYY-YYYY pattern in first 3 rows', () => {
    const rows: string[][] = [
      ['PLM System', '2024-2025', '', ''],
      ['DESIGNER NAME', 'Riya', '', ''],
    ]
    const result = parseTechPackRows(rows)
    expect(result.seasonYear).toBe('2024-2025')
  })

  it('returns empty strings for missing fields', () => {
    const rows = makeRows([['DESIGNER NAME', 'Riya']])
    const result = parseTechPackRows(rows)
    expect(result.fabric).toBe('')
    expect(result.zipper).toBe('')
    expect(result.laderLock).toBe('')
  })

  it('extracts fabric and lining', () => {
    const rows = makeRows([
      ['FABRIC', '600D Polyester'],
      ['LINING', '190T Taffeta'],
    ])
    const result = parseTechPackRows(rows)
    expect(result.fabric).toBe('600D Polyester')
    expect(result.lining).toBe('190T Taffeta')
  })

  it('extracts patta fields (nth match)', () => {
    // Values must not contain 'PATTA' as substring, otherwise the normaliser
    // would match the value cell as a second occurrence of the keyword.
    const rows: string[][] = [
      ['PATTA', 'Red', '', ''],
      ['PATTA', 'Blue', '', ''],
    ]
    const result = parseTechPackRows(rows)
    expect(result.patta1).toBe('Red')
    expect(result.patta2).toBe('Blue')
  })

  it('extracts remarks and add-on fields', () => {
    const rows = makeRows([
      ['REMARKS', 'Check zipper colour'],
      ['ADD ON 1', 'Extra keychain'],
      ['ADD ON 2', 'Rain cover'],
      ['ADD ON 3', 'Luggage tag'],
    ])
    const result = parseTechPackRows(rows)
    expect(result.remarks).toBe('Check zipper colour')
    expect(result.addOn1).toBe('Extra keychain')
    expect(result.addOn2).toBe('Rain cover')
    expect(result.addOn3).toBe('Luggage tag')
  })

  it('handles empty rows gracefully', () => {
    const result = parseTechPackRows([])
    expect(result.designerName).toBe('')
    expect(result.seasonYear).toBe('')
  })

  it('is case-insensitive on season year detection', () => {
    const rows: string[][] = [
      ['', '', '', ''],
      ['Header', '2023-2024', '', ''],
    ]
    const result = parseTechPackRows(rows)
    expect(result.seasonYear).toBe('2023-2024')
  })
})

describe('countFilledFields', () => {
  it('counts only non-empty fields', () => {
    const variants = parseTechPackWorkbook([
      { name: 'Sheet1', rows: makeRows([['FABRIC', '600D'], ['ZIPPER', 'YKK 5']]) },
    ]).variants
    expect(countFilledFields(variants[0])).toBe(2)
  })

  it('is zero for a variant parsed from unrecognised rows', () => {
    const [variant] = parseTechPackAllVariants([['Some', 'unrelated'], ['content', 'here']])
    expect(countFilledFields(variant)).toBe(0)
  })
})

describe('parseTechPackWorkbook', () => {
  it('picks the sheet that carries the tech pack, not just the first one', () => {
    const result = parseTechPackWorkbook([
      { name: 'Cover', rows: [['High Spirit'], ['Index']] },
      { name: 'Notes', rows: [['internal notes only']] },
      { name: 'TECHPACK', rows: makeRows([
        ['DESIGNER NAME', 'Riya Sharma'],
        ['FABRIC', '600D Polyester'],
        ['ZIPPER', 'YKK 5'],
      ]) },
    ])
    expect(result.sheetName).toBe('TECHPACK')
    expect(result.filledCount).toBe(3)
    expect(result.variants[0].fabric).toBe('600D Polyester')
  })

  it('reports filledCount 0 when no sheet matches, so the caller can refuse to save', () => {
    const result = parseTechPackWorkbook([
      { name: 'Cover', rows: [['High Spirit'], ['Index']] },
      { name: 'Notes', rows: [['nothing', 'useful']] },
    ])
    expect(result.filledCount).toBe(0)
    expect(result.sheetName).toBe('')
  })

  it('lists every sheet it tried, for the failure message', () => {
    const result = parseTechPackWorkbook([
      { name: 'Cover', rows: [['x']] },
      { name: 'Data', rows: [['y']] },
    ])
    expect(result.sheetsTried).toEqual(['Cover', 'Data'])
  })

  it('handles a workbook with no sheets', () => {
    const result = parseTechPackWorkbook([])
    expect(result.filledCount).toBe(0)
    expect(result.variants).toEqual([])
    expect(result.sheetsTried).toEqual([])
  })
})
