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
  quantity: string
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

export function parseMerchExcel(buffer: ArrayBuffer, productName?: string): ParsedMerchData {
  const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true })

  const skus: ParsedSKU[] = []
  let bomItems: ParsedBOMItem[] = []
  const images: ParsedImage[] = []

  // ── Parse ATTRIBUTES FORMAT sheet ─────────────────────────────────────────
  const attrSheet = workbook.Sheets['ATTRIBUTES FORMAT']
  if (attrSheet) {
    const rows = XLSX.utils.sheet_to_json<string[]>(attrSheet, { header: 1, defval: '' }) as string[][]

    const fieldMap: Record<string, keyof ParsedSKU> = {
      'WEIGHT (GM)': 'weight',
      'WEIGHT (Gm)': 'weight',
      'COLOR': 'color',
      'HEIGHT (IN)': 'height',
      'HEIGHT (In)': 'height',
      'NUMBER OF ZIP': 'numberOfZips',
      'POCKET COMPARTMENT': 'pocketCompartment',
      'MAIN COMPARTMENT': 'mainCompartment',
      'UNIQUE PURPOSE': 'uniquePurpose',
      'LAPTOP COMPARTMENT': 'laptopCompartment',
      'RAIN COVER': 'rainCover',
      'BACK PADDED OR NON': 'backPadded',
      'SEASON + YEAR': 'seasonYear',
      'DIMENSION (L W D)': 'dimensions',
      'BOTTLE SLOT': 'bottleSlot',
      'CHARACTER': 'character',
      'THEME': 'theme',
      'MAIN MATERIAL': 'mainMaterial',
      'MATERIAL': 'material',
      'DESIGNER NAME': 'designerName',
    }

    // Each SKU occupies 3 columns (label, value, empty)
    const numColumns = Math.floor((rows[0]?.length || 0) / 3)

    for (let col = 0; col < numColumns; col++) {
      const baseCol = col * 3
      const styleName = String(rows[0]?.[baseCol] || '').trim()
      // Skip empty or placeholder columns (value 0)
      if (!styleName || styleName === '0') continue

      const sku: ParsedSKU = {
        styleName, weight: '', color: '', dimensions: '', height: '',
        numberOfZips: '', pocketCompartment: '', mainCompartment: '',
        uniquePurpose: '', laptopCompartment: '', rainCover: '',
        backPadded: '', seasonYear: '', bottleSlot: '', character: '',
        theme: '', mainMaterial: '', material: '', designerName: '',
      }

      for (let row = 1; row < rows.length; row++) {
        const label = String(rows[row]?.[baseCol] || '').trim()
        const value = String(rows[row]?.[baseCol + 1] || '').trim()
        const field = fieldMap[label] || fieldMap[label.toUpperCase()]
        if (field && value && value !== '0') {
          sku[field] = value
        }
      }

      skus.push(sku)
    }
  }

  // ── Parse INV SHEET RM ────────────────────────────────────────────────────
  // Format: row N = header [ITEM NAME, style1, style2, ...]
  //         rows N+1... = [item_name, code_for_style1, code_for_style2, ...]
  const bomByStyle: Record<string, ParsedBOMItem[]> = {}
  const invSheet = workbook.Sheets['INV SHEET RM']
  if (invSheet) {
    const rows = XLSX.utils.sheet_to_json<string[]>(invSheet, { header: 1, defval: '' }) as string[][]

    let headerRowIdx = -1
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i]?.[0] || '').toUpperCase().includes('ITEM NAME')) {
        headerRowIdx = i
        break
      }
    }

    if (headerRowIdx >= 0) {
      const headerRow = rows[headerRowIdx]

      // Collect all style columns
      const styleColumns: Array<{ col: number; styleKey: string }> = []
      for (let c = 1; c < headerRow.length; c++) {
        const raw = String(headerRow[c] || '').trim()
        if (!raw || raw === '0') continue
        styleColumns.push({ col: c, styleKey: normaliseStyleName(raw) })
      }

      // Parse item rows into per-style BOM maps
      for (const { col, styleKey } of styleColumns) {
        const items: ParsedBOMItem[] = []
        for (let i = headerRowIdx + 1; i < rows.length; i++) {
          const itemName = String(rows[i]?.[0] || '').trim()
          if (!itemName) continue
          const invCode = String(rows[i]?.[col] || '').trim()
          if (!invCode || invCode === '0' || invCode.toUpperCase() === 'NA') continue
          items.push({ inv_code: invCode, inv_name: itemName, quantity: '1', unit: 'pcs' })
        }
        if (items.length > 0) bomByStyle[styleKey] = items
      }

      // Aggregate bomItems for the matched product column (for BOM tab)
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
        // If nothing matched with product name, use first column
        if (bomItems.length === 0 && styleColumns.length > 0) {
          bomItems.push(...(bomByStyle[styleColumns[0].styleKey] || []))
        }
      }
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

    // Find matching BOM for this variant by comparing normalised style names
    let bomItems: ParsedBOMItem[] | undefined
    if (bomByStyle) {
      const skuKey = normaliseStyleName(sku.styleName)
      const skuCompact = skuKey.replace(/\s/g, '')
      for (const [styleKey, items] of Object.entries(bomByStyle)) {
        const styleCompact = styleKey.replace(/\s/g, '')
        if (styleKey === skuKey || styleCompact === skuCompact) {
          bomItems = items
          break
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
