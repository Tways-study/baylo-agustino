'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function followUser(followeeId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('follow_user', { p_followee_id: followeeId })
  if (error) return { error: 'Could not follow this user.' }
  revalidatePath('/')
  return {}
}

export async function unfollowUser(followeeId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('unfollow_user', { p_followee_id: followeeId })
  if (error) return { error: 'Could not unfollow this user.' }
  revalidatePath('/')
  return {}
}
