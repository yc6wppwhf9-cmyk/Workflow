import * as XLSX from 'xlsx'

export interface ParsedMerchData {
  skus: ParsedSKU[]
  bomItems: ParsedBOMItem[]
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
  // Format: row N has header [ITEM NAME, SKU1_styleName, SKU2_styleName, ...]
  //         rows N+1... have  [material_name, code_for_SKU1, code_for_SKU2, ...]
  const invSheet = workbook.Sheets['INV SHEET RM']
  if (invSheet) {
    const rows = XLSX.utils.sheet_to_json<string[]>(invSheet, { header: 1, defval: '' }) as string[][]

    let headerRowIdx = -1
    let productColIdx = 1  // default to first product column

    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i]?.[0] || '').toUpperCase().includes('ITEM NAME')) {
        headerRowIdx = i
        // Find which column matches the requested product name
        if (productName) {
          const pnNorm = productName.toLowerCase().replace(/\s+/g, ' ').trim()
          const pnCompact = pnNorm.replace(/\s/g, '')
          for (let c = 1; c < rows[i].length; c++) {
            const cellNorm = normaliseStyleName(String(rows[i][c] || ''))
            const cellCompact = cellNorm.replace(/\s/g, '')
            if (cellNorm.startsWith(pnNorm) || pnNorm.startsWith(cellNorm) ||
                cellCompact.startsWith(pnCompact) || pnCompact.startsWith(cellCompact)) {
              productColIdx = c
              break
            }
          }
        }
        break
      }
    }

    if (headerRowIdx >= 0) {
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const itemName = String(rows[i]?.[0] || '').trim()
        if (!itemName) continue

        const invCode = String(rows[i]?.[productColIdx] || '').trim()
        // Skip NA, 0, empty
        if (!invCode || invCode === '0' || invCode.toUpperCase() === 'NA') continue

        bomItems.push({
          inv_code: invCode,
          inv_name: itemName,
          quantity: '1',
          unit: 'pcs',
        })
      }
    }
  }

  return { skus, bomItems, images }
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

export function buildColourVariants(skus: ParsedSKU[], productName: string) {
  return skus.map(sku => {
    const colourTag = sku.color || extractColorTag(sku.styleName, productName)
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
    }
  })
}

export function aggregateMerchFields(skus: ParsedSKU[]) {
  return skuToMerchFields(skus[0], [...new Set(skus.flatMap(s => [s.mainMaterial, s.material].filter(Boolean)))])
}

export function skuToMerchFields(sku: ParsedSKU, overrideMaterials?: string[]) {
  const dimParts = sku.dimensions.replace(/"/g, '').split('/').map(s => s.trim())

  return {
    dimensions: {
      length: dimParts[0] || '',
      width: dimParts[1] || '',
      height: dimParts[2] || sku.height || '',
      unit: 'inches',
    },
    compartments: [
      sku.mainCompartment && `Main compartments: ${sku.mainCompartment}`,
      sku.pocketCompartment && `Pocket compartments: ${sku.pocketCompartment}`,
      sku.bottleSlot && `Bottle slots: ${sku.bottleSlot}`,
      sku.laptopCompartment && `Laptop: ${sku.laptopCompartment}`,
      sku.rainCover && sku.rainCover !== 'NA' && `Rain cover: ${sku.rainCover}`,
    ].filter(Boolean).join(' | '),
    materials: overrideMaterials || [sku.mainMaterial, sku.material].filter(Boolean),
    volume: '',
    weight: sku.weight,
  }
}
