import { getCurrentProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { NewProductForm } from '@/components/products/new-product-form'
import type { Profile } from '@/lib/types'

export default async function NewProductPage() {
  const profile = await getCurrentProfile()

  if (!profile || !['admin', 'sales'].includes(profile.role)) {
    redirect('/products')
  }

  return (
    <div>
      <Header
        title="New Product"
        subtitle="Fill in the product details and sales requirement, then create the product."
      />
      <div className="p-6">
        <NewProductForm profile={profile as Profile} />
      </div>
    </div>
  )
}
