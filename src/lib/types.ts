export type UserRole = 'admin' | 'management' | 'design' | 'design_head' | 'sampling' | 'merchandising' | 'merchandising_head' | 'bom' | 'marketing' | 'sales' | 'viewer'

export type WorkflowStage =
  | 'draft'
  | 'design_completed'
  | 'sampling_completed'
  | 'merchandising_completed'
  | 'bom_finalized'
  | 'marketing_ready'
  | 'sales_priced'
  | 'product_live'

export type ProductCategory =
  | 'luggage'
  | 'business'
  | 'accessories'
  | 'backpack'
  | 'pu-collection'

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  'luggage':       'Luggage',
  'business':      'Business',
  'accessories':   'Accessories',
  'backpack':      'Backpack',
  'pu-collection': 'PU Collection',
  'duffle':        'Duffle',
}

export const CATEGORY_SUBCATEGORIES: Record<ProductCategory, string[]> = {
  'luggage':       ['Hard Luggage'],
  'business':      ['Overnighter/Expander', 'Backpack/Trolley'],
  'accessories':   ['Pouch', 'Lunch Bag', 'Collection', 'Daypack', 'Shopping Bag', 'Sling Bag', 'Laptop Sleeve', 'Others'],
  'backpack':      ['School Backpack', 'College Backpack', 'Laptop Backpack', 'Trekking Backpack'],
  'pu-collection': ['Backpack', 'Pouch', 'Duffle Bag', 'Others'],
  'duffle':        ['Duffle Trolley', 'Duffle without Trolley', 'Others'],
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
  must_change_password: boolean
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  name: string
  display_name: string | null
  sku: string
  category: ProductCategory
  sub_category: string | null
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

export interface DesignSubmission {
  id: string
  product_id: string
  submitted_by: string
  status: 'pending' | 'approved' | 'rejected'
  feedback: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  submitter?: Pick<Profile, 'id' | 'full_name'>
}

export interface DesignData {
  id: string
  product_id: string
  assigned_to: string | null
  head_notes: string | null
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
  assigned_to: string | null
  attribute_sheet_handed_over: boolean
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

export interface SamplingData {
  id: string
  product_id: string
  sampler_name: string | null
  sampler_remarks: string | null
  sample_review_status: 'not_started' | 'pending_review' | 'approved' | 'rejected'
  designer_feedback: string | null
  reviewed_by: string | null
  reviewed_at: string | null
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
  assign_to: string | null
  channel: string | null
  price_range: string | null
  deadline_date: string | null
  product_specification: string | null
  // legacy fields kept in DB
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
  review_status: 'pending' | 'approved' | 'rejected' | null
  review_feedback: string | null
  reviewed_by: string | null
  reviewed_at: string | null
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
  'sampling_completed',
  'merchandising_completed',
  'bom_finalized',
  'marketing_ready',
]

export const STAGE_LABELS: Record<WorkflowStage, string> = {
  draft: 'Sales',
  design_completed: 'Design',
  sampling_completed: 'Sampling',
  merchandising_completed: 'Merchandising',
  bom_finalized: 'BOM',
  marketing_ready: 'Marketing',
  sales_priced: 'Sales Priced',
  product_live: 'Product Live',
}

export const STAGE_COLORS: Record<WorkflowStage, string> = {
  draft: 'bg-green-100 text-green-700',
  design_completed: 'bg-purple-100 text-purple-700',
  sampling_completed: 'bg-cyan-100 text-cyan-700',
  merchandising_completed: 'bg-blue-100 text-blue-700',
  bom_finalized: 'bg-orange-100 text-orange-700',
  marketing_ready: 'bg-yellow-100 text-yellow-700',
  sales_priced: 'bg-green-100 text-green-700',
  product_live: 'bg-emerald-100 text-emerald-700',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  management: 'Management',
  design: 'Design',
  design_head: 'Design Head',
  sampling: 'Sampling',
  merchandising: 'Merchandising',
  merchandising_head: 'Merchandising Head',
  bom: 'BOM',
  marketing: 'Marketing',
  sales: 'Sales',
  viewer: 'Viewer',
}

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-700',
  management: 'bg-indigo-100 text-indigo-700',
  design: 'bg-purple-100 text-purple-700',
  design_head: 'bg-violet-200 text-violet-800',
  sampling: 'bg-cyan-100 text-cyan-700',
  merchandising: 'bg-blue-100 text-blue-700',
  merchandising_head: 'bg-teal-200 text-teal-800',
  bom: 'bg-orange-100 text-orange-700',
  marketing: 'bg-yellow-100 text-yellow-700',
  sales: 'bg-green-100 text-green-700',
  viewer: 'bg-gray-100 text-gray-700',
}

// Which department owns each stage (does the work while the product is in that stage)
export const STAGE_OWNER_ROLE: Partial<Record<WorkflowStage, UserRole>> = {
  draft: 'sales',
  design_completed: 'design',
  sampling_completed: 'sampling',
  merchandising_completed: 'merchandising',
  bom_finalized: 'bom',
  marketing_ready: 'marketing',
}
