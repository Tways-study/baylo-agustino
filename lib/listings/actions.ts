'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createListingSchema, updateListingSchema, listingIdSchema } from '@/lib/listings/schemas'
import { scanListingText } from '@/lib/listings/banned-words'
import type { CreateListingInput, UpdateListingInput } from '@/lib/listings/schemas'

export interface ListingActionResult {
  error?: string
  blockedRule?: string
  code?: string
}

function authoritativeBannedCheck(title: string, description: string | undefined): string | null {
  const scan = scanListingText(`${title} ${description ?? ''}`)
  if (scan.severity !== 'hard') return null
  const first = scan.matches[0]
  return first ? `${first.rule}: ${first.explanation}` : 'This listing was blocked by house rules.'
}

export async function createListing(
  listingId: string,
  raw: CreateListingInput,
): Promise<ListingActionResult> {
  const result = createListingSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check your entries.' }
  }

  const blocked = authoritativeBannedCheck(result.data.title, result.data.description)
  if (blocked) return { error: blocked, blockedRule: blocked }

  const supabase = await createClient()
  const input = result.data

  const { data, error } = await supabase.rpc('create_listing', {
    p_id: listingId,
    p_intent: input.intent,
    p_title: input.title,
    p_description: input.description ?? null,
    p_category_id: input.categoryId,
    p_condition: input.condition,
    p_ask_centavos: input.intent === 'sale' ? input.askCentavos : null,
    p_accepts_cash: input.intent === 'swap' ? input.acceptsCash : false,
    p_meetup_spot_id: input.meetupSpotId,
    p_wants: input.intent === 'swap' ? input.wants : null,
    p_image_paths: input.images,
  })

  if (error || !data || data.length === 0) {
    return { error: error?.message ?? 'Could not post your listing. Try again.' }
  }

  redirect(`/l/${data[0]?.code}`)
}

export async function updateListing(
  listingId: string,
  raw: UpdateListingInput,
): Promise<ListingActionResult> {
  const result = updateListingSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check your entries.' }
  }

  const blocked = authoritativeBannedCheck(result.data.title, result.data.description)
  if (blocked) return { error: blocked, blockedRule: blocked }

  const supabase = await createClient()
  const input = result.data

  const { error } = await supabase.rpc('update_listing', {
    p_id: listingId,
    p_title: input.title,
    p_description: input.description ?? null,
    p_category_id: input.categoryId,
    p_condition: input.condition,
    p_ask_centavos: input.intent === 'sale' ? input.askCentavos : null,
    p_accepts_cash: input.intent === 'swap' ? input.acceptsCash : false,
    p_meetup_spot_id: input.meetupSpotId,
    p_wants: input.intent === 'swap' ? input.wants : null,
  })

  if (error) return { error: 'Could not save your changes. Try again.' }
  return {}
}

export async function archiveListing(listingId: string): Promise<ListingActionResult> {
  const parsed = listingIdSchema.safeParse({ listingId })
  if (!parsed.success) return { error: 'Invalid listing.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('archive_listing', { p_id: listingId })
  if (error) return { error: 'Could not archive this listing.' }
  return {}
}

export async function bumpListing(listingId: string): Promise<ListingActionResult> {
  const parsed = listingIdSchema.safeParse({ listingId })
  if (!parsed.success) return { error: 'Invalid listing.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('bump_listing', { p_id: listingId })
  if (error) return { error: error.message }
  return {}
}
