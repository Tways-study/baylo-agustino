import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getSignedImageUrls } from '@/lib/media/get-image-url'
import type { FeedFilters } from './schemas'
import { priceBandToRange } from './format'
import { buildPrefixTsQuery } from './search'
import type { FeedListing, MyListing } from '@/lib/listings/queries'
import type { CategoryRow } from '@/types/database'

export interface FeedCursor {
  bumpedAt: string
  id: string
}

export type FeedListingWithImage = FeedListing & { imageUrl?: string }

export interface FeedPage {
  listings: FeedListingWithImage[]
  nextCursor: FeedCursor | null
}

const PAGE_SIZE = 24

const FEED_SELECT =
  'id, code, intent, title, condition, ask_centavos, bumped_at, ' +
  'listing_images(storage_path, position), ' +
  'listing_wants(label, position), ' +
  'profiles!listings_owner_id_fkey(display_name, verified_at)'

const FEED_SELECT_WITH_PHOTOS_ONLY =
  'id, code, intent, title, condition, ask_centavos, bumped_at, ' +
  'listing_images!inner(storage_path, position), ' +
  'listing_wants(label, position), ' +
  'profiles!listings_owner_id_fkey(display_name, verified_at)'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

async function attachImageUrls(listings: FeedListing[]): Promise<FeedListingWithImage[]> {
  const coverPaths = listings
    .map((l) => l.listing_images?.find((i) => i.position === 0)?.storage_path)
    .filter((p): p is string => !!p)
  const signedUrls = await getSignedImageUrls(coverPaths)
  return listings.map((l) => {
    const cover = l.listing_images?.find((i) => i.position === 0)?.storage_path
    return { ...l, imageUrl: cover ? signedUrls[cover] : undefined }
  })
}

async function runFeedQuery(
  supabase: SupabaseServerClient,
  filters: FeedFilters,
  categoryId: number | null,
  cursor?: FeedCursor,
  prefixQuery?: string,
): Promise<FeedPage> {
  let query = supabase
    .from('listings')
    .select(filters.photos === '1' ? FEED_SELECT_WITH_PHOTOS_ONLY : FEED_SELECT)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())

  const effectiveIntent = filters.price ? 'sale' : filters.intent
  if (effectiveIntent) query = query.eq('intent', effectiveIntent)
  if (filters.condition) query = query.eq('condition', filters.condition)
  if (categoryId !== null) query = query.eq('category_id', categoryId)

  if (filters.price) {
    const { min, max } = priceBandToRange(filters.price)
    query = query.gte('ask_centavos', min)
    if (max !== null) query = query.lte('ask_centavos', max)
  }

  if (prefixQuery) query = query.textSearch('search_tsv', prefixQuery)

  if (cursor) {
    query = query.or(
      `bumped_at.lt.${cursor.bumpedAt},and(bumped_at.eq.${cursor.bumpedAt},id.lt.${cursor.id})`,
    )
  }

  const { data } = await query
    .order('bumped_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE)

  const rows = (data ?? []) as unknown as FeedListing[]
  const last = rows[rows.length - 1]
  const nextCursor =
    rows.length === PAGE_SIZE && last ? { bumpedAt: last.bumped_at, id: last.id } : null

  return { listings: await attachImageUrls(rows), nextCursor }
}

async function runFeedQueryByIds(
  supabase: SupabaseServerClient,
  filters: FeedFilters,
  categoryId: number | null,
  ids: string[],
): Promise<FeedPage> {
  if (ids.length === 0) return { listings: [], nextCursor: null }

  let query = supabase
    .from('listings')
    .select(filters.photos === '1' ? FEED_SELECT_WITH_PHOTOS_ONLY : FEED_SELECT)
    .in('id', ids)

  // The fuzzy RPC only matches on title similarity — it doesn't know about
  // the other active filters, so they're re-applied here exactly like
  // runFeedQuery does. Without this, a filtered search (e.g. intent=swap)
  // could fuzzy-match a sale listing and show it anyway.
  const effectiveIntent = filters.price ? 'sale' : filters.intent
  if (effectiveIntent) query = query.eq('intent', effectiveIntent)
  if (filters.condition) query = query.eq('condition', filters.condition)
  if (categoryId !== null) query = query.eq('category_id', categoryId)
  if (filters.price) {
    const { min, max } = priceBandToRange(filters.price)
    query = query.gte('ask_centavos', min)
    if (max !== null) query = query.lte('ask_centavos', max)
  }

  const { data } = await query
  const rows = (data ?? []) as unknown as FeedListing[]

  // .in() does not guarantee results come back in `ids` order, which is
  // the RPC's similarity-ranked order — re-sort explicitly so the best
  // fuzzy match still shows first.
  const rank = new Map(ids.map((id, i) => [id, i]))
  rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))

  return { listings: await attachImageUrls(rows), nextCursor: null }
}

export async function getFeedListings(
  filters: FeedFilters,
  categories: CategoryRow[],
  cursor?: FeedCursor,
): Promise<FeedPage> {
  const supabase = await createClient()
  const categoryId = filters.category
    ? (categories.find((c) => c.slug === filters.category)?.id ?? null)
    : null

  // Computed once regardless of page, and reused on the final fallthrough
  // return below — without this, page 2+ of a search would silently drop
  // the search constraint (filters.q is still truthy but cursor is now
  // set, so the block below is skipped; the old code's fallthrough call
  // omitted the prefixQuery argument entirely).
  const prefixQuery = filters.q ? buildPrefixTsQuery(filters.q) : ''

  // A search term with zero matches on the primary index falls back to
  // fuzzy trigram matching instead of an empty feed. The fallback isn't
  // paginated — the RPC just returns its best N matches — so it's only
  // attempted on the first page (no cursor).
  if (filters.q && !cursor && prefixQuery) {
    const primary = await runFeedQuery(supabase, filters, categoryId, cursor, prefixQuery)
    if (primary.listings.length > 0) return primary

    const { data } = await supabase.rpc('search_listings_fuzzy', {
      p_query: filters.q,
      p_limit: PAGE_SIZE,
    })
    const rows = (data ?? []) as unknown as Array<{ id: string }>
    return runFeedQueryByIds(
      supabase,
      filters,
      categoryId,
      rows.map((r) => r.id),
    )
  }

  return runFeedQuery(supabase, filters, categoryId, cursor, prefixQuery || undefined)
}

export async function getSavedListingIds(userId: string): Promise<Set<string>> {
  const supabase = await createClient()
  const { data } = await supabase.from('saved_listings').select('listing_id').eq('user_id', userId)
  return new Set((data ?? []).map((row) => row.listing_id))
}

export async function getSavedListings(userId: string): Promise<MyListing[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('saved_listings')
    .select(
      'listings(id, code, title, intent, status, ask_centavos, view_count, listing_images(storage_path, position))',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as unknown as Array<{ listings: MyListing | null }>
  return rows.map((r) => r.listings).filter((l): l is MyListing => l !== null)
}

export async function getRecentSearches(userId: string): Promise<string[]> {
  const supabase = await createClient()
  // Fetch more than 5 raw rows before deduping — a user who repeats a
  // query often would otherwise see fewer than 5 distinct suggestions
  // even with plenty of unique searches further back in their history.
  const { data } = await supabase
    .from('search_events')
    .select('query')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  return Array.from(new Set((data ?? []).map((r) => r.query))).slice(0, 5)
}
