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
  patta1: string
  patta2: string
  laderLock: string
  branding: string
  screenPrint: string
  digitalPrint: string
  bartech: string
  reSamplingBy: string
  remarks: string
  addOn1: string
  addOn2: string
  addOn3: string
  designerSign: string
}

// Normalise a cell for keyword matching: uppercase, strip dashes/colons/spaces
function norm(s: string): string {
  return String(s).toUpperCase().replace(/[-:\s]/g, '')
}

// Return the cell immediately after the label (values are always adjacent in col+1).
// Skipping empty cells was the bug — it caused empty values to grab the next label.
function valueAt(row: string[], col: number): string {
  return String(row[col + 1] ?? '').trim()
}

// Find the Nth (0-indexed) cell that EXACTLY matches the normalised keyword and return its adjacent value.
// Exact match prevents "9MM PATTA" from matching keyword "PATTA" (9MMPATTA !== PATTA).
function extractNth(rows: string[][], keyword: string, nth = 0): string {
  const kw = norm(keyword)
  let count = 0
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      if (norm(row[c]) === kw) {
        if (count === nth) return valueAt(row, c)
        count++
      }
    }
  }
  return ''
}

function extract(rows: string[][], keyword: string): string {
  return extractNth(rows, keyword, 0)
}

export function parseTechPackRows(rows: string[][]): TechPackFields {
  // Season year: look for YYYY-YYYY pattern in first 3 rows
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

  return {
    designerName:  extract(rows, 'DESIGNER NAME'),
    styleName:     extract(rows, 'STYLE NAME'),
    farma:         extract(rows, 'FARMA'),
    seasonYear,
    fabric:        extract(rows, 'FABRIC'),
    lining:        extract(rows, 'LINING'),
    airMesh:       extract(rows, 'AIR MESH'),
    zipper:        extract(rows, 'ZIPPER'),
    puller:        extract(rows, 'PULLER'),
    patta9mm:      extract(rows, '9MM PATTA'),
    patta1:        extractNth(rows, 'PATTA', 0),
    patta2:        extractNth(rows, 'PATTA', 1),
    laderLock:     extract(rows, 'LADER LOCK'),
    branding:      extract(rows, 'BRANDING'),
    screenPrint:   extract(rows, 'SCREEN PRINT'),
    digitalPrint:  extract(rows, 'DIGITAL PRINT'),
    bartech:       extract(rows, 'BARTECH'),
    reSamplingBy:  extract(rows, 'RE-SAMPLING BY'),
    remarks:       extract(rows, 'REMARKS'),
    addOn1:        extract(rows, 'ADD ON 1'),
    addOn2:        extract(rows, 'ADD ON 2'),
    addOn3:        extract(rows, 'ADD ON 3'),
    designerSign:  extract(rows, 'DESIGNER SIGN'),
  }
}
