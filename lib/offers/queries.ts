import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { ListingIntent, NotificationRow, OfferStatus } from '@/types/database'

export interface OfferableListing {
  id: string
  code: string
  title: string
  intent: ListingIntent
  ask_centavos: number | null
  estimated_value_centavos: number | null
}

/** The caller's own active listings, eligible to be picked in the item picker. */
export async function getOwnOfferableListings(userId: string): Promise<OfferableListing[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('listings')
    .select('id, code, title, intent, ask_centavos, estimated_value_centavos')
    .eq('owner_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as OfferableListing[]
}

export interface ListingForOffer {
  id: string
  code: string
  owner_id: string
  intent: ListingIntent
  title: string
  status: string
  expires_at: string
  ask_centavos: number | null
  estimated_value_centavos: number | null
}

export async function getListingForOffer(code: string): Promise<ListingForOffer | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('listings')
    .select(
      'id, code, owner_id, intent, title, status, expires_at, ask_centavos, estimated_value_centavos',
    )
    .eq('code', code)
    .maybeSingle()
  return (data ?? null) as unknown as ListingForOffer | null
}

export interface OfferThreadRow {
  id: string
  listing_id: string
  root_offer_id: string
  from_user_id: string
  to_user_id: string
  parent_offer_id: string | null
  cash_centavos: number
  cash_direction: 'from_offerer' | 'to_offerer'
  note: string | null
  status: OfferStatus
  expires_at: string
  created_at: string
  responded_at: string | null
}

/** Full negotiation chain, root to leaf, via the get_offer_thread RPC (recursive CTE). */
export async function getOfferThread(offerId: string): Promise<OfferThreadRow[]> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_offer_thread', { p_offer_id: offerId })
  return (data ?? []) as unknown as OfferThreadRow[]
}

export interface InboxThread {
  id: string
  listing_id: string
  from_user_id: string
  to_user_id: string
  cash_centavos: number
  cash_direction: 'from_offerer' | 'to_offerer'
  status: OfferStatus
  expires_at: string
  created_at: string
  listing: {
    id: string
    code: string
    title: string
    owner_id: string
    intent: ListingIntent
    listing_images: { storage_path: string; position: number }[]
  }
  counterpartyName: string
}

/**
 * One row per thread — the leaf (status <> 'countered') of every chain the
 * caller is a party to. No recursion needed: a counter always marks
 * exactly its immediate parent 'countered' and never leaves two live rows
 * in the same chain, so the leaf is simply the one non-'countered' row per
 * root_offer_id. Split into received/sent by comparing listing.owner_id to
 * the caller — stable across counters because listing ownership never
 * changes, only from_user_id/to_user_id swap.
 */
export async function getInboxThreads(
  userId: string,
): Promise<{ received: InboxThread[]; sent: InboxThread[] }> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('offers')
    .select(
      'id, listing_id, from_user_id, to_user_id, cash_centavos, cash_direction, status, expires_at, created_at, ' +
        'listings!inner(id, code, title, owner_id, intent, listing_images(storage_path, position)), ' +
        'from_profile:profiles!offers_from_user_id_fkey(display_name), ' +
        'to_profile:profiles!offers_to_user_id_fkey(display_name)',
    )
    .neq('status', 'countered')
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
    .order('expires_at', { ascending: true })

  interface RawRow {
    id: string
    listing_id: string
    from_user_id: string
    to_user_id: string
    cash_centavos: number
    cash_direction: 'from_offerer' | 'to_offerer'
    status: OfferStatus
    expires_at: string
    created_at: string
    listings: InboxThread['listing']
    from_profile: { display_name: string } | null
    to_profile: { display_name: string } | null
  }

  const rows = (data ?? []) as unknown as RawRow[]
  const received: InboxThread[] = []
  const sent: InboxThread[] = []

  for (const row of rows) {
    const isReceived = row.listings.owner_id === userId
    const counterpartyName = isReceived
      ? (row.from_profile?.display_name ?? 'Someone')
      : (row.to_profile?.display_name ?? 'Someone')

    const thread: InboxThread = {
      id: row.id,
      listing_id: row.listing_id,
      from_user_id: row.from_user_id,
      to_user_id: row.to_user_id,
      cash_centavos: row.cash_centavos,
      cash_direction: row.cash_direction,
      status: row.status,
      expires_at: row.expires_at,
      created_at: row.created_at,
      listing: row.listings,
      counterpartyName,
    }

    if (isReceived) received.push(thread)
    else sent.push(thread)
  }

  return { received, sent }
}

export async function getUnreadNotifications(userId: string): Promise<NotificationRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(20)
  return data ?? []
}
