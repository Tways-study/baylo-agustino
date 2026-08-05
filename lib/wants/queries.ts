import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { WantRow } from '@/types/database'

export interface WantWithProfile extends WantRow {
  profiles: { display_name: string; avatar_url: string | null } | null
}

export async function getOpenWants(): Promise<WantWithProfile[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('wants')
    .select('*, profiles!wants_user_id_fkey(display_name, avatar_url)')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []) as WantWithProfile[]
}

export async function getMyWants(userId: string): Promise<WantRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('wants')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return (data ?? []) as WantRow[]
}
