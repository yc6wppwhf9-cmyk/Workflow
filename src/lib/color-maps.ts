export const COLOR_CODE_MAP: Record<string, string> = {
  'PNK': 'Pink', 'TBL': 'Turquoise Blue', 'RD': 'Red', 'DGR': 'Dark Grey',
  'NBL': 'Navy Blue', 'NAV': 'Navy Blue', 'RBL': 'Royal Blue', 'YLW': 'Yellow',
  'BLK': 'Black', 'DGRN': 'Dark Green', 'MGRN': 'Mint Green', 'LPNK': 'Light Pink',
  'LVD': 'Lavender', 'BEIG': 'Beige', 'ARBL': 'Arctic Blue', 'SBL': 'Sky Blue',
  'ABL': 'Airport Blue', 'BPNK': 'Blush Pink', 'N ORNG': 'Neon Orange', 'NORNG': 'Neon Orange',
  'N GRN': 'Neon Green', 'NGRN': 'Neon Green', 'L P GRN': 'Light Parrot Green', 'LPGRN': 'Light Parrot Green',
  'LGR': 'Light Grey', 'GRY': 'Grey', 'FD': 'Future Dusk', 'L FD': 'Light Future Dusk', 'LFD': 'Light Future Dusk',
  'PLM': 'Plum', 'MRON': 'Maroon', 'BRWN': 'Brown', 'MUD BRWN': 'Mud Brown', 'MUDBRWN': 'Mud Brown',
  'ORG': 'Orange', 'PUR': 'Purple', 'RYB': 'Royal Blue', 'MAR': 'Maroon',
  'OLV': 'Olive', 'TAN': 'Tan', 'WHT': 'White', 'CRM': 'Cream',
}

export const COLOR_HEX_MAP: Record<string, string> = {
  'PINK': '#F472B6', 'TURQUOISE BLUE': '#2DD4BF', 'TURQOISE BLUE': '#2DD4BF', 'RED': '#EF4444',
  'DARK GREY': '#575660', 'NAVY BLUE': '#1f214c', 'ROYAL BLUE': '#1D4ED8', 'YELLOW': '#FACC15',
  'BLACK': '#141420', 'DARK GREEN': '#184836', 'MINT GREEN': '#6EE7B7', 'LIGHT PINK': '#FBCFE8',
  'LAVENDER': '#A78BFA', 'BEIGE': '#F5F5DC', 'ARCTIC BLUE': '#93C5FD', 'SKY BLUE': '#7DD3FC',
  'AIRPORT BLUE': '#60A5FA', 'BLUSH PINK': '#F9A8D4', 'NEON ORANGE': '#FF5F1F',
  'NEON GREEN': '#39FF14', 'LIGHT PARROT GREEN': '#7FFF00', 'LIGHT GREY': '#D1D5DB',
  'FUTURE DUSK': '#483D8B', 'LIGHT FUTURE DUSK': '#9370DB', 'PLUM': '#8E4585',
  'MAROON': '#800000', 'BROWN': '#A52A2A', 'MUD BROWN': '#70543E', 'GREY': '#6B7280',
  'WHITE': '#FFFFFF', 'OLIVE': '#808000', 'TAN': '#D2B48C', 'ORANGE': '#FB923C',
  'PURPLE': '#7E22CE', 'STANDARD': '#94A3B8', 'CREAM': '#FFFDD0',
}

// Resolve a color code/abbreviation to full display name
// Handles single codes ("NBL" → "Navy Blue") and compound codes ("NBL-DGRN" → "Navy Blue - Dark Green")
export function resolveColorName(raw: string): string {
  if (!raw) return raw
  const upper = raw.trim().toUpperCase()

  // Direct full-name match (already a known full color)
  if (COLOR_HEX_MAP[upper]) return capitalizeWords(raw.trim())

  // Direct code match
  if (COLOR_CODE_MAP[upper]) return COLOR_CODE_MAP[upper]

  // Try splitting by common separators for compound colors
  const separators = ['-', '/', ' & ', '+']
  for (const sep of separators) {
    if (raw.includes(sep)) {
      const parts = raw.split(sep).map(p => resolveSinglePart(p.trim())).filter(Boolean)
      if (parts.length > 1) return parts.join(` ${sep} `)
    }
  }

  return resolveSinglePart(raw) || raw
}

function resolveSinglePart(part: string): string {
  const upper = part.toUpperCase()
  if (COLOR_CODE_MAP[upper]) return COLOR_CODE_MAP[upper]
  if (COLOR_HEX_MAP[upper]) return capitalizeWords(part)
  // Try prefix match for codes like "NBL" in longer strings
  for (const [code, name] of Object.entries(COLOR_CODE_MAP)) {
    if (upper === code) return name
  }
  return capitalizeWords(part)
}

// Get hex color for display. For compound colors returns the first part's hex.
export function getColorHex(colorNameOrCode: string): string {
  if (!colorNameOrCode) return '#94A3B8'
  const resolved = resolveColorName(colorNameOrCode)

  // Try resolved name directly
  const upper = resolved.toUpperCase()
  if (COLOR_HEX_MAP[upper]) return COLOR_HEX_MAP[upper]

  // Try first part of compound color
  const firstPart = resolved.split(/[-/&+]/)[0].trim().toUpperCase()
  if (COLOR_HEX_MAP[firstPart]) return COLOR_HEX_MAP[firstPart]

  return '#94A3B8'
}

function capitalizeWords(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}
