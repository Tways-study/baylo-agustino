'use server'

import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth/session'
import { feedFiltersSchema, type FeedFilters } from './schemas'
import { getFeedListings, type FeedCursor, type FeedPage } from './queries'
import type { CategoryRow } from '@/types/database'

export async function loadMoreListings(
  cursor: FeedCursor,
  rawFilters: FeedFilters,
  categories: CategoryRow[],
): Promise<FeedPage> {
  const filters = feedFiltersSchema.parse(rawFilters)
  return getFeedListings(filters, categories, cursor)
}

export interface SavedListingActionResult {
  error?: string
}

export async function saveListing(listingId: string): Promise<SavedListingActionResult> {
  const user = await getAuthUser()
  if (!user) return { error: 'Session expired. Sign in again.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('saved_listings')
    .insert({ user_id: user.id, listing_id: listingId })

  // 23505 = unique_violation — already saved, treat as a no-op success
  // rather than surfacing an error for a double-tap.
  if (error && error.code !== '23505') return { error: 'Could not save this listing.' }
  return {}
}

export async function unsaveListing(listingId: string): Promise<SavedListingActionResult> {
  const user = await getAuthUser()
  if (!user) return { error: 'Session expired. Sign in again.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('saved_listings')
    .delete()
    .eq('user_id', user.id)
    .eq('listing_id', listingId)

  if (error) return { error: 'Could not remove this listing.' }
  return {}
}

export async function logSearchEvent(query: string): Promise<void> {
  const trimmed = query.trim()
  if (!trimmed) return

  const user = await getAuthUser()
  if (!user) return

  const supabase = await createClient()
  await supabase.from('search_events').insert({ user_id: user.id, query: trimmed })
}
