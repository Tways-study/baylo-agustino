'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  sendOtpSchema,
  verifyOtpSchema,
  onboardingSchema,
  signInWithPasswordSchema,
} from '@/lib/auth/schemas'

export async function sendOtp(
  _prev: { error?: string; isReturning?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; isReturning?: boolean }> {
  const raw = { email: formData.get('email') }
  const result = sendOtpSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Invalid email.' }
  }

  const supabase = await createClient()

  // Returning users log in with a password — skip OTP for them.
  const { data: isReturning } = await supabase.rpc('user_is_registered', {
    p_email: result.data.email,
  })
  if (isReturning) {
    return { isReturning: true }
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: result.data.email,
    options: { shouldCreateUser: true },
  })

  if (error) {
    if (error.message.toLowerCase().includes('domain')) {
      return {
        error: `Only @${process.env['ALLOWED_EMAIL_DOMAIN'] ?? 'usa.edu.ph'} addresses can join.`,
      }
    }
    return { error: 'Could not send the code. Try again in a moment.' }
  }

  return {}
}

export async function verifyOtp(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const raw = {
    email: formData.get('email'),
    token: formData.get('token'),
  }
  const result = verifyOtpSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Invalid code.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    email: result.data.email,
    token: result.data.token,
    type: 'email',
  })

  if (error) {
    return { error: 'Wrong code or it has expired. Try resending.' }
  }

  // Middleware will redirect based on profile state; revalidate the path.
  redirect('/')
}

export async function signInWithPassword(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
  }
  const result = signInWithPasswordSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check your entries.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: result.data.email,
    password: result.data.password,
  })

  if (error) {
    return { error: 'Wrong password. Try again or use "Forgot password".' }
  }

  redirect('/')
}

export async function sendPasswordReset(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const raw = { email: formData.get('email') }
  const result = sendOtpSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Invalid email.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(result.data.email, {
    redirectTo: `${process.env['NEXT_PUBLIC_APP_URL']}/api/auth/callback?next=/reset-password`,
  })

  if (error) {
    return { error: 'Could not send the reset link. Try again.' }
  }

  return {}
}

export async function completeOnboarding(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const raw = {
    displayName: formData.get('displayName'),
    program: formData.get('program') || undefined,
    yearLevel: formData.get('yearLevel') || undefined,
    avatarUrl: formData.get('avatarUrl') || undefined,
    password: formData.get('password'),
  }
  const result = onboardingSchema.safeParse(raw)
  if (!result.success) {
    return { error: result.error.errors[0]?.message ?? 'Check your entries.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Session expired. Sign in again.' }

  // Replay attack guard: if already onboarded, skip.
  const { data: existing } = await supabase
    .from('profiles')
    .select('verified_at')
    .eq('id', user.id)
    .maybeSingle()

  if (existing?.verified_at) {
    redirect('/')
  }

  // Set the password before marking the account verified. If this fails, the
  // user stays on onboarding and can try again — no partial state is written.
  const { error: passwordError } = await supabase.auth.updateUser({
    password: result.data.password,
  })

  if (passwordError) {
    return { error: 'Could not set your password. Try a different one.' }
  }

  // Upsert profile with verified_at using service-role access via RPC,
  // because the authenticated role cannot write verified_at directly.
  // The function uses auth.uid() internally — do NOT pass p_user_id.
  const { error: profileError } = await supabase.rpc('complete_onboarding', {
    p_display_name: result.data.displayName,
    p_program: result.data.program ?? null,
    p_year_level: result.data.yearLevel ?? null,
    p_avatar_url: result.data.avatarUrl ?? null,
    p_policy_version: 1,
  })

  if (profileError) {
    return { error: 'Could not save your profile. Try again.' }
  }

  redirect('/')
}
