import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMessageSchema, type SendMessageInput } from '@/lib/deals/schemas'
import type { Database } from '@/types/database'

export async function sendMessage(
  supabase: SupabaseClient<Database>,
  currentUserId: string,
  raw: SendMessageInput,
): Promise<{ error?: string }> {
  const result = sendMessageSchema.safeParse(raw)
  if (!result.success) return { error: result.error.errors[0]?.message ?? 'Check your message.' }

  const { error } = await supabase.from('messages').insert({
    offer_id: result.data.offerId,
    sender_id: currentUserId,
    body: result.data.body,
  })
  if (error) return { error: error.message }
  return {}
}
