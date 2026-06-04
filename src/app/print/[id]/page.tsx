import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { PrintTrigger } from './print-trigger'

export default async function PrintTechPackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
      .select('id, name, file_url, file_type, department')
      .eq('product_id', id)
      .like('file_type', 'image/%')
      .in('department', ['design', 'sampling']),
  ])

  if (!product) redirect('/products')

  const illustrationImages = (files || []).filter(f => f.department === 'design')
  const sampleImages       = (files || []).filter(f => f.department === 'sampling')

  function SpecRow({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null
    return (
      <div className="flex gap-3 py-1.5 border-b border-gray-100 last:border-0">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide w-36 shrink-0 pt-0.5">{label}</div>
        <div className="text-sm text-gray-800 flex-1">{value}</div>
      </div>
    )
  }

  const variants = design?.variants && design.variants.length > 0 ? design.variants : design ? [design] : []
  const hasSpecs = variants.some((v: any) => v && (v.fabric || v.lining || v.zipper || v.farma || v.season_year))
  const printDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-white">
      <PrintTrigger />

      <div className="max-w-4xl mx-auto p-8 print:p-0">

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
        {illustrationImages.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 pb-1 border-b border-gray-200">
              Design Illustrations ({illustrationImages.length})
            </h2>
            <div className="grid grid-cols-4 gap-3">
              {illustrationImages.map(f => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={f.id}
                  src={f.file_url}
                  alt={f.name}
                  className="w-full aspect-square object-cover border border-gray-200 rounded-lg"
                />
              ))}
            </div>
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
