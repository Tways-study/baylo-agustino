'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  createOfferSchema,
  claimOfferSchema,
  counterOfferSchema,
  offerIdSchema,
  type CreateOfferInput,
  type ClaimOfferInput,
  type CounterOfferInput,
} from '@/lib/offers/schemas'

export interface OfferActionResult {
  error?: string
  offerId?: string
}

export async function createOffer(raw: CreateOfferInput): Promise<OfferActionResult> {
  const result = createOfferSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check your offer.' }
  }

  const supabase = await createClient()
  const input = result.data

  const { data, error } = await supabase.rpc('create_offer', {
    p_listing_id: input.listingId,
    p_item_listing_ids: input.itemListingIds.length > 0 ? input.itemListingIds : null,
    p_cash_centavos: input.cashCentavos,
    p_cash_direction: input.cashDirection,
    p_note: input.note ?? null,
  })

  if (error || !data) {
    return { error: error?.message ?? 'Could not send your offer. Try again.' }
  }

  redirect(`/deals/${data}`)
}

export async function claimGiveListing(raw: ClaimOfferInput): Promise<OfferActionResult> {
  const result = claimOfferSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check your entry.' }
  }

  const supabase = await createClient()
  const input = result.data

  const { data, error } = await supabase.rpc('create_offer', {
    p_listing_id: input.listingId,
    p_item_listing_ids: null,
    p_cash_centavos: 0,
    p_cash_direction: 'from_offerer',
    p_note: input.note ?? null,
  })

  if (error || !data) {
    return { error: error?.message ?? 'Could not claim this. Try again.' }
  }

  redirect(`/deals/${data}`)
}

export async function counterOffer(raw: CounterOfferInput): Promise<OfferActionResult> {
  const result = counterOfferSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check your counter.' }
  }

  const supabase = await createClient()
  const input = result.data

  const { data, error } = await supabase.rpc('counter_offer', {
    p_offer_id: input.offerId,
    p_cash_centavos: input.cashCentavos,
    p_cash_direction: input.cashDirection,
    p_note: input.note ?? null,
  })

  if (error || !data) {
    return { error: error?.message ?? 'Could not send your counter. Try again.' }
  }

  return { offerId: data }
}

export async function acceptOffer(offerId: string): Promise<OfferActionResult> {
  const parsed = offerIdSchema.safeParse({ offerId })
  if (!parsed.success) return { error: 'Invalid offer.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('accept_offer', { p_offer_id: offerId })
  if (error) return { error: 'Could not accept this offer.' }
  return {}
}

export async function declineOffer(offerId: string): Promise<OfferActionResult> {
  const parsed = offerIdSchema.safeParse({ offerId })
  if (!parsed.success) return { error: 'Invalid offer.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('decline_offer', { p_offer_id: offerId })
  if (error) return { error: 'Could not decline this offer.' }
  return {}
}

export async function withdrawOffer(offerId: string): Promise<OfferActionResult> {
  const parsed = offerIdSchema.safeParse({ offerId })
  if (!parsed.success) return { error: 'Invalid offer.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('withdraw_offer', { p_offer_id: offerId })
  if (error) return { error: 'Could not withdraw this offer.' }
  return {}
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
}
