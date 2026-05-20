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

export function parseMerchExcel(buffer: ArrayBuffer): ParsedMerchData {
  const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true })

  const skus: ParsedSKU[] = []
  const bomItems: ParsedBOMItem[] = []
  const images: ParsedImage[] = []

  // ── Parse ATTRIBUTES FORMAT sheet ────────────────────────
  const attrSheet = workbook.Sheets['ATTRIBUTES FORMAT']
  if (attrSheet) {
    const rows = XLSX.utils.sheet_to_json<string[]>(attrSheet, { header: 1, defval: '' }) as string[][]

    // Each SKU occupies 3 columns (label, value, empty), repeating across
    // Find number of SKU columns
    const headerRow = rows[0] || []
    const skuCount = Math.ceil(headerRow.filter((_, i) => i % 3 === 0 && headerRow[i]).length)

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

    // Count valid SKU columns (every 3rd column starting at 0)
    const numColumns = Math.floor((rows[0]?.length || 0) / 3)

    for (let col = 0; col < numColumns; col++) {
      const baseCol = col * 3
      const styleName = String(rows[0]?.[baseCol] || '').trim()
      if (!styleName || styleName === '0') continue

      const sku: ParsedSKU = {
        styleName, weight: '', color: '', dimensions: '', height: '',
        numberOfZips: '', pocketCompartment: '', mainCompartment: '',
        uniquePurpose: '', laptopCompartment: '', rainCover: '',
        backPadded: '', seasonYear: '', bottleSlot: '', character: '',
        theme: '', mainMaterial: '', material: '', designerName: '',
      }

      for (let row = 1; row < rows.length; row++) {
        const label = String(rows[row]?.[baseCol] || '').trim().toUpperCase()
        const value = String(rows[row]?.[baseCol + 1] || '').trim()
        const field = fieldMap[label] || fieldMap[String(rows[row]?.[baseCol] || '').trim()]
        if (field && value && value !== '0') {
          sku[field] = value
        }
      }

      skus.push(sku)
    }
  }

  // ── Parse INV SHEET RM for BOM items ─────────────────────
  const invSheet = workbook.Sheets['INV SHEET RM']
  if (invSheet) {
    const rows = XLSX.utils.sheet_to_json<string[]>(invSheet, { header: 1, defval: '' }) as string[][]

    // Find the header row (contains "ITEM NAME")
    let dataStartRow = -1
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i]?.[0] || '').toUpperCase().includes('ITEM NAME')) {
        dataStartRow = i + 1
        break
      }
    }

    if (dataStartRow > 0) {
      for (let i = dataStartRow; i < rows.length; i++) {
        const itemName = String(rows[i]?.[0] || '').trim()
        const invCode = String(rows[i]?.[1] || '').trim()
        if (!itemName || !invCode || invCode === '0') continue

        bomItems.push({
          inv_code: invCode.split(' ')[0] || invCode,
          inv_name: itemName,
          quantity: '1',
          unit: 'pcs',
        })
      }
    }
  }

  // ── Extract embedded images from xlsx binary ──────────────
  // xlsx files are ZIP archives — images are in xl/media/
  try {
    const uint8 = new Uint8Array(buffer)
    // Find PK signature (ZIP)
    if (uint8[0] === 0x50 && uint8[1] === 0x4B) {
      // We'll handle image extraction server-side via the upload API
      // Mark that images exist for the API to process
    }
  } catch (_) {}

  return { skus, bomItems, images }
}

export function skuToMerchFields(sku: ParsedSKU) {
  // Parse dimension string like "16\"/ 12\"/ 08\""
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
    materials: [sku.mainMaterial, sku.material].filter(Boolean),
    volume: '',
    weight: sku.weight,
    unique_feature: [
      sku.uniquePurpose,
      sku.character && `Character: ${sku.character}`,
      sku.theme && `Theme: ${sku.theme}`,
    ].filter(Boolean).join(', '),
  }
}
