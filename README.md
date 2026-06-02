# PLM System

A Product Lifecycle Management platform for luggage and bag manufacturing. Tracks every product from the first sales brief through design, sampling, merchandising, BOM, and marketing — all the way to "product live".

---

## What it does

Products move through an 8-stage pipeline. Each stage is owned by a specific department. When a department completes their work, the product advances to the next stage and the responsible team receives an email notification with relevant files attached.

```
Draft / Sales → Design → Sampling → Merchandising → BOM → Marketing → Sales Priced → Product Live
```

Every product has a dedicated detail page with tabs for each department. Access is role-gated — users can only edit data for their own department, and only when the product is in their stage.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS v4, Radix UI |
| Language | TypeScript 6 |
| Database + Auth | Supabase (PostgreSQL + Row Level Security) |
| File storage | Supabase Storage + Cloudinary (images) |
| Email | Resend |
| Excel parsing | SheetJS (xlsx) |
| Testing | Vitest |

---

## Getting started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- A [Cloudinary](https://cloudinary.com) account (for image uploads)
- A [Resend](https://resend.com) account (for email notifications — optional)

### 1. Clone and install

```bash
git clone <repo-url>
cd Workflow-main
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Email notifications (optional — skipped if not set)
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=PLM System <noreply@yourdomain.com>

# Used in email links
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### 3. Set up the database

Run the SQL migrations in your Supabase project to create the required tables (see the `Database schema` section below). Then seed the initial admin user via the Admin → Users panel after first login.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to `/login`.

---

## Project structure

```
src/
├── app/
│   ├── (app)/                  # Authenticated routes
│   │   ├── dashboard/          # Role-aware dashboard (6 views)
│   │   ├── pipeline/           # Full product timeline view
│   │   ├── products/           # Product list + detail pages
│   │   ├── management/         # Design submission analytics
│   │   ├── reports/            # Pipeline reports + exports
│   │   ├── sampling-review/    # Sample approval queue
│   │   └── admin/              # User management + settings
│   ├── api/                    # Route handlers
│   │   ├── notify-stage-advance/   # Stage-advance email trigger
│   │   ├── upload-image/           # Cloudinary image upload
│   │   ├── upload-merch-excel/     # Merchandising Excel import
│   │   ├── export-pipeline/        # Pipeline Excel/PDF export
│   │   ├── design-submissions/     # Design approval API
│   │   └── export/products/        # Product data export
│   └── print/[id]/             # Print-friendly product sheet
├── components/
│   ├── products/tabs/          # Per-department product tabs
│   │   ├── design-tab.tsx
│   │   ├── sampling-tab.tsx
│   │   ├── merchandising-tab.tsx
│   │   ├── bom-tab.tsx
│   │   ├── marketing-tab.tsx
│   │   ├── sales-tab.tsx
│   │   ├── files-tab.tsx
│   │   ├── colour-variants-tab.tsx
│   │   ├── timeline-tab.tsx
│   │   └── comments-tab.tsx
│   ├── workflow/workflow-bar.tsx   # Stage progress indicator
│   └── layout/                    # Header, sidebar, notifications
└── lib/
    ├── types.ts                # All shared TypeScript types
    ├── database.types.ts       # Supabase-generated DB types
    ├── parse-merch-excel.ts    # Merchandising Excel parser
    ├── parse-cutting-sheet.ts  # Cutting sheet parser
    ├── parse-techpack.ts       # Tech pack parser
    ├── color-maps.ts           # Colour name normalisation
    └── supabase/               # Supabase client (server + browser)
```

---

## User roles

| Role | What they do |
|---|---|
| `admin` | Full access — user management, all data, stage overrides |
| `management` | Read-only pipeline view, design submission analytics |
| `design_head` | Assigns designers, approves design submissions |
| `design` | Fills in design data and tech pack, submits for review |
| `sampling` | Records sample details, submits for review |
| `merchandising_head` | Approves samples, oversees merchandising |
| `merchandising` | Fills in attributes, colour variants, imports Excel |
| `bom` | Manages bill of materials, assigns FG inventory codes |
| `marketing` | Adds product features, manages launch creatives |
| `sales` | Creates products, sets pricing and deadlines |
| `viewer` | Read-only access to all products |

---

## Product categories and brands

**Categories:** Junior Backpacks, Campus Backpacks, Business Backpacks, Trekking Backpacks, Luggage, Accessories, Vegan Backpacks, Duffle, Duffle Wheeler, Duffle Trolley

**Brands:** PRIORITY, TRAWORLD, PRIORITY JUNIOR, HOPP, OXEMBERG, BABYHUG, PLAYNATION, BONFINO, LEVELNXT, FABERCASTELL

**Sales channels:** GT (General Trade), MT (Modern Trade), ECOM

---

## Database schema

The main tables in Supabase:

| Table | Purpose |
|---|---|
| `profiles` | User accounts with role and department |
| `products` | Core product record with SKU, category, brand, workflow stage |
| `design_data` | Tech pack fields — fabric, zipper, puller, branding etc. |
| `sampling_data` | Sample review status and sampler notes |
| `merchandising_data` | Dimensions, colour variants, materials, compartments |
| `bom_data` | Bill of materials items and FG inventory code |
| `marketing_data` | Product features, catalogs, photoshoots, launch creatives |
| `sales_data` | Pricing, channels, deadlines, launch status |
| `product_files` | Uploaded files per product, per department |
| `design_submissions` | Design approval requests and review history |
| `activity_logs` | Full audit trail of all field changes |
| `stage_unlock_requests` | Requests to re-open a completed stage |

---

## Key features

**Role-aware dashboards** — each role sees a different dashboard tailored to their work. Sales sees their active products and deadlines. Design sees their assigned products and submission status. Admin and management see the full pipeline with bottleneck analysis.

**Excel import** — the merchandising team can upload their existing Excel attribute sheets. The parser (`parse-merch-excel.ts`) extracts SKU data, BOM items from the cutting sheet tab, and embedded product images automatically.

**Tech pack parser** — design teams can upload tech pack Excel files and have fields like fabric, zipper, puller, branding, and screen print populated automatically.

**Stage-advance notifications** — when a product advances to a new stage, the system emails every user in the next department with a summary and links to relevant files. Cloudinary image URLs are embedded directly in the email; other files are attached.

**Colour variants** — each product can have multiple colour variants with individual BOM lists, dimensions, weight, materials, compartment specs, and season/character/theme metadata.

**Pipeline export** — admin and management can export the full pipeline to Excel for offline reporting.

**Print view** — every product has a print-friendly page at `/print/[id]` for physical sign-off sheets.

---

## Running tests

```bash
npm test
```

Tests cover the three Excel parsers:

- `parse-merch-excel.test.ts` — merchandising attribute sheet parsing
- `parse-cutting-sheet.test.ts` — cutting sheet BOM extraction
- `parse-techpack.test.ts` — tech pack field mapping

---

## Deployment

The app is designed for deployment on [Vercel](https://vercel.com).

1. Push your repository to GitHub
2. Import the project in Vercel
3. Add all environment variables from `.env.example` in the Vercel dashboard
4. Deploy

Make sure `NEXT_PUBLIC_APP_URL` points to your production domain so email links work correctly.

---

## Notes for developers

- Middleware (`src/middleware.ts`) is a pure JWT session gate — it makes no database calls. The `is_active` check happens in the app layout via a cached `getCurrentProfile()` call.
- All Supabase queries in dashboard and report pages use `Promise.all` for parallel fetching.
- The `design-tab.tsx` component is large and handles multiple sub-flows (tech pack, design submission, image review). It's a candidate for splitting if it grows further.
- The `/api/seed-users` route is for development seeding only. Gate it behind an environment check before any production deployment.
- Colour name normalisation (`color-maps.ts`) maps common colour aliases to canonical names — used when parsing merchandising Excel files.
