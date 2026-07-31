import 'server-only'
import { createClient } from '@/lib/supabase/server'

export async function getCategories() {
  const supabase = await createClient()
  const { data } = await supabase.from('categories').select('*').order('position')
  return data ?? []
}

export async function getMeetupSpots() {
  const supabase = await createClient()
  const { data } = await supabase.from('meetup_spots').select('*').eq('active', true).order('name')
  return data ?? []
}

export async function getFeedListings() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('listings')
    .select(
      'id, code, intent, title, condition, ask_centavos, bumped_at, ' +
        'listing_images(storage_path, position), ' +
        'listing_wants(label, position), ' +
        'profiles!listings_owner_id_fkey(display_name, verified_at)',
    )
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('bumped_at', { ascending: false })
    .limit(24)
  return data ?? []
}

export async function getListingByCode(code: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('listings')
    .select(
      '*, listing_images(storage_path, position), listing_wants(label, position), ' +
        'profiles!listings_owner_id_fkey(display_name, program, year_level, avatar_url, verified_at, trust_score), ' +
        'meetup_spots(name, hint, is_camera_covered)',
    )
    .eq('code', code)
    .maybeSingle()
  return data
}

export async function getMyListings(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('listings')
    .select(
      'id, code, title, intent, status, ask_centavos, view_count, listing_images(storage_path, position)',
    )
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
  return data ?? []
}
