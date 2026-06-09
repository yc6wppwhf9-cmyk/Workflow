import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { PrintTrigger } from './print-trigger'

export default async function PrintTechPackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ v?: string }>
}) {
  const { id } = await params
  const { v } = await searchParams
  const selectedVariantIdx = v !== undefined && v !== 'all' && v !== '' ? parseInt(v, 10) : null
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: product },
    { data: design },
    { data: sampling },
    { data: files },
  ] = await Promise.all([
    supabase.from('products').select('id, name, category, brand').eq('id', id).single(),
    supabase.from('design_data').select('*').eq('product_id', id).single(),
    supabase.from('sampling_data').select('sampler_name, sampler_remarks').eq('product_id', id).single(),
    supabase.from('product_files')
      .select('id, name, file_url, file_type, department, colour_tag, review_status')
      .eq('product_id', id)
      .like('file_type', 'image/%')
      .in('department', ['design', 'sampling']),
  ])

  if (!product) redirect('/products')

  // Only approved illustrations, no print-reference files (colour_tag='print') — matches sampling tab
  const illustrationImages = (files || []).filter(f =>
    f.department === 'design' &&
    f.review_status === 'approved' &&
    (f as any).colour_tag !== 'print'
  )
  const sampleImages = (files || []).filter(f => f.department === 'sampling')

  // Deduplicate variants first so we can check the count before deciding to redirect
  const rawVariantsEarly = design?.variants && design.variants.length > 0 ? design.variants : design ? [design] : []
  const seenEarly = new Set<string>()
  const allVariantsEarly = rawVariantsEarly.filter((vv: any) => {
    const key = (vv?.sample_color || '').toLowerCase().trim() || JSON.stringify(vv)
    if (seenEarly.has(key)) return false
    seenEarly.add(key)
    return true
  })
  // If multiple variants and none selected, default to variant 0 — same UX as sampling tab
  if (allVariantsEarly.length > 1 && v === undefined) {
    redirect(`/print/${id}?v=0`)
  }

  function SpecRow({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null
    return (
      <div className="flex gap-3 py-1.5 border-b border-gray-100 last:border-0">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-36 shrink-0 pt-0.5">{label}</div>
        <div className="text-sm text-gray-800 flex-1">{value}</div>
      </div>
    )
  }

  const rawVariants = design?.variants && design.variants.length > 0 ? design.variants : design ? [design] : []
  // Deduplicate by sample_color — re-uploading the tech pack can produce duplicates
  const seen = new Set<string>()
  const allVariants = rawVariants.filter((v: any) => {
    const key = (v?.sample_color || '').toLowerCase().trim() || JSON.stringify(v)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // If a specific variant is selected, print only that one
  const variants = selectedVariantIdx !== null && allVariants[selectedVariantIdx]
    ? [allVariants[selectedVariantIdx]]
    : allVariants

  // Primary illustration source: variant_image_url embedded in the tech pack Excel.
  // The tech pack parser extracts embedded images per variant block and stores them here.
  // Fall back to colour-tagged product_files illustrations, then untagged ones.
  const activeVariantData = selectedVariantIdx !== null ? (allVariants[selectedVariantIdx] as any) : null
  const variantImageUrl: string | null = activeVariantData?.variant_image_url || null

  const rawColor = activeVariantData?.sample_color || ''
  const rawColorLower = rawColor.toLowerCase().trim()
  const colorToken = rawColorLower.includes(' — ')
    ? (rawColorLower.split(' — ').pop()?.trim() ?? rawColorLower)
    : rawColorLower
  const colourTaggedIllos = colorToken
    ? illustrationImages.filter(f => {
        const ct = ((f as any).colour_tag || '').toLowerCase().trim()
        if (!ct) return false
        if (ct === colorToken) return true
        if (ct === rawColorLower) return true
        const ctToken = ct.includes(' — ') ? (ct.split(' — ').pop()?.trim() ?? ct) : ct
        return ctToken === colorToken
      })
    : []
  const untaggedIllos = illustrationImages.filter(f => !(f as any).colour_tag)
  // Priority: tech pack embedded image → colour-tagged files → untagged files → all
  const printIllustrations = variantImageUrl
    ? [{ id: 'variant-img', name: rawColor || 'Variant', file_url: variantImageUrl }]
    : colourTaggedIllos.length > 0
      ? colourTaggedIllos
      : untaggedIllos.length > 0 ? untaggedIllos : illustrationImages

  // Auto-print whenever a specific variant is shown (including single-variant products)
  // No auto-print only when explicitly viewing all variants via ?v=all
  const autoprint = v !== 'all'
  const hasSpecs = variants.some((v: any) => v && (v.fabric || v.lining || v.zipper || v.farma || v.season_year))
  const printDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-white">
      <PrintTrigger autoprint={autoprint} />

      {/* Variant selector — hidden when printing */}
      {allVariants.length > 1 && (
        <div className="no-print fixed top-0 left-0 right-0 bg-white border-b border-gray-200 shadow-sm z-50 px-6 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">Print Variant:</span>
          {allVariants.map((vt: any, i: number) => (
            <a
              key={i}
              href={`/print/${id}?v=${i}`}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                selectedVariantIdx === i
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-600'
              }`}
            >
              {vt.sample_color || `Variant ${i + 1}`}
            </a>
          ))}
          <a
            href={`/print/${id}?v=all`}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ml-2 ${
              v === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-400 hover:text-gray-600'
            }`}
          >
            All Variants
          </a>
        </div>
      )}

      <div className={`max-w-4xl mx-auto p-8 print:p-0 ${allVariants.length > 1 ? 'pt-20 print:pt-0' : ''}`}>

        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
            <div className="flex gap-2 mt-1.5">
              {[product.category, product.brand].filter(Boolean).map((v, i) => (
                <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{v}</span>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-gray-700">HIGH SPIRIT</div>
            <div className="text-xs text-gray-400 mt-0.5">Tech Pack · {printDate}</div>
          </div>
        </div>

        {/* Illustration Images */}
        {printIllustrations.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 pb-1 border-b border-gray-200">
              Design Illustrations ({printIllustrations.length})
            </h2>
            {/* Single variant image (from tech pack): show full-width, no crop */}
            {variantImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={variantImageUrl}
                alt={rawColor || 'Design'}
                className="w-full max-h-96 object-contain border border-gray-200 rounded-lg bg-gray-50"
              />
            ) : (
              <div className={`grid gap-3 ${printIllustrations.length === 1 ? 'grid-cols-1' : printIllustrations.length === 2 ? 'grid-cols-2' : 'grid-cols-4'}`}>
                {printIllustrations.map(f => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={f.id}
                    src={f.file_url}
                    alt={f.name}
                    className={`w-full border border-gray-200 rounded-lg ${printIllustrations.length <= 2 ? 'max-h-80 object-contain bg-gray-50' : 'aspect-square object-cover'}`}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Design Specifications */}
        {hasSpecs && (
          <div className="space-y-6">
            {variants.map((v: any, idx: number) => {
              const hasVariantSpecs = v && (v.fabric || v.lining || v.zipper || v.farma || v.season_year);
              if (!hasVariantSpecs) return null;
              return (
                <section key={idx} className="mb-8 print:break-inside-avoid">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 pb-1 border-b border-gray-200">
                    Design Specifications {variants.length > 1 ? `— Variant ${idx + 1} (${v.sample_color || 'No Color'})` : ''}
                    {v.designer_name && <span className="font-normal normal-case ml-2 text-gray-400">— {v.designer_name}</span>}
                  </h2>
                  <div>
                    <SpecRow label="Sample Color"   value={v.sample_color} />
                    <SpecRow label="Farma"          value={v.farma} />
                    <SpecRow label="Season Year"    value={v.season_year} />
                    <SpecRow label="Fabric"         value={v.fabric} />
                    <SpecRow label="Lining"         value={v.lining} />
                    <SpecRow label="Air Mesh"       value={v.air_mesh} />
                    <SpecRow label="Zipper"         value={v.zipper} />
                    <SpecRow label="Puller"         value={v.puller} />
                    <SpecRow label="9mm Patta"      value={v.patta_9mm} />
                    <SpecRow label="Patta 1"        value={v.patta_1} />
                    <SpecRow label="Patta 2"        value={v.patta_2} />
                    <SpecRow label="Lader Lock"     value={v.lader_lock} />
                    <SpecRow label="Branding"       value={v.branding} />
                    <SpecRow label="Screen Print"   value={v.screen_print} />
                    <SpecRow label="Digital Print"  value={v.digital_print} />
                    <SpecRow label="Bartech"        value={v.bartech} />
                    <SpecRow label="Re-Sampling By" value={v.re_sampling_by} />
                    {v.color_skus && v.color_skus.length > 0 && (
                      <div className="flex gap-3 py-1.5 border-b border-gray-100 last:border-0">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-36 shrink-0 pt-0.5">Color SKUs</div>
                        <div className="text-sm text-gray-800 flex-1 font-mono">{v.color_skus.join(', ')}</div>
                      </div>
                    )}
                    {v.unique_feature && (
                      <div className="flex gap-3 py-1.5 border-b border-gray-100 last:border-0">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-36 shrink-0 pt-0.5">Unique Feature / USP</div>
                        <div className="text-sm text-gray-800 flex-1">{v.unique_feature}</div>
                      </div>
                    )}
                  </div>
                  {v.remarks && (
                    <div className="mt-4 p-3 bg-gray-50 border-l-4 border-gray-300 rounded-r-lg">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Designer Remarks</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{v.remarks}</p>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {/* Sample Images */}
        {sampleImages.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 pb-1 border-b border-gray-200">
              Sample Images ({sampleImages.length})
              {sampling?.sampler_name && <span className="font-normal normal-case ml-2 text-gray-400">— {sampling.sampler_name}</span>}
            </h2>
            <div className="grid grid-cols-4 gap-3">
              {sampleImages.map(f => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={f.id}
                  src={f.file_url}
                  alt={f.name}
                  className="w-full aspect-square object-cover border border-gray-200 rounded-lg"
                />
              ))}
            </div>
            {sampling?.sampler_remarks && (
              <div className="mt-4 p-3 bg-gray-50 border-l-4 border-gray-300 rounded-r-lg">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Sampler Remarks</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{sampling.sampler_remarks}</p>
              </div>
            )}
          </section>
        )}

        {illustrationImages.length === 0 && !hasSpecs && sampleImages.length === 0 && (
          <p className="text-gray-400 text-sm">No tech pack data available yet for this product.</p>
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 12mm; size: A4; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>
    </div>
  )
}
