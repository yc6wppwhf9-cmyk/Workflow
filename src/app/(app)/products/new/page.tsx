import { getCurrentProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { NewProductForm } from '@/components/products/new-product-form'
import type { Profile } from '@/lib/types'

export default async function NewProductPage() {
  const profile = await getCurrentProfile()

  if (!profile || !['admin', 'sales', 'design_head', 'merchandising_head'].includes(profile.role)) {
    redirect('/products')
  }

  const isDesignHead = profile.role === 'design_head'
  const isMerchandisingHead = profile.role === 'merchandising_head'

  const subtitle = isDesignHead
    ? 'Create a design-initiated product — sales details can be added later.'
    : isMerchandisingHead
    ? 'Create a product and optionally notify someone via email.'
    : 'Fill in the product details and sales requirement, then create the product.'

  return (
    <div>
      <Header
        title="New Product"
        subtitle={subtitle}
      />
      <div className="p-6">
        <NewProductForm profile={profile as Profile} />
      </div>
    </div>
  )
}
