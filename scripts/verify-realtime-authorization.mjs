// scripts/verify-realtime-authorization.mjs
/**
 * Raw-client proof that Realtime respects RLS on `messages`: a third party
 * subscribed to postgres_changes for an offer they aren't a party to must
 * receive zero events when one of the two real parties sends a message.
 *
 * Not run in CI — a manual verification script for the Phase 5 "a third
 * user cannot subscribe to a deal channel they aren't party to" acceptance
 * criterion, since neither pgTAP (server-side SQL) nor Playwright (browser
 * automation, not a "raw client") can exercise Realtime's own authorization
 * layer directly.
 *
 * Usage: node scripts/verify-realtime-authorization.mjs
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set.
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY first.')
  process.exit(1)
}

const OWNER_EMAIL = 'e2e-fixture@usa.edu.ph'
const OFFERER_EMAIL = 'e2e-fixture-2@usa.edu.ph'
const THIRD_PARTY_EMAIL = 'e2e-fixture-3@usa.edu.ph'
const PASSWORD = 'not-a-real-password'

async function signedInClient(email) {
  const client = createClient(url, anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`Could not sign in ${email}: ${error.message}`)
  return client
}

const owner = await signedInClient(OWNER_EMAIL)
const offerer = await signedInClient(OFFERER_EMAIL)
const thirdParty = await signedInClient(THIRD_PARTY_EMAIL)

const { data: categories } = await owner.from('categories').select('id').limit(1)
const { data: listingRows, error: listingError } = await owner.rpc('create_listing', {
  p_id: randomUUID(),
  p_intent: 'give',
  p_title: 'Realtime auth probe fixture',
  p_description: null,
  p_category_id: categories?.[0]?.id ?? null,
  p_condition: 'good',
  p_ask_centavos: null,
  p_accepts_cash: false,
  p_meetup_spot_id: null,
  p_wants: null,
  p_image_paths: null,
  p_estimated_value_centavos: null,
})
if (listingError || !listingRows?.[0]) {
  throw new Error(`Could not create fixture listing: ${listingError?.message}`)
}

const { data: offerId, error: offerError } = await offerer.rpc('create_offer', {
  p_listing_id: listingRows[0].id,
  p_item_listing_ids: null,
  p_cash_centavos: 0,
  p_cash_direction: 'from_offerer',
  p_note: null,
})
if (offerError || !offerId) {
  throw new Error(`Could not create fixture offer: ${offerError?.message}`)
}

let received = 0
const channel = thirdParty
  .channel(`verify-offer-${offerId}`)
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: `offer_id=eq.${offerId}` },
    () => {
      received += 1
    },
  )

await new Promise((resolve, reject) => {
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') resolve()
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      reject(new Error(`Subscribe failed: ${status}`))
    }
  })
})

const { data: senderUser } = await offerer.auth.getUser()
const { error: insertError } = await offerer
  .from('messages')
  .insert({ offer_id: offerId, sender_id: senderUser.user.id, body: 'realtime auth probe' })
if (insertError) throw new Error(`Could not send probe message: ${insertError.message}`)

await new Promise((resolve) => setTimeout(resolve, 3000))
await thirdParty.removeChannel(channel)

if (received === 0) {
  console.log('PASS: third party received 0 events for a deal they are not party to.')
  process.exit(0)
} else {
  console.error(
    `FAIL: third party received ${received} event(s) — Realtime is leaking rows past RLS.`,
  )
  process.exit(1)
}
