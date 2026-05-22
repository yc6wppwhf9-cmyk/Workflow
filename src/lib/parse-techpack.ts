export interface TechPackFields {
  designerName: string
  styleName: string
  farma: string
  seasonYear: string
  fabric: string
  lining: string
  airMesh: string
  zipper: string
  puller: string
  patta9mm: string
  patta: string
  laderLock: string
  branding: string
  screenPrint: string
  digitalPrint: string
  bartech: string
  remarks: string
  addOns: string[]
}

// Normalise a cell string for keyword matching: uppercase, strip dashes/colons/spaces
function norm(s: string): string {
  return String(s).toUpperCase().replace(/[-:\s]/g, '')
}

// Scan all rows for a cell whose normalised text contains the keyword,
// then return the first non-empty cell that follows it in the same row.
function extract(rows: string[][], keyword: string): string {
  const kw = norm(keyword)
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      const cell = norm(row[c])
      if (cell.includes(kw) && cell.length < kw.length + 10) {
        for (let v = c + 1; v < row.length; v++) {
          const val = String(row[v] || '').trim()
          if (val) return val
        }
      }
    }
  }
  return ''
}

export function parseTechPackRows(rows: string[][]): TechPackFields {
  // Season year: look for a cell matching YYYY-YYYY pattern in the first few rows
  let seasonYear = ''
  for (const row of rows.slice(0, 3)) {
    for (const cell of row) {
      if (/^\d{4}-\d{4}$/.test(String(cell).trim())) {
        seasonYear = String(cell).trim()
        break
      }
    }
    if (seasonYear) break
  }

  // ADD ON values
  const addOns: string[] = []
  for (let i = 1; i <= 3; i++) {
    const v = extract(rows, `ADD ON ${i}`)
    if (v) addOns.push(v)
  }

  return {
    designerName: extract(rows, 'DESIGNER NAME'),
    styleName: extract(rows, 'STYLE NAME'),
    farma: extract(rows, 'FARMA'),
    seasonYear,
    fabric: extract(rows, 'FABRIC'),
    lining: extract(rows, 'LINING'),
    airMesh: extract(rows, 'AIR MESH'),
    zipper: extract(rows, 'ZIPPER'),
    puller: extract(rows, 'PULLER'),
    patta9mm: extract(rows, '9MM PATTA'),
    patta: extract(rows, 'PATTA'),
    laderLock: extract(rows, 'LADER LOCK'),
    branding: extract(rows, 'BRANDING'),
    screenPrint: extract(rows, 'SCREEN PRINT'),
    digitalPrint: extract(rows, 'DIGITAL PRINT'),
    bartech: extract(rows, 'BARTECH'),
    remarks: extract(rows, 'REMARKS'),
    addOns,
  }
}

// Build a compact spec block for unique_feature from the parsed fields
export function buildSpecText(f: TechPackFields): string {
  const lines: string[] = []

  const row1 = [
    f.fabric && `Fabric: ${f.fabric}`,
    f.lining && `Lining: ${f.lining}`,
    f.airMesh && f.airMesh.toUpperCase() !== 'NA' && `Air Mesh: ${f.airMesh}`,
  ].filter(Boolean).join(' · ')
  if (row1) lines.push(row1)

  const row2 = [
    f.zipper && `Zipper: ${f.zipper}`,
    f.puller && `Puller: ${f.puller}`,
    f.patta9mm && f.patta9mm.toUpperCase() !== 'NA' && `9mm Patta: ${f.patta9mm}`,
  ].filter(Boolean).join(' · ')
  if (row2) lines.push(row2)

  const row3 = [
    f.patta && f.patta.toUpperCase() !== 'NA' && `Patta: ${f.patta}`,
    f.laderLock && f.laderLock.toUpperCase() !== 'NA' && `Lader Lock: ${f.laderLock}`,
  ].filter(Boolean).join(' · ')
  if (row3) lines.push(row3)

  const row4 = [
    f.branding && f.branding.toUpperCase() !== 'NA' && `Branding: ${f.branding}`,
    f.bartech && f.bartech.toUpperCase() !== 'NA' && `Bartech: ${f.bartech}`,
    f.screenPrint && f.screenPrint.toUpperCase() !== 'NA' && `Screen Print: ${f.screenPrint}`,
    f.digitalPrint && f.digitalPrint.toUpperCase() !== 'NA' && `Digital Print: ${f.digitalPrint}`,
  ].filter(Boolean).join(' · ')
  if (row4) lines.push(row4)

  if (f.addOns.length > 0) lines.push(`Add-ons: ${f.addOns.join(', ')}`)
  if (f.remarks && f.remarks.toUpperCase() !== 'NA') lines.push(`Remarks: ${f.remarks}`)

  return lines.join('\n')
}
