export type UserRole = 'admin' | 'design' | 'merchandising' | 'bom' | 'marketing' | 'sales' | 'viewer'

export type WorkflowStage =
  | 'draft'
  | 'design_completed'
  | 'merchandising_completed'
  | 'bom_finalized'
  | 'marketing_ready'
  | 'sales_priced'
  | 'product_live'

export type ProductCategory =
  | 'junior-backpacks'
  | 'campus-backpacks'
  | 'business-backpacks'
  | 'trekking-backpacks'
  | 'luggage'
  | 'accessories'
  | 'vegan-backpacks'
  | 'duffle'
  | 'duffle-wheeler'
  | 'duffle-trolley'

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  'junior-backpacks':   'Junior Backpacks',
  'campus-backpacks':   'Campus Backpacks',
  'business-backpacks': 'Business Backpacks',
  'trekking-backpacks': 'Trekking Backpacks',
  'luggage':            'Luggage',
  'accessories':        'Accessories',
  'vegan-backpacks':    'Vegan Backpacks',
  'duffle':             'Duffle',
  'duffle-wheeler':     'Duffle Wheeler',
  'duffle-trolley':     'Duffle Trolley',
}

export type Brand =
  | 'PRIORITY'
  | 'TRAWORLD'
  | 'PRIORITY JUNIOR'
  | 'HOPP'
  | 'OXEMBERG'
  | 'BABYHUG'
  | 'PLAYNATION'
  | 'BONFINO'
  | 'LEVELNXT'
  | 'FABERCASTELL'

export const BRANDS: Brand[] = [
  'PRIORITY', 'TRAWORLD', 'PRIORITY JUNIOR', 'HOPP', 'OXEMBERG',
  'BABYHUG', 'PLAYNATION', 'BONFINO', 'LEVELNXT', 'FABERCASTELL',
]

export const CHANNELS = ['GT', 'MT', 'ECOM'] as const
export type Channel = typeof CHANNELS[number]

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  department: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  name: string
  sku: string
  category: ProductCategory
  brand: Brand | null
  description: string | null
  workflow_stage: WorkflowStage
  is_locked: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  // joined
  creator?: Profile
}

export interface DesignData {
  id: string
  product_id: string
  channel: string | null
  designer_name: string | null
  sample_color: string | null
  color_skus: string[] | null
  unique_feature: string | null
  // Tech pack fields (exact mapping from design Excel)
  farma: string | null
  season_year: string | null
  fabric: string | null
  lining: string | null
  air_mesh: string | null
  zipper: string | null
  puller: string | null
  patta_9mm: string | null
  patta_1: string | null
  patta_2: string | null
  lader_lock: string | null
  branding: string | null
  screen_print: string | null
  digital_print: string | null
  bartech: string | null
  re_sampling_by: string | null
  remarks: string | null
  add_on_1: string | null
  add_on_2: string | null
  add_on_3: string | null
  designer_sign: string | null
  is_completed: boolean
  is_locked: boolean
  updated_by: string | null
  updated_at: string
}

export interface ColourVariant {
  styleName: string
  colourTag: string
  color: string
  weight: string
  dimensions: { length?: string; width?: string; height?: string; unit?: string }
  materials: string[]
  mainCompartment: string
  pocketCompartment: string
  bottleSlot: string
  laptopCompartment: string
  uniquePurpose: string
  seasonYear: string
  character: string
  theme: string
  bomItems?: BomItem[]
}

export interface MerchandisingData {
  id: string
  product_id: string
  dimensions: { length?: string; width?: string; height?: string; unit?: string } | null
  compartments: string | null
  materials: string[] | null
  volume: string | null
  weight: string | null
  colour_variants: ColourVariant[] | null
  // Per-variant fields (aggregated from primary variant)
  color_code: string | null
  height: string | null
  number_of_zips: string | null
  pocket_compartments: string | null
  main_compartments: string | null
  unique_purpose: string | null
  laptop_compartment: string | null
  rain_cover: string | null
  back_padded: string | null
  season_year: string | null
  bottle_slot: string | null
  character_name: string | null
  theme: string | null
  main_material: string | null
  material_spec: string | null
  production_fields: Record<string, unknown> | null
  is_completed: boolean
  is_locked: boolean
  updated_by: string | null
  updated_at: string
}

export interface BomItem {
  inv_code: string
  inv_name: string
  consumption: string
  unit: string
}

export interface BomData {
  id: string
  product_id: string
  items: BomItem[] | null
  fg_inv_code: string | null
  cost_given: boolean
  is_completed: boolean
  is_locked: boolean
  updated_by: string | null
  updated_at: string
}

export interface MarketingData {
  id: string
  product_id: string
  product_features: string[] | null
  photoshoots: string | null
  hero_product: boolean
  catalogs: string[] | null
  launch_creatives: string | null
  is_completed: boolean
  is_locked: boolean
  updated_by: string | null
  updated_at: string
}

export interface SalesData {
  id: string
  product_id: string
  mrp: number | null
  dealer_pricing: number | null
  launch_status: string | null
  launch_date: string | null
  is_completed: boolean
  is_locked: boolean
  updated_by: string | null
  updated_at: string
}

export interface ProductFile {
  id: string
  product_id: string
  name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  department: UserRole | null
  uploaded_by: string | null
  colour_tag: string | null
  created_at: string
  uploader?: Profile
}

export interface ActivityLog {
  id: string
  product_id: string | null
  user_id: string | null
  action: string
  department: string | null
  field_changed: string | null
  old_value: string | null
  new_value: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  user?: Profile
}

// Workflow stage ordering and labels
export const WORKFLOW_STAGES: WorkflowStage[] = [
  'draft',
  'design_completed',
  'merchandising_completed',
  'bom_finalized',
  'marketing_ready',
]

export const STAGE_LABELS: Record<WorkflowStage, string> = {
  draft: 'Sales',
  design_completed: 'Design Completed',
  merchandising_completed: 'Merchandising Completed',
  bom_finalized: 'BOM Finalized',
  marketing_ready: 'Marketing Completed',
  sales_priced: 'Sales Priced',
  product_live: 'Product Live',
}

export const STAGE_COLORS: Record<WorkflowStage, string> = {
  draft: 'bg-green-100 text-green-700',
  design_completed: 'bg-purple-100 text-purple-700',
  merchandising_completed: 'bg-blue-100 text-blue-700',
  bom_finalized: 'bg-orange-100 text-orange-700',
  marketing_ready: 'bg-yellow-100 text-yellow-700',
  sales_priced: 'bg-green-100 text-green-700',
  product_live: 'bg-emerald-100 text-emerald-700',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  design: 'Design',
  merchandising: 'Merchandising',
  bom: 'BOM',
  marketing: 'Marketing',
  sales: 'Sales',
  viewer: 'Viewer',
}

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-700',
  design: 'bg-purple-100 text-purple-700',
  merchandising: 'bg-blue-100 text-blue-700',
  bom: 'bg-orange-100 text-orange-700',
  marketing: 'bg-yellow-100 text-yellow-700',
  sales: 'bg-green-100 text-green-700',
  viewer: 'bg-gray-100 text-gray-700',
}

// Which department advances FROM each stage (i.e. who does the work while in that stage)
export const STAGE_OWNER_ROLE: Partial<Record<WorkflowStage, UserRole>> = {
  draft: 'sales',
  design_completed: 'design',
  merchandising_completed: 'merchandising',
  bom_finalized: 'bom',
  // marketing_ready is the terminal stage — marketing marks complete but does not advance
}
