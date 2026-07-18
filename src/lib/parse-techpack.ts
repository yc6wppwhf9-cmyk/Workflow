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
  patta075: string
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

// Normalise a cell for keyword matching: uppercase, strip dashes/colons/spaces,
// plus dots and quote characters (so "ZIPPER 8 NO.- " and 'PATTA 1"- ' match cleanly).
function norm(s: string): string {
  return String(s).toUpperCase().replace(/[-:.\s"'""'']/g, '')
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

// Pull a short colour code out of a spec cell. Colour codes sit at the end of
// values like "ZIP 5 12GM  LPNK" or "PA 9MM 400D  RBL", and a cell may list
// two ("RBL, MDBRN") — we take the primary (first) one.
function colourCode(s: string): string {
  const t = String(s ?? '').trim()
  if (!t) return ''
  const lastToken = t.split(/\s+/).pop() ?? t
  return lastToken.split(',')[0].trim()
}

export interface TechPackVariant extends TechPackFields {
  colourName: string
  colorSkusStr?: string
  colourSkus?: string[]
  channel?: string
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
    patta075:      extract(rows, 'PATTA 0.75"',   offset),
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
// Or one per COLOR SKU in the block-based layout.
// Falls back to a single unnamed variant when no multi-colour structure is detected.
export function parseTechPackAllVariants(rows: string[][]): TechPackVariant[] {
  // 1. Try to detect "DESIGN NO." block bases (ROCK TECKPACK format)
  // Some files stack multiple bands of 4 designs vertically — find ALL band-start rows.
  const bandRowIdxs: number[] = []
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (norm(rows[r][c]).startsWith('DESIGNNO')) {
        bandRowIdxs.push(r)
        break
      }
    }
  }

  if (bandRowIdxs.length > 0) {
    const variants: TechPackVariant[] = []

    const map: Record<string, keyof TechPackFields> = {
      DESIGNERNAME: 'designerName', STYLENAME: 'styleName', FARMA: 'farma',
      AIRMESH: 'airMesh', FABRIC1: 'fabric', FABRIC: 'fabric', LINING: 'lining',
      '9MMPATTAHANGER': 'patta9mm', '9MMPATTA': 'patta9mm', PULLER: 'puller', LADERLOCK: 'laderLock',
      ZIPPER8NO: 'zipper', ZIPPER: 'zipper', DIGITALPRINT: 'digitalPrint',
      PATTA075: 'patta075', PATTA1: 'patta1', PATTA: 'patta1', SCREENPRINT: 'screenPrint',
      BRANDING: 'branding', PATTA15: 'patta2', REMARKS: 'remarks', BARTACK: 'bartech', BARTECH: 'bartech',
      RESAMPLINGBY: 'reSamplingBy', ADDON1: 'addOn1', ADDON2: 'addOn2',
      ADDON3: 'addOn3', DESIGNERSIGN: 'designerSign',
    }

    let globalDesignIdx = 0

    for (let b = 0; b < bandRowIdxs.length; b++) {
      const bandStart = bandRowIdxs[b]
      const bandEnd   = b + 1 < bandRowIdxs.length ? bandRowIdxs[b + 1] : rows.length
      const bandRows  = rows.slice(bandStart, bandEnd)

      // Season year: look in the rows just before this band's header (or in the header row itself)
      let seasonYear = ''
      const lookRows = b === 0 ? rows.slice(0, bandStart + 3) : rows.slice(bandStart - 2, bandStart + 3)
      for (const row of lookRows) {
        for (const cell of row) {
          if (/^\d{4}-\d{4}$/.test(String(cell).trim())) {
            seasonYear = String(cell).trim()
            break
          }
        }
        if (seasonYear) break
      }

      // Find column bases in this band's header row
      const bases: number[] = []
      for (let c = 0; c < rows[bandStart].length; c++) {
        if (norm(rows[bandStart][c]).startsWith('DESIGNNO')) bases.push(c)
      }

      bases.forEach((B, idx) => {
        const next = bases[idx + 1] ?? B + 7
        const width = next - B

        const f: Partial<TechPackFields> = {}
        let colourSkuRaw = ''
        let channelRaw = ''
        let fabric2 = ''

        for (const row of bandRows) {
          for (let off = 0; off + 1 < width; off += 2) {
            const rawLabel = String(row[B + off] ?? '')
            // Some sheets cram the value into the label cell, e.g.
            // "FARMA -cupcake, 16 INCH" with an empty value cell beside it.
            const sep = rawLabel.search(/[-–:]/)
            const labelText   = sep >= 0 ? rawLabel.slice(0, sep) : rawLabel
            const inlineValue = sep >= 0 ? rawLabel.slice(sep + 1).trim() : ''
            const label = norm(labelText)
            // Fold size/number variants like "ZIPPER 5 NO", "PULLER 5 NO" → ZIPPER / PULLER
            // (the size digit changes per style, so an exact map key can't keep up).
            const folded = label.replace(/\d+NO$/, '')
            const value = String(row[B + off + 1] ?? '').trim() || inlineValue

            if (label === 'COLORSKU' || label === 'COLOURSKU') {
              if (value) colourSkuRaw = value
            } else if (label === 'CHANNEL') {
              if (value) channelRaw = value
            } else if (label === 'FABRIC2') {
              if (value) fabric2 = value
            } else {
              const key = map[label] || map[folded]
              if (key && value && !f[key]) f[key] = value
            }
          }
        }
        if (fabric2) f.fabric = f.fabric ? `${f.fabric} / ${fabric2}` : fabric2

        const baseVariant: TechPackFields = {
          designerName: f.designerName ?? '',
          styleName:    f.styleName ?? '',
          farma:        f.farma ?? '',
          seasonYear,
          fabric:       f.fabric ?? '',
          lining:       f.lining ?? '',
          airMesh:      f.airMesh ?? '',
          zipper:       f.zipper ?? '',
          puller:       f.puller ?? '',
          patta9mm:     f.patta9mm ?? '',
          patta075:     f.patta075 ?? '',
          patta1:       f.patta1 ?? '',
          patta2:       f.patta2 ?? '',
          laderLock:    f.laderLock ?? '',
          branding:     f.branding ?? '',
          screenPrint:  f.screenPrint ?? '',
          digitalPrint: f.digitalPrint ?? '',
          bartech:      f.bartech ?? '',
          reSamplingBy: f.reSamplingBy ?? '',
          remarks:      f.remarks ?? '',
          addOn1:       f.addOn1 ?? '',
          addOn2:       f.addOn2 ?? '',
          addOn3:       f.addOn3 ?? '',
          designerSign: f.designerSign ?? '',
        }

        // Colour code lives at the tail of a spec cell — airMesh is usually the
        // cleanest ("LPNK"); fall back to zipper / other trims. (Using zipper's
        // whole value here previously produced "Design 1 — ZIP 5 12GM LPNK".)
        const colourToken =
          colourCode(baseVariant.airMesh) ||
          colourCode(baseVariant.zipper) ||
          colourCode(baseVariant.laderLock) ||
          colourCode(baseVariant.patta9mm)
        const skus = colourSkuRaw.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
        const designNum = globalDesignIdx + 1

        variants.push({
          ...baseVariant,
          colourName:   colourToken ? `Design ${designNum} — ${colourToken}` : `Design ${designNum}`,
          colorSkusStr: colourSkuRaw,
          colourSkus:   skus,
          channel:      channelRaw,
        })

        globalDesignIdx++
      })
    }

    // Every block lists the full style colourway in COLOR SKU — union them so the
    // form gets the complete SKU set regardless of which design is loaded.
    const allSkus = Array.from(new Set(variants.flatMap(v => v.colourSkus ?? [])))
    for (const v of variants) v.colourSkus = allSkus

    return variants
  }

  // 2. Fallback to old format
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
    patta075:      extract(rows, 'PATTA 0.75"'),
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
