import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const TEAM_MEMBERS = [
  { email: 'amrita.kumari@hscvpl.com',       full_name: 'Amrita Kumari',       role: 'design' },
  { email: 'rahul.kumar@hscvpl.com',          full_name: 'Rahul Kumar',          role: 'design' },
  { email: 'darshita.dubey@hscvpl.com',       full_name: 'Dharshita Dubey',      role: 'design' },
  { email: 'sayantani.rauth@hscvpl.com',      full_name: 'Sayantani Raut',       role: 'design' },
  { email: 'shriya.kulkarni@hscvpl.com',      full_name: 'Shriya Kulkarni',      role: 'design' },
  { email: 'anuja.mulik@hscvpl.com',          full_name: 'Anuja Mulik',          role: 'marketing' },
  { email: 'krishnendu.br@hscvpl.com',        full_name: 'Krishnendu BR',        role: 'marketing' },
  { email: 'shivam.patil@hscvpl.com',         full_name: 'Shivam Patil',         role: 'marketing' },
  { email: 'suresh.swanti@hscvpl.com',        full_name: 'Suresh Swenti',        role: 'marketing' },
  { email: 'bhavesh.ambekar@hscvpl.com',      full_name: 'Bahvesh Ambekar',      role: 'marketing' },
  { email: 'ganesh.kale@hscvpl.com',          full_name: 'Ganesh Kale',          role: 'merchandising' },
  { email: 'sagar.tupe@hscvpl.com',           full_name: 'Sagar Tupe',           role: 'merchandising' },
  { email: 'prasanna.adsule@hscvpl.com',      full_name: 'Prasanna Adsule',      role: 'merchandising' },
  { email: 'vijay.laxmi@hscvpl.com',          full_name: 'Vijay Laxmi',          role: 'merchandising' },
  { email: 'tejashree.kalsulkar@hscvpl.com',  full_name: 'Tejashree Kalsulkar',  role: 'bom' },
]

export async function GET() {
  // Only allow admin users to trigger this
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const results: { email: string; status: string }[] = []

  for (const member of TEAM_MEMBERS) {
    const { data, error } = await admin.auth.admin.createUser({
      email: member.email,
      password: 'Welcome@2026',
      email_confirm: true,
      user_metadata: { full_name: member.full_name },
    })

    if (error) {
      results.push({ email: member.email, status: `FAILED: ${error.message}` })
      continue
    }

    // Wait for the profile trigger to fire
    await new Promise(r => setTimeout(r, 600))

    await admin.from('profiles').update({
      full_name:            member.full_name,
      role:                 member.role,
      must_change_password: true,
    }).eq('id', data.user.id)

    results.push({ email: member.email, status: 'OK' })
  }

  return NextResponse.json({ created: results.filter(r => r.status === 'OK').length, results })
}
