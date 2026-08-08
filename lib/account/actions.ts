'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export interface DeleteAccountResult {
  error?: string
}

// Deleting an auth.users row can only be done via the Supabase Admin API,
// which requires the service-role key — there is no RLS-scoped RPC that
// could do this the way every other domain action in this codebase works,
// since deleting your own auth identity isn't something the anon/
// authenticated roles can ever be granted. Existing FK `on delete cascade`
// chains from profiles/listings/offers/etc. back to auth.users handle the
// data cascade already; this action is just the confirmed, authenticated
// entry point. The service-role key is read from a non-NEXT_PUBLIC_ env var
// inside a 'use server' function, so it's never bundled to the client.
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Session expired. Sign in again.' }
  }

  const admin = createAdminClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  )

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    return { error: 'Could not delete your account. Try again or contact support.' }
  }

  // Best-effort — the account is already gone at this point, which is the
  // security-critical outcome. Clears the now-orphaned session cookies.
  await supabase.auth.signOut()

  redirect('/login')
}
