import { describe, it, expect } from 'vitest'
import { matchConsumptionToBom } from '../parse-cutting-sheet'

// parseCuttingSheetRows is not exported, but we can test the exported
// functions that wrap it, and matchConsumptionToBom directly.

// Re-export parseCuttingSheetRows via a test-only shim by importing the
// internal function indirectly through the module.
// Instead, test the public surface: parseCuttingSheet only accepts ArrayBuffer
// (an Excel file), so we unit-test matchConsumptionToBom and the logic we can
// exercise without a real Excel file.

describe('matchConsumptionToBom', () => {
  const cutting = [
    { name: 'Main Fabric', consumption: '1.5', unit: 'mtr' },
    { name: 'Zipper 10mm', consumption: '2', unit: 'pcs' },
    { name: 'Foam Padding', consumption: '0.8', unit: 'mtr' },
  ]

  it('enriches exact-match BOM item with cutting consumption', () => {
    const bom = [{ inv_name: 'Main Fabric', inv_code: 'MF001', consumption: '', unit: '' }]
    const result = matchConsumptionToBom(bom, cutting)
    expect(result[0].consumption).toBe('1.5')
    expect(result[0].unit).toBe('mtr')
  })

  it('enriches partial-match BOM item (substring)', () => {
    const bom = [{ inv_name: 'Fabric', inv_code: 'MF001', consumption: '', unit: '' }]
    const result = matchConsumptionToBom(bom, cutting)
    expect(result[0].consumption).toBe('1.5')
  })

  it('leaves unmatched BOM item unchanged', () => {
    const bom = [{ inv_name: 'Velcro Strap XYZ123', inv_code: 'V999', consumption: '3', unit: 'pcs' }]
    const result = matchConsumptionToBom(bom, cutting)
    expect(result[0].consumption).toBe('3')
    expect(result[0].unit).toBe('pcs')
  })

  it('matches zipper by word overlap', () => {
    const bom = [{ inv_name: 'Zipper', inv_code: 'Z001', consumption: '', unit: '' }]
    const result = matchConsumptionToBom(bom, cutting)
    expect(result[0].consumption).toBe('2')
    expect(result[0].unit).toBe('pcs')
  })

  it('handles empty cutting items gracefully', () => {
    const bom = [{ inv_name: 'Main Fabric', inv_code: 'MF001', consumption: '', unit: '' }]
    const result = matchConsumptionToBom(bom, [])
    expect(result[0].consumption).toBe('')
  })

  it('handles empty BOM gracefully', () => {
    const result = matchConsumptionToBom([], cutting)
    expect(result).toHaveLength(0)
  })

  it('preserves all original BOM fields on match', () => {
    const bom = [{ inv_name: 'Foam Padding', inv_code: 'FP002', consumption: '', unit: '' }]
    const result = matchConsumptionToBom(bom, cutting)
    expect(result[0].inv_code).toBe('FP002')
    expect(result[0].inv_name).toBe('Foam Padding')
    expect(result[0].consumption).toBe('0.8')
    expect(result[0].unit).toBe('mtr')
  })
})
