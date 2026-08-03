import { createClient } from '@supabase/supabase-js'

interface CreateFixtureListingOptions {
  title?: string
  intent?: 'swap' | 'sale' | 'give'
  /** Defaults to e2e-fixture@usa.edu.ph (supabase/seed.sql) if omitted. */
  ownerEmail?: string
  /** Threaded through to create_listing()'s p_estimated_value_centavos. Only
   * persisted by the RPC when intent is 'swap' — see
   * supabase/migrations/20260901010000_phase4_listing_rpc_estimated_value.sql. */
  estimatedValueCentavos?: number
}

/**
 * Creates a listing directly via create_listing(), signed in as a seed
 * fixture user (supabase/seed.sql — password 'not-a-real-password' for all
 * fixture users, already checked into the repo as local-dev-only fixtures).
 * Bypasses the UI post flow entirely — this is test setup, not the thing
 * under test.
 */
export async function createFixtureListing(
  overrides: CreateFixtureListingOptions = {},
): Promise<{ id: string; code: string }> {
  const client = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  )
  const { error: authError } = await client.auth.signInWithPassword({
    email: overrides.ownerEmail ?? 'e2e-fixture@usa.edu.ph',
    password: 'not-a-real-password',
  })
  if (authError) throw new Error(`Could not sign in fixture user for setup: ${authError.message}`)

  const { data: categories } = await client.from('categories').select('id').limit(1)
  const { data: spots } = await client.from('meetup_spots').select('id').limit(1)
  const intent = overrides.intent ?? 'give'

  const { data, error } = await client.rpc('create_listing', {
    p_id: crypto.randomUUID(),
    p_intent: intent,
    p_title: overrides.title ?? 'Fixture listing',
    p_description: null,
    p_category_id: categories?.[0]?.id ?? null,
    p_condition: 'good',
    p_ask_centavos: intent === 'sale' ? 10000 : null,
    p_accepts_cash: false,
    p_meetup_spot_id: spots?.[0]?.id ?? null,
    p_wants: intent === 'swap' ? ['Anything useful'] : null,
    p_image_paths: null,
    p_estimated_value_centavos: overrides.estimatedValueCentavos ?? null,
  })
  if (error || !data?.[0]) throw new Error(`Could not create fixture listing: ${error?.message}`)
  return data[0]
}

/**
 * Creates a listing + an already-accepted offer between two fixture users,
 * entirely via direct RPC calls (bypassing the negotiation UI, which is
 * already covered by offer-negotiation.spec.ts). Uses a 'give' listing to
 * keep the fixture minimal — Phase 5 tests care about deal-room mechanics,
 * not offer contents.
 */
export async function createFixtureAcceptedOffer(options: {
  ownerEmail: string
  offererEmail: string
  listingTitle: string
}): Promise<{ listingId: string; listingCode: string; offerId: string }> {
  const ownerClient = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  )
  const { error: ownerAuthError } = await ownerClient.auth.signInWithPassword({
    email: options.ownerEmail,
    password: 'not-a-real-password',
  })
  if (ownerAuthError) throw new Error(`Could not sign in owner: ${ownerAuthError.message}`)

  const { data: categories } = await ownerClient.from('categories').select('id').limit(1)
  const { data: spots } = await ownerClient.from('meetup_spots').select('id').limit(1)

  const { data: listingRows, error: listingError } = await ownerClient.rpc('create_listing', {
    p_id: crypto.randomUUID(),
    p_intent: 'give',
    p_title: options.listingTitle,
    p_description: null,
    p_category_id: categories?.[0]?.id ?? null,
    p_condition: 'good',
    p_ask_centavos: null,
    p_accepts_cash: false,
    p_meetup_spot_id: spots?.[0]?.id ?? null,
    p_wants: null,
    p_image_paths: null,
    p_estimated_value_centavos: null,
  })
  if (listingError || !listingRows?.[0]) {
    throw new Error(`Could not create fixture listing: ${listingError?.message}`)
  }
  const listing = listingRows[0]

  const offererClient = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  )
  const { error: offererAuthError } = await offererClient.auth.signInWithPassword({
    email: options.offererEmail,
    password: 'not-a-real-password',
  })
  if (offererAuthError) throw new Error(`Could not sign in offerer: ${offererAuthError.message}`)

  const { data: offerId, error: offerError } = await offererClient.rpc('create_offer', {
    p_listing_id: listing.id,
    p_item_listing_ids: null,
    p_cash_centavos: 0,
    p_cash_direction: 'from_offerer',
    p_note: null,
  })
  if (offerError || !offerId)
    throw new Error(`Could not create fixture offer: ${offerError?.message}`)

  const { error: acceptError } = await ownerClient.rpc('accept_offer', { p_offer_id: offerId })
  if (acceptError) throw new Error(`Could not accept fixture offer: ${acceptError.message}`)

  return { listingId: listing.id, listingCode: listing.code, offerId }
}
