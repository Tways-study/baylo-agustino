'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { postWantSchema } from '@/lib/wants/schemas'

export async function postWant(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const raw = {
    title: formData.get('title'),
    details: formData.get('details') || undefined,
    budgetCentavos: formData.get('budgetCentavos') || undefined,
    offering: formData.get('offering') || undefined,
  }

  const result = postWantSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check your entries.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('post_want', {
    p_title: result.data.title,
    p_details: result.data.details ?? null,
    p_budget_centavos: result.data.budgetCentavos ?? null,
    p_offering: result.data.offering ?? null,
  })

  if (error) {
    return { error: 'Could not post your Hanap. Try again.' }
  }

  revalidatePath('/hanap')
  return {}
}

export async function closeWant(wantId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('close_want', { p_want_id: wantId })

  if (error) {
    return { error: 'Could not close this Hanap.' }
  }

  revalidatePath('/hanap')
  return {}
}
