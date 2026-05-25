import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { NewProductForm } from '@/components/products/new-product-form'
import type { Profile } from '@/lib/types'

export default async function NewProductPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  if (!['admin', 'design'].includes(profile?.role)) {
    redirect('/products')
  }

  return (
    <div>
      <Header
        title="New Product"
        subtitle="Fill in the design details and upload the tech pack, then create the product."
      />
      <div className="p-6">
        <NewProductForm profile={profile as Profile} />
      </div>
    </div>
  )
}
