# PLM System

A Product Lifecycle Management platform for luggage and bag manufacturing. Tracks every product from the first sales brief through design, sampling, merchandising, BOM, costing & naming, and marketing — all the way to "product live".

---

## What it does

Products move through a **9-stage pipeline**. Each stage is owned by a specific department. When a department completes their work, the product advances to the next stage and the responsible team receives an email/push notification with relevant files.

```
Sales → Design → Sampling → Merchandising → BOM → Costing & Naming → Marketing → Sales Priced → Product Live
```

Every product has a dedicated detail page with tabs for each department. Access is role-gated — users can only edit data for their own department, and only when the product is in their stage.

Alongside the main pipeline are a few standalone flows:

- **New Development** — design/merchandising share early Print & Trim concepts with merchandising → purchase.
- **Addition Work** — the merchandising head shares Excel sheets with the BOM team, who reply with the updated INV. Visible only to those two roles.
- **Sample Approval** — a dedicated approver signs off physical samples before merchandising.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS v4, Radix UI |
| Language | TypeScript 6 |
| Database + Auth | Supabase (PostgreSQL + Row Level Security) |
| File storage | Supabase Storage + Cloudinary (images) |
| Email / Push | Resend · Web Push (VAPID) |
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

Run the SQL files in [`migrations/`](migrations/) against your Supabase project (see [migrations/README.md](migrations/README.md) for the list and order). Then seed the initial admin user via the Admin → Users panel after first login.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to `/login`.

---

## Project structure

```
migrations/                     # Standalone SQL migrations (see migrations/README.md)
src/
├── app/
│   ├── (app)/                  # Authenticated routes
│   │   ├── dashboard/          # Role-aware dashboard
│   │   ├── pipeline/           # Full product timeline view
│   │   ├── products/           # Product list + detail pages
│   │   ├── management/         # Design submission analytics
│   │   ├── reports/            # Pipeline reports + exports
│   │   ├── sampling-review/    # Merch-head "mark sampling complete" queue
│   │   ├── sample-approval/    # Designated approver's sample sign-off queue
│   │   ├── marketing/          # Marketing queue
│   │   ├── illustration-review/# Design-head / management illustration review
│   │   ├── sampling-queue/     # Sampling team's work queue
│   │   ├── new-development/     # Create/share New Development concepts
│   │   ├── merch-new-development/     # Merch view of New Development
│   │   ├── purchase-new-development/  # Purchase view of New Development
│   │   ├── addition-work/      # Merch head ↔ BOM Excel + INV
│   │   └── admin/              # User management + settings
│   ├── api/                    # Route handlers (upload, notify-*, exports,
│   │   │                       #   set-product-range, set-md-costing,
│   │   │                       #   download-file, addition-work, …)
│   └── print/[id]/             # Print-friendly tech pack sheet
├── components/
│   ├── products/tabs/          # Per-department product tabs
│   │   ├── design-tab.tsx  sampling-tab.tsx  merchandising-tab.tsx
│   │   ├── bom-tab.tsx     marketing-tab.tsx sales-tab.tsx
│   │   ├── files-tab.tsx   colour-variants-tab.tsx
│   │   └── timeline-tab.tsx  comments-tab.tsx
│   ├── workflow/workflow-bar.tsx   # Stage progress indicator
│   └── layout/                    # Header, sidebar, notifications
└── lib/
    ├── types.ts                # Shared types, stages, roles, labels/colours
    ├── database.types.ts       # Supabase-generated DB types
    ├── parse-merch-excel.ts    # Merchandising Excel parser
    ├── parse-cutting-sheet.ts  # Cutting sheet parser
    ├── parse-techpack.ts       # Tech pack parser
    ├── email.ts  push.ts       # Email + web-push helpers
    └── supabase/               # Supabase client (server + browser)
```

---

## User roles

| Role | What they do |
|---|---|
| `admin` | Full access — user management, all data, stage overrides |
| `management` | Pipeline view, design submission analytics, illustration review |
| `design_head` | Assigns designers, approves designer illustrations |
| `design` | Fills in design data and tech pack, uploads illustrations |
| `sampling` | Records sample details and images, submits samples for approval |
| `merchandising_head` | Assigns sampling, oversees merchandising, shares Addition Work, leaves per-design remarks |
| `merchandising` | Fills in attributes/colour variants, imports Excel, creates New Development |
| `bom` | Bill of materials + FG codes; owns Costing & Naming (rangewise naming, MD costing), sees Addition Work |
| `marketing_head` | Marketing queue, launch planning |
| `marketing` | Product features, catalogs, launch creatives |
| `sales` | Creates products, sets pricing and deadlines |
| `purchase_head` | Receives New Development hand-offs |
| `viewer` | Read-only access to all products |

> **Sample approval** is not a role — it is granted to `admin` plus one designated approver account (`SAMPLE_APPROVER_EMAIL` in `src/lib/types.ts`), who gets a dedicated `/sample-approval` queue.

---

## Product categories and brands

**Categories:** Luggage, Business, Accessories, Backpack, PU Collection, Duffle (each with its own sub-categories — see `CATEGORY_SUBCATEGORIES` in `src/lib/types.ts`)

**Brands:** PRIORITY, TRAWORLD, PRIORITY JUNIOR, HOPP, OXEMBERG, BABYHUG, PLAYNATION, BONFINO, LEVELNXT, FABERCASTELL

**Sales channels:** GT (General Trade), MT (Modern Trade), ECOM

---

## Database schema

The main tables in Supabase:

| Table | Purpose |
|---|---|
| `profiles` | User accounts with role and department |
| `products` | Core product record — SKU, category, brand, workflow stage, `product_range`, `md_costing_approved` |
| `design_data` | Tech pack fields + variants, `head_notes`, per-design `merch_remarks` |
| `sampling_data` | Sample review status and sampler notes |
| `sampling_rounds` | One row per sampling iteration (send → review) |
| `merchandising_data` | Dimensions, colour variants, materials, compartments |
| `bom_data` | Bill of materials items and FG inventory code |
| `marketing_data` | Product features, catalogs, photoshoots, social links |
| `sales_data` | Pricing, channels, deadlines, launch status |
| `product_files` | Uploaded files per product, per department |
| `design_submissions` | Design approval requests and review history |
| `new_developments` / `new_development_files` | New Development concepts + attachments |
| `addition_work` | Merch-head Excel sheets + BOM's updated-INV reply |
| `notifications` | In-app notification feed |
| `product_comments` | Per-product discussion |
| `activity_logs` | Full audit trail of field changes and stage moves |
| `stage_unlock_requests` | Requests to re-open a completed stage |

---

## Key features

**Role-aware dashboards** — each role sees a dashboard tailored to their work; admin and management see the full pipeline with bottleneck analysis.

**Excel import** — merchandising can upload existing Excel attribute sheets; the parser extracts SKU data, BOM items from the cutting-sheet tab, and embedded product images. The sampling team can attach multiple Excel/PDF documents at once.

**Tech pack parser** — design teams upload tech pack Excel files and have fields (fabric, zipper, puller, branding, screen/digital print, add-ons, …) populated automatically, including per-variant reference images.

**Sample approval** — a designated approver signs off physical samples from a dedicated queue before the product moves to merchandising.

**Costing & Naming gate** — after BOM, the BOM owner gives the product its **rangewise** name (range + auto sequence number) and confirms MD costing approval before it advances to Marketing.

**Addition Work** — the merchandising head shares Excel sheets with the BOM team, who reply with the updated INV code(s) + note. Visible only to those two roles (enforced by RLS).

**Per-design merchandising remarks** — the merch head can leave a remark on a specific design/variant from the Sampling tab; the assigned designer is notified and sees it in the Design tab.

**Notifications** — stage advances, sample approvals, illustration reviews, INV updates and design remarks fire email (Resend) + web push, with an in-app notification bell.

**Original-filename downloads** — `/api/download-file` serves stored files under their real name via short-lived signed URLs (works for public and private buckets).

**Pipeline export** — admin and management can export the full pipeline to Excel.

**Print view** — every product has a print-friendly tech pack at `/print/[id]` (per-variant), used for physical sign-off.

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

Make sure `NEXT_PUBLIC_APP_URL` points to your production domain so email/push links work correctly.

---

## Notes for developers

- New tables added by the bolt-on modules (`new_developments`, `addition_work`, …) aren't in the generated `database.types.ts`; they're accessed via a `(supabase as any)` cast, following the same pattern throughout.
- Middleware is a pure JWT session gate — no database calls. The `is_active` check happens in the app layout via a cached `getCurrentProfile()`.
- Dashboard and report pages fetch with `Promise.all` for parallelism.
- `design-tab.tsx` is large and handles several sub-flows (tech pack, illustration review, image tagging); it's a candidate for splitting.
- `/api/seed-users` is development-only (returns 404 in production).
- Colour name normalisation (`color-maps.ts`) maps common aliases to canonical names when parsing merchandising Excel.
