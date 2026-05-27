import * as XLSX from 'xlsx'
import { resolveColorName } from './color-maps'
import { parseCuttingSheetFromWorkbook } from './parse-cutting-sheet'

export interface ParsedMerchData {
  skus: ParsedSKU[]
  bomItems: ParsedBOMItem[]           // aggregated for the matched product column
  bomByStyle: Record<string, ParsedBOMItem[]>  // keyed by normalised style name
  cuttingItems: import('./parse-cutting-sheet').CuttingSheetItem[]  // from cutting sheet tab
  images: ParsedImage[]
}

export interface ParsedSKU {
  styleName: string
  weight: string
  color: string
  dimensions: string
  height: string
  numberOfZips: string
  pocketCompartment: string
  mainCompartment: string
  uniquePurpose: string
  laptopCompartment: string
  rainCover: string
  backPadded: string
  seasonYear: string
  bottleSlot: string
  character: string
  theme: string
  mainMaterial: string
  material: string
  designerName: string
}

export interface ParsedBOMItem {
  inv_code: string
  inv_name: string
  consumption: string
  unit: string
}

export interface ParsedImage {
  name: string
  data: ArrayBuffer
  extension: string
}

// Strip "FC * " / "FC*" style prefixes then normalise whitespace
export function normaliseStyleName(s: string) {
  return s.replace(/^[A-Z0-9]+\s*\*\s*/i, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function findSheet(workbook: XLSX.WorkBook, keyword: string) {
  const name = workbook.SheetNames.find(n => n.toUpperCase().replace(/\s+/g, ' ').includes(keyword.toUpperCase()))
  return name ? workbook.Sheets[name] : undefined
}

export function parseMerchExcel(buffer: ArrayBuffer, productName?: string): ParsedMerchData {
  const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true })

  const skus: ParsedSKU[] = []
  let bomItems: ParsedBOMItem[] = []
  const images: ParsedImage[] = []

  // ── Parse ATTRIBUTES sheet ────────────────────────────────────────────────
  // Supports two layouts:
  //   Transposed (ATTRIBUTES sheet):  col 0 = labels, col 1+ = one value per colour variant
  //   Side-by-side (ATTRIBUTES FORMAT): row 0 = style names, then 3-col groups (label, value, empty)
  const attrSheet = findSheet(workbook, 'ATTRIBUTES FORMAT') ?? findSheet(workbook, 'ATTRIBUTES')
  if (attrSheet) {
    const rows = XLSX.utils.sheet_to_json<string[]>(attrSheet, { header: 1, defval: '' }) as string[][]

    const fieldMap: Record<string, keyof ParsedSKU> = {
      'COLOR': 'color',
      'WEIGHT (GM)': 'weight', 'WEIGHT (Gm)': 'weight', 'WEIGHT (GMS)': 'weight',
      'HEIGHT (IN)': 'height', 'HEIGHT (In)': 'height',
      'DIMENSION (L W D)': 'dimensions', 'DIMENSION (L W D) IN INCH': 'dimensions',
      'NUMBER OF ZIP': 'numberOfZips', 'NUMBER OF ZIPS': 'numberOfZips',
      'POCKET COMPARTMENT': 'pocketCompartment',
      'MAIN COMPARTMENT': 'mainCompartment',
      'UNIQUE PURPOSE': 'uniquePurpose',
      'LAPTOP COMPARTMENT': 'laptopCompartment',
      'RAIN COVER': 'rainCover',
      'BACK PADDED OR NON': 'backPadded', 'BACK PADDED': 'backPadded',
      'SEASON + YEAR': 'seasonYear', 'SEASON+YEAR': 'seasonYear',
      'BOTTLE SLOT': 'bottleSlot', 'BOTTLE SLOTS': 'bottleSlot',
      'CHARACTER': 'character',
      'THEME': 'theme',
      'MAIN MATERIAL': 'mainMaterial',
      'MATERIAL': 'material',
      'DESIGNER NAME': 'designerName',
    }

    const normLabel = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ')
    const isKnownLabel = (s: string) => !!fieldMap[normLabel(s)]

    // Detect layout: if col-0 of first non-empty row is a known field label → transposed
    const firstCell = String(rows[0]?.[0] || '').trim()
    const isTransposed = isKnownLabel(firstCell)

    if (isTransposed) {
      // Transposed format: labels in col A, one colour variant per column B, C, D…
      const numCols = rows[0]?.length || 0
      for (let c = 1; c < numCols; c++) {
        const sku: ParsedSKU = {
          styleName: '', weight: '', color: '', dimensions: '', height: '',
          numberOfZips: '', pocketCompartment: '', mainCompartment: '',
          uniquePurpose: '', laptopCompartment: '', rainCover: '',
          backPadded: '', seasonYear: '', bottleSlot: '', character: '',
          theme: '', mainMaterial: '', material: '', designerName: '',
        }
        for (let row = 0; row < rows.length; row++) {
          const label = normLabel(String(rows[row]?.[0] || ''))
          const value = String(rows[row]?.[c] || '').trim()
          const field = fieldMap[label]
          if (field && value && value !== '0') sku[field] = value
        }
        // Must have at least a colour or weight to be a real variant column
        if (!sku.color && !sku.weight) continue
        sku.styleName = sku.color || `variant_${c}`
        skus.push(sku)
      }
    } else {
      // Side-by-side format: row 0 = style names, each SKU in 3 columns (label, value, empty)
      const numColumns = Math.floor((rows[0]?.length || 0) / 3)
      for (let col = 0; col < numColumns; col++) {
        const baseCol = col * 3
        const styleName = String(rows[0]?.[baseCol] || '').trim()
        if (!styleName || styleName === '0' || /^\d+$/.test(styleName)) continue
        const sku: ParsedSKU = {
          styleName, weight: '', color: '', dimensions: '', height: '',
          numberOfZips: '', pocketCompartment: '', mainCompartment: '',
          uniquePurpose: '', laptopCompartment: '', rainCover: '',
          backPadded: '', seasonYear: '', bottleSlot: '', character: '',
          theme: '', mainMaterial: '', material: '', designerName: '',
        }
        for (let row = 1; row < rows.length; row++) {
          const label = normLabel(String(rows[row]?.[baseCol] || ''))
          const value = String(rows[row]?.[baseCol + 1] || '').trim()
          const field = fieldMap[label]
          if (field && value && value !== '0') sku[field] = value
        }
        skus.push(sku)
      }
    }
  }

  // ── Parse INV SHEET RM ────────────────────────────────────────────────────
  // Actual format: row N = header [ITEM NAME, StyleA, CONSMP, StyleB, CONSMP, ...]
  //                rows N+1... = [CategoryLabel, item_for_A, consmp_A, item_for_B, consmp_B, ...]
  // Style columns are at odd indices (1, 3, 5...); CONSMP columns follow each at +1.
  const bomByStyle: Record<string, ParsedBOMItem[]> = {}
  const invSheet = findSheet(workbook, 'INV SHEET RM') ?? findSheet(workbook, 'INV SHEET')
  if (invSheet) {
    const rows = XLSX.utils.sheet_to_json<string[]>(invSheet, { header: 1, defval: '' }) as string[][]

    let headerRowIdx = -1
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      if (rows[i].some(c => String(c || '').toUpperCase().includes('ITEM NAME') || String(c || '').toUpperCase().includes('ITEMS'))) {
        headerRowIdx = i
        break
      }
    }

    if (headerRowIdx >= 0) {
      const headerRow = rows[headerRowIdx]

      // Identify style columns — skip "CONSMP" and empty headers; each style's CONSMP is at col+1
      const styleColumns: Array<{ col: number; styleKey: string; consmpCol: number }> = []
      for (let c = 1; c < headerRow.length; c++) {
        const raw = String(headerRow[c] || '').trim()
        if (!raw || raw === '0' || raw.toUpperCase() === 'CONSMP') continue
        styleColumns.push({ col: c, styleKey: normaliseStyleName(raw), consmpCol: c + 1 })
      }

      // Parse item rows: style col = inv name (e.g. 'FB PU 1000 D 270 BLK'), consmpCol = consumption
      // inv_code is matched from the database at save time, not stored here
      for (const { col, styleKey, consmpCol } of styleColumns) {
        const items: ParsedBOMItem[] = []
        for (let i = headerRowIdx + 1; i < rows.length; i++) {
          const invName = String(rows[i]?.[col] || '').trim()
          if (!invName || invName === '0' || invName.toUpperCase() === 'NA') continue
          const rawConsump = rows[i]?.[consmpCol]
          const numConsump = rawConsump !== null && rawConsump !== undefined ? parseFloat(String(rawConsump)) : NaN
          const consumption = !isNaN(numConsump) && numConsump !== 0
            ? parseFloat(numConsump.toFixed(4)).toString()
            : ''
          items.push({ inv_code: '', inv_name: invName, consumption, unit: '' })
        }
        if (items.length > 0) bomByStyle[styleKey] = items
      }

      // Aggregate bomItems for the matched product column (used for log count)
      if (productName) {
        const pnNorm = productName.toLowerCase().replace(/\s+/g, ' ').trim()
        const pnCompact = pnNorm.replace(/\s/g, '')
        for (const { styleKey } of styleColumns) {
          const compact = styleKey.replace(/\s/g, '')
          if (styleKey.startsWith(pnNorm) || pnNorm.startsWith(styleKey) ||
              compact.startsWith(pnCompact) || pnCompact.startsWith(compact)) {
            bomItems.push(...(bomByStyle[styleKey] || []))
            break
          }
        }
        if (bomItems.length === 0 && styleColumns.length > 0) {
          bomItems.push(...(bomByStyle[styleColumns[0].styleKey] || []))
        }
      }
    }
  }

  // ── Fallback: derive SKUs from INV SHEET column names when ATTRIBUTES gave nothing ──
  // Finds common prefix of all style keys (= product base name), remainder = colour
  if (skus.length === 0 && Object.keys(bomByStyle).length > 0) {
    const keys = Object.keys(bomByStyle)
    let base = keys[0]
    for (const k of keys.slice(1)) {
      let i = 0
      while (i < base.length && i < k.length && base[i] === k[i]) i++
      base = base.slice(0, i)
    }
    base = base.trim()
    for (const styleKey of keys) {
      const color = base && styleKey.startsWith(base) ? styleKey.slice(base.length).trim() : styleKey
      skus.push({
        styleName: styleKey, color,
        weight: '', dimensions: '', height: '', numberOfZips: '',
        pocketCompartment: '', mainCompartment: '', uniquePurpose: '',
        laptopCompartment: '', rainCover: '', backPadded: '', seasonYear: '',
        bottleSlot: '', character: '', theme: '', mainMaterial: '', material: '',
        designerName: '',
      })
    }
  }

  // ── Parse cutting sheet (any sheet with CONSMP column) ───────────────────
  const cuttingItems = parseCuttingSheetFromWorkbook(workbook)

  return { skus, bomItems, bomByStyle, cuttingItems, images }
}

export function filterSkusForProduct(skus: ParsedSKU[], productName: string): ParsedSKU[] {
  const pn = productName.toLowerCase().replace(/\s+/g, ' ').trim()
  const pnCompact = pn.replace(/\s/g, '')
  const matched = skus.filter(s => {
    const sn = normaliseStyleName(s.styleName)
    const snCompact = sn.replace(/\s/g, '')
    return sn === pn || sn.startsWith(pn) || pn.startsWith(sn) ||
      snCompact === pnCompact || snCompact.startsWith(pnCompact) || pnCompact.startsWith(snCompact)
  })
  return matched.length > 0 ? matched : skus
}

export function extractColorTag(styleName: string, productBaseName: string): string {
  const cleaned = styleName.replace(/^[A-Z0-9]+\s*\*\s*/i, '').trim()
  const base = productBaseName.trim()
  if (cleaned.toLowerCase().startsWith(base.toLowerCase())) {
    const color = cleaned.slice(base.length).trim()
    if (color) return color
  }
  return cleaned
}

export function extractProductBaseName(skus: ParsedSKU[]): string {
  if (skus.length === 0) return ''
  const names = skus.map(s => s.styleName.replace(/^[A-Z0-9]+\s*\*\s*/i, '').trim())
  if (names.length === 1) return names[0]
  let prefix = names[0]
  for (const name of names.slice(1)) {
    let i = 0
    while (i < prefix.length && i < name.length && prefix[i].toLowerCase() === name[i].toLowerCase()) i++
    prefix = prefix.slice(0, i)
  }
  return prefix.trim()
}

export function buildColourVariants(
  skus: ParsedSKU[],
  productName: string,
  bomByStyle?: Record<string, ParsedBOMItem[]>,
) {
  return skus.map(sku => {
    const rawTag = sku.color || extractColorTag(sku.styleName, productName)
    const colourTag = resolveColorName(rawTag)

    // Find matching BOM: try normalised style name first, then colour name suffix match
    let bomItems: ParsedBOMItem[] | undefined
    if (bomByStyle) {
      const skuKey = normaliseStyleName(sku.styleName)
      const skuCompact = skuKey.replace(/\s/g, '')
      for (const [styleKey, items] of Object.entries(bomByStyle)) {
        if (styleKey === skuKey || styleKey.replace(/\s/g, '') === skuCompact) { bomItems = items; break }
      }
      // Fallback: match resolved colour name against end of INV SHEET style key
      if (!bomItems && colourTag) {
        const colorNorm = colourTag.toLowerCase().replace(/\s+/g, ' ')
        for (const [styleKey, items] of Object.entries(bomByStyle)) {
          if (styleKey.endsWith(colorNorm) || styleKey.includes(colorNorm)) { bomItems = items; break }
        }
      }
    }
    const dimParts = sku.dimensions.replace(/"/g, '').split('/').map(s => s.trim())
    return {
      styleName: sku.styleName,
      colourTag,
      color: sku.color,
      weight: sku.weight,
      dimensions: {
        length: dimParts[0] || '',
        width: dimParts[1] || '',
        height: dimParts[2] || sku.height || '',
        unit: 'inches',
      },
      materials: [sku.mainMaterial, sku.material].filter(Boolean),
      mainCompartment: sku.mainCompartment,
      pocketCompartment: sku.pocketCompartment,
      bottleSlot: sku.bottleSlot,
      laptopCompartment: sku.laptopCompartment,
      uniquePurpose: sku.uniquePurpose,
      seasonYear: sku.seasonYear,
      character: sku.character,
      theme: sku.theme,
      bomItems,
    }
  })
}

export function aggregateMerchFields(skus: ParsedSKU[]) {
  return skuToMerchFields(skus[0], [...new Set(skus.flatMap(s => [s.mainMaterial, s.material].filter(Boolean)))])
}

export function skuToMerchFields(sku: ParsedSKU, overrideMaterials?: string[]) {
  // HEIGHT (In) in the Excel = L dimension
  const dimParts = sku.dimensions.replace(/"/g, '').split('/').map(s => s.trim())
  const length = dimParts[0] || sku.height.replace(/"/g, '').trim() || ''

  return {
    dimensions: {
      length,
      width: dimParts[1] || '',
      height: dimParts[2] || '',  // D (depth) in L W D
      unit: 'inches',
    },
    compartments: [
      sku.mainCompartment && `Main: ${sku.mainCompartment}`,
      sku.pocketCompartment && `Pocket: ${sku.pocketCompartment}`,
      sku.bottleSlot && `Bottle: ${sku.bottleSlot}`,
      sku.laptopCompartment && sku.laptopCompartment !== 'NA' && `Laptop: ${sku.laptopCompartment}`,
    ].filter(Boolean).join(' | '),
    materials: overrideMaterials || [sku.mainMaterial, sku.material].filter(Boolean),
    volume: '',
    weight: sku.weight.replace(/gm$/i, '').trim(),
    // Detail fields
    color_code: sku.color !== 'NA' ? sku.color : '',
    number_of_zips: sku.numberOfZips !== 'NA' ? sku.numberOfZips : '',
    pocket_compartments: sku.pocketCompartment !== 'NA' ? sku.pocketCompartment : '',
    main_compartments: sku.mainCompartment !== 'NA' ? sku.mainCompartment : '',
    unique_purpose: sku.uniquePurpose !== 'NA' ? sku.uniquePurpose : '',
    laptop_compartment: sku.laptopCompartment !== 'NA' ? sku.laptopCompartment : '',
    rain_cover: sku.rainCover !== 'NA' ? sku.rainCover : '',
    back_padded: sku.backPadded !== 'NA' ? sku.backPadded : '',
    season_year: sku.seasonYear !== 'NA' ? sku.seasonYear : '',
    bottle_slot: sku.bottleSlot !== 'NA' ? sku.bottleSlot : '',
    character_name: sku.character !== 'NA' ? sku.character : '',
    theme: sku.theme !== 'NA' ? sku.theme : '',
    main_material: sku.mainMaterial !== 'NA' ? sku.mainMaterial : '',
    material_spec: sku.material !== 'NA' ? sku.material : '',
  }
}
