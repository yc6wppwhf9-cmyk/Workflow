import * as XLSX from 'xlsx'
import type { WorkBook } from 'xlsx'

export interface CuttingSheetItem {
  name: string         // section/item name from cutting sheet
  consumption: string  // CONSMP value
  unit: string         // mtr / pcs etc (inferred from context)
}

export function parseCuttingSheetFromWorkbook(workbook: WorkBook): CuttingSheetItem[] {
  let targetSheet = workbook.Sheets[workbook.SheetNames[0]]
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], { header: 1, defval: '' }) as string[][]
    if (rows.some(r => r.some(c => String(c).toUpperCase().includes('CONSMP')))) {
      targetSheet = workbook.Sheets[name]
      break
    }
  }
  return parseCuttingSheetRows(
    XLSX.utils.sheet_to_json<string[]>(targetSheet, { header: 1, defval: '' }) as string[][]
  )
}

export function parseCuttingSheet(buffer: ArrayBuffer): CuttingSheetItem[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  return parseCuttingSheetFromWorkbook(workbook)
}

function parseCuttingSheetRows(rows: string[][]): CuttingSheetItem[] {

  // Find header row and CONSMP column index
  let consmpCol = -1
  let nameCol = 0
  let headerRowIdx = -1

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    for (let c = 0; c < rows[i].length; c++) {
      const val = String(rows[i][c]).toUpperCase().trim()
      if (val.includes('CONSMP') || val === 'CONS') {
        consmpCol = c
        headerRowIdx = i
        break
      }
    }
    if (consmpCol >= 0) break
  }

  if (consmpCol < 0) return []

  const items: CuttingSheetItem[] = []
  let currentSection = ''

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const rawName = String(row[nameCol] || '').trim()
    const consmpRaw = String(row[consmpCol] || '').trim()

    if (!rawName) continue

    // Section header: non-empty name but no consmp value and no numeric columns
    // Detect by: short uppercase name, no numeric data in the row
    const isNumeric = (v: string) => !isNaN(parseFloat(v)) && parseFloat(v) > 0
    const hasNumericData = row.slice(1).some(v => isNumeric(String(v)))
    const looksLikeSection = !hasNumericData && rawName.length < 60 && rawName === rawName.toUpperCase()

    if (looksLikeSection && !isNumeric(consmpRaw)) {
      currentSection = rawName
      continue
    }

    // Row with CONSMP value
    if (isNumeric(consmpRaw)) {
      const consmpVal = parseFloat(consmpRaw)
      if (consmpVal <= 0) continue

      // Use current row's name if it looks like an item, otherwise use section name
      const itemName = rawName && rawName !== currentSection ? rawName : currentSection

      if (!itemName) continue

      // Infer unit: fabric/sponge/mesh = mtr, everything else = pcs
      const nameLower = itemName.toLowerCase()
      const isFabric = nameLower.includes('fabric') || nameLower.includes('foam') ||
        nameLower.includes('sponge') || nameLower.includes('mesh') || nameLower.includes('net') ||
        nameLower.includes('lining') || nameLower.includes('elastic') || nameLower.includes('patta') ||
        nameLower.includes('velcro') || nameLower.includes('piping')
      const unit = isFabric ? 'mtr' : 'pcs'

      items.push({ name: itemName, consumption: consmpVal.toString(), unit })
    }
  }

  return items
}

// Match cutting sheet items to BOM items by fuzzy name comparison
export function matchConsumptionToBom(
  bomItems: Array<{ inv_name: string; inv_code: string; consumption: string; unit: string }>,
  cuttingItems: CuttingSheetItem[],
): Array<{ inv_name: string; inv_code: string; consumption: string; unit: string }> {
  return bomItems.map(bom => {
    const bomNorm = normalize(bom.inv_name)
    let best: CuttingSheetItem | null = null
    let bestScore = 0

    for (const ci of cuttingItems) {
      const ciNorm = normalize(ci.name)
      const score = matchScore(bomNorm, ciNorm)
      if (score > bestScore) {
        bestScore = score
        best = ci
      }
    }

    if (best && bestScore >= 0.5) {
      return { ...bom, consumption: best.consumption, unit: best.unit || bom.unit }
    }
    return bom
  })
}

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

function matchScore(a: string, b: string): number {
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.8
  // Word overlap
  const wa = new Set(a.split(' '))
  const wb = new Set(b.split(' '))
  const common = [...wa].filter(w => wb.has(w) && w.length > 2).length
  const total = Math.max(wa.size, wb.size)
  return common / total
}
