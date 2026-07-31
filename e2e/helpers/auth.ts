import { createClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'

/**
 * Real Playwright runs can't wait on an inbox OTP round trip. Mints a magic
 * link for the fixture user (see supabase/seed.sql) via the service-role
 * admin API, then navigates the real browser through it so genuine Supabase
 * auth cookies get set exactly as they would for a real user — never
 * hand-craft cookies here, that silently drifts from the real auth flow.
 */
export async function signInAsFixtureUser(page: Page, email: string) {
  const admin = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  )
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data) {
    throw new Error(`Could not mint a session for ${email}: ${error?.message}`)
  }
  await page.goto(data.properties.action_link)
}
