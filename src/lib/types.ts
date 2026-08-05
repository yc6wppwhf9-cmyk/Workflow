export type UserRole = 'admin' | 'management' | 'design' | 'design_head' | 'sampling' | 'merchandising' | 'merchandising_head' | 'bom' | 'bom_head' | 'marketing' | 'marketing_head' | 'sales' | 'viewer' | 'purchase_head'

// The single designated sample approver (replaces management sample approval).
// Approval rights = admin OR this account.
export const SAMPLE_APPROVER_EMAIL = 'amrita.kumari@hscvpl.com'
export const SAMPLE_APPROVER_NAME = 'Amrita'

export function canApproveSamples(profile: { role: string; email?: string | null }): boolean {
  return profile.role === 'admin' || profile.email === SAMPLE_APPROVER_EMAIL
}

export type WorkflowStage =
  | 'design_completed'
  | 'sampling_completed'
  | 'merchandising_completed'
  | 'bom_finalized'
  | 'costing_naming'
  | 'marketing_ready'
  | 'sales_priced'
  | 'product_live'

export type ProductCategory =
  | 'luggage'
  | 'business'
  | 'accessories'
  | 'backpack'
  | 'pu-collection'
  | 'duffle'

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
  family_name: string | null
  /** The collection this product belongs to, e.g. ROCK, CUPCAKE, NEW YORK.
   *  Stored normalised (upper-case). Doubles as the "deliberately named" flag:
   *  the tech pack and merch importers refuse to rename a product that has one.
   *  See canAutoRename in @/lib/product-naming. */
  product_range: string | null
  /** This product's number within product_range — the NNN in "ROCK 001".
   *  Unique per range (enforced by index, see migration_rangewise_naming.sql). */
  range_seq: number | null
  md_costing_approved: boolean
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
  merch_remarks: Record<string, string> | null
  channel: string | null
  designer_name: string | null
  sample_color: string | null
  color_skus: string[] | null
  unique_feature: string | null
  style_name: string | null
  // Tech pack fields (exact mapping from design Excel)
  farma: string | null
  season_year: string | null
  fabric: string | null
  lining: string | null
  air_mesh: string | null
  zipper: string | null
  puller: string | null
  patta_9mm: string | null
  patta_075: string | null
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
  variants: any[] | null
  techpack_pdf_url: string | null
  updated_by: string | null
  updated_at: string
}

export interface ColourVariant {
  styleName: string
  colourTag: string
  color: string
  /** Finished-goods INV code for THIS design — each colourway is its own SKU. */
  fgInvCode?: string
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

export interface SamplingRound {
  id: string
  product_id: string
  round_number: number
  techpack_file_id: string | null
  illustration_file_ids: string[]
  status: 'sampling_requested' | 'in_progress' | 'pending_review' | 'approved' | 'rejected'
  feedback: string | null
  sent_by: string | null
  reviewed_by: string | null
  sent_at: string
  reviewed_at: string | null
}

export interface SamplingData {
  id: string
  product_id: string
  assigned_to: string | null
  sampler_name: string | null
  sampler_remarks: string | null
  sample_review_status: 'not_started' | 'pending_review' | 'approved' | 'rejected' | 'sampling_requested'
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
  /** The name as written in the merchandising Excel, kept only when it differs
   *  from the item_master name — so the mismatch can be flagged instead of
   *  being silently overwritten by the master lookup. */
  excel_name?: string
}

export interface BomData {
  id: string
  product_id: string
  assigned_to: string | null
  submitted_for_approval: boolean
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  items: BomItem[] | null
  fg_inv_code: string | null
  cost_given: boolean
  is_completed: boolean
  is_locked: boolean
  updated_by: string | null
  updated_at: string
}

export interface SocialLink {
  platform: string
  url: string
}

export interface MarketingData {
  id: string
  product_id: string
  product_features: string[] | null
  photoshoots: string | null
  hero_product: boolean
  catalogs: string[] | null
  launch_creatives: string | null
  social_links: SocialLink[] | null
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
  'design_completed',
  'sampling_completed',
  'merchandising_completed',
  'bom_finalized',
  'costing_naming',
  'marketing_ready',
  'sales_priced',
  'product_live',
]

// The last stage of the live pipeline: a product is complete once Marketing
// finishes. 'sales_priced' and 'product_live' are retired as workflow steps but
// stay in WorkflowStage, WORKFLOW_STAGES and the labels below so products that
// already reached them still resolve everywhere — reports, filters, dashboards.
export const FINAL_STAGE: WorkflowStage = 'marketing_ready'

export const STAGE_LABELS: Record<WorkflowStage, string> = {
  design_completed: 'Design',
  sampling_completed: 'Sampling',
  merchandising_completed: 'Merchandising',
  bom_finalized: 'BOM',
  // Retired: BOM approval now advances straight to Marketing. Kept so legacy
  // rows at this stage still render.
  costing_naming: 'Costing & Naming',
  marketing_ready: 'Marketing',
  sales_priced: 'Sales Priced',
  product_live: 'Product Live',
}

export const STAGE_COLORS: Record<WorkflowStage, string> = {
  design_completed: 'bg-purple-100 text-purple-700',
  sampling_completed: 'bg-cyan-100 text-cyan-700',
  merchandising_completed: 'bg-blue-100 text-blue-700',
  bom_finalized: 'bg-orange-100 text-orange-700',
  costing_naming: 'bg-pink-100 text-pink-700',
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
  bom_head: 'BOM Head',
  marketing: 'Marketing',
  marketing_head: 'Marketing Head',
  sales: 'Sales',
  viewer: 'Viewer',
  purchase_head: 'Purchase Head',
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
  bom_head: 'bg-orange-200 text-orange-800',
  marketing: 'bg-yellow-100 text-yellow-700',
  marketing_head: 'bg-amber-200 text-amber-800',
  sales: 'bg-green-100 text-green-700',
  viewer: 'bg-gray-100 text-gray-700',
  purchase_head: 'bg-rose-100 text-rose-700',
}

// Which roles own each stage (do the work while the product is in that stage).
// Heads are listed alongside their team: naming only the member role locked
// department heads out of their own stage — they could neither edit the tab nor
// advance the product, despite being the ones notified that it had arrived.
export const STAGE_OWNER_ROLES: Partial<Record<WorkflowStage, UserRole[]>> = {
  design_completed:        ['design', 'design_head'],
  sampling_completed:      ['sampling'],
  merchandising_completed: ['merchandising', 'merchandising_head'],
  bom_finalized:           ['bom', 'bom_head'],
  costing_naming:          ['bom', 'bom_head'],
  marketing_ready:         ['marketing', 'marketing_head'],
}

/** Can this role do the work of the given stage? Admins are handled separately
 *  by callers, since they override rather than own. */
export function ownsStage(role: UserRole, stage: WorkflowStage): boolean {
  return (STAGE_OWNER_ROLES[stage] ?? []).includes(role)
}

// The primary owning department, for display. Derived so it cannot drift from
// the list above.
export const STAGE_OWNER_ROLE: Partial<Record<WorkflowStage, UserRole>> =
  Object.fromEntries(
    Object.entries(STAGE_OWNER_ROLES).map(([stage, roles]) => [stage, roles[0]]),
  ) as Partial<Record<WorkflowStage, UserRole>>

// ── Colour variant hygiene ────────────────────────────────────────────────
// Merch ATTRIBUTES templates leave blank columns whose header is a field label
// ("POCKET COMPARTMENT") or a bare "Colour" placeholder. Those get imported as
// bogus colour variants, so filter them wherever variants are displayed.
const VARIANT_PLACEHOLDER = /^colou?rs?$/i
const VARIANT_ATTR_LABEL = /^(pocket|main|laptop)\s*compartments?$|^weight|^height|^dimen|^number of zip|^rain cover|^bottle slot|^back padded|^season|^unique purpose|^main material|^materials?$|^character$|^theme$|^designer name$/i

export function isPlaceholderVariant(v: { colourTag?: string | null; styleName?: string | null }): boolean {
  const tag = (v.colourTag || '').trim()
  const style = (v.styleName || '').trim()
  return VARIANT_PLACEHOLDER.test(tag) || VARIANT_ATTR_LABEL.test(tag) || VARIANT_ATTR_LABEL.test(style)
}
