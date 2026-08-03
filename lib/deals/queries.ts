import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type {
  DealConfirmationRow,
  MeetupRow,
  MessageRow,
  OfferCancellationRow,
} from '@/types/database'

export interface MeetupWithSpot extends MeetupRow {
  spot: { id: number; name: string; hint: string | null }
}

export async function getMeetup(offerId: string): Promise<MeetupWithSpot | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('meetups')
    .select('*, spot:meetup_spots(id, name, hint)')
    .eq('offer_id', offerId)
    .maybeSingle()
  return (data ?? null) as unknown as MeetupWithSpot | null
}

export async function getMessages(offerId: string): Promise<MessageRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('offer_id', offerId)
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function getDealConfirmations(offerId: string): Promise<DealConfirmationRow[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('deal_confirmations').select('*').eq('offer_id', offerId)
  return data ?? []
}

export async function getCancellation(offerId: string): Promise<OfferCancellationRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('offer_cancellations')
    .select('*')
    .eq('offer_id', offerId)
    .maybeSingle()
  return data ?? null
}
