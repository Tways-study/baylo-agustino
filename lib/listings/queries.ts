import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { CategoryRow, ListingIntent, ListingStatus, MeetupSpotRow } from '@/types/database'

export interface ListingImageRef {
  storage_path: string
  position: number
}

export interface ListingWantRef {
  label: string
  position: number
}

export interface FeedListing {
  id: string
  code: string
  intent: ListingIntent
  title: string
  condition: string | null
  ask_centavos: number | null
  bumped_at: string
  listing_images: ListingImageRef[]
  listing_wants: ListingWantRef[]
  profiles: { display_name: string; verified_at: string | null } | null
}

export interface ListingDetail {
  id: string
  code: string
  owner_id: string
  intent: ListingIntent
  title: string
  description: string | null
  category_id: number | null
  condition: string | null
  ask_centavos: number | null
  accepts_cash: boolean
  status: ListingStatus
  meetup_spot_id: number | null
  view_count: number
  created_at: string
  bumped_at: string
  expires_at: string
  listing_images: ListingImageRef[]
  listing_wants: ListingWantRef[]
  profiles: {
    display_name: string
    program: string | null
    year_level: number | null
    avatar_url: string | null
    verified_at: string | null
    trust_score: number
  } | null
  meetup_spots: { name: string; hint: string | null; is_camera_covered: boolean } | null
}

export interface MyListing {
  id: string
  code: string
  title: string
  intent: ListingIntent
  status: ListingStatus
  ask_centavos: number | null
  view_count: number
  listing_images: ListingImageRef[]
}

export async function getCategories(): Promise<CategoryRow[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('categories').select('*').order('position')
  return data ?? []
}

export async function getMeetupSpots(): Promise<MeetupSpotRow[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('meetup_spots').select('*').eq('active', true).order('name')
  return data ?? []
}

export async function getFeedListings(): Promise<FeedListing[]> {
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
  return (data ?? []) as unknown as FeedListing[]
}

export async function getListingByCode(code: string): Promise<ListingDetail | null> {
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
  return (data ?? null) as unknown as ListingDetail | null
}

export async function getMyListings(userId: string): Promise<MyListing[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('listings')
    .select(
      'id, code, title, intent, status, ask_centavos, view_count, listing_images(storage_path, position)',
    )
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as MyListing[]
}
