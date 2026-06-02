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

// Return the cell at `col + offset` (default offset=1 = adjacent value).
function valueAt(row: string[], col: number, offset = 1): string {
  return String(row[col + offset] ?? '').trim()
}

// Find the Nth (0-indexed) cell that EXACTLY matches the normalised keyword and return its value at offset.
// Exact match prevents "9MM PATTA" from matching keyword "PATTA" (9MMPATTA !== PATTA).
function extractNth(rows: string[][], keyword: string, nth = 0, offset = 1): string {
  const kw = norm(keyword)
  let count = 0
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      if (norm(row[c]) === kw) {
        if (count === nth) return valueAt(row, c, offset)
        count++
      }
    }
  }
  return ''
}

function extract(rows: string[][], keyword: string, offset = 1): string {
  return extractNth(rows, keyword, 0, offset)
}

export interface TechPackVariant extends TechPackFields {
  colourName: string
}

// Detect colour names and their column offsets from a SAMPLE COLOR row.
// Returns offsets relative to each label column (1-based: first colour = 1, second = 2, …).
function detectColours(rows: string[][]): string[] {
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      if (norm(row[c]) === 'SAMPLECOLOR') {
        const names: string[] = []
        for (let i = c + 1; i < Math.min(c + 8, row.length); i++) {
          const val = String(row[i] ?? '').trim()
          if (!val) break
          names.push(val)
        }
        if (names.length > 1) return names
      }
    }
  }
  return []
}

// Parse one TechPackFields set at a specific column offset (1 = first value after label).
function parseAtOffset(rows: string[][], offset: number, shared: Partial<TechPackFields>): TechPackFields {
  const seasonYear = shared.seasonYear ?? (() => {
    for (const row of rows.slice(0, 5))
      for (const cell of row)
        if (/^\d{4}-\d{4}$/.test(String(cell).trim())) return String(cell).trim()
    return ''
  })()
  return {
    designerName:  shared.designerName  ?? extract(rows, 'DESIGNER NAME'),
    styleName:     shared.styleName     ?? extract(rows, 'STYLE NAME'),
    farma:         shared.farma         ?? extract(rows, 'FARMA'),
    seasonYear,
    fabric:        extract(rows, 'FABRIC',        offset),
    lining:        extract(rows, 'LINING',        offset),
    airMesh:       extract(rows, 'AIR MESH',      offset),
    zipper:        extract(rows, 'ZIPPER',        offset),
    puller:        extract(rows, 'PULLER',        offset),
    patta9mm:      extract(rows, '9MM PATTA',     offset),
    patta1:        extractNth(rows, 'PATTA', 0,   offset),
    patta2:        extractNth(rows, 'PATTA', 1,   offset),
    laderLock:     extract(rows, 'LADER LOCK',    offset),
    branding:      extract(rows, 'BRANDING',      offset),
    screenPrint:   extract(rows, 'SCREEN PRINT',  offset),
    digitalPrint:  extract(rows, 'DIGITAL PRINT', offset),
    bartech:       extract(rows, 'BARTECH',       offset),
    reSamplingBy:  extract(rows, 'RE-SAMPLING BY',offset),
    remarks:       extract(rows, 'REMARKS',       offset),
    addOn1:        extract(rows, 'ADD ON 1',      offset),
    addOn2:        extract(rows, 'ADD ON 2',      offset),
    addOn3:        extract(rows, 'ADD ON 3',      offset),
    designerSign:  extract(rows, 'DESIGNER SIGN', offset),
  }
}

// Returns one TechPackVariant per colour column found in the sheet.
// Falls back to a single unnamed variant when no multi-colour structure is detected.
export function parseTechPackAllVariants(rows: string[][]): TechPackVariant[] {
  const colours = detectColours(rows)
  if (colours.length === 0) {
    return [{ ...parseTechPackRows(rows), colourName: '' }]
  }
  // Fields shared across colours (header area — offset 1 from first occurrence)
  const shared: Partial<TechPackFields> = {
    designerName: extract(rows, 'DESIGNER NAME'),
    styleName:    extract(rows, 'STYLE NAME'),
    farma:        extract(rows, 'FARMA'),
  }
  return colours.map((colourName, i) => ({
    colourName,
    ...parseAtOffset(rows, i + 1, shared),
  }))
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
