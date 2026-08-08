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
  // Mirror playwright.config.ts's own baseURL derivation so this helper
  // targets wherever Playwright is actually pointed (CI, a different port,
  // a staging preview) instead of always assuming localhost:3000.
  const baseURL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000'
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    // Admin-generated links carry the session as an implicit-flow hash
    // fragment (#access_token=...&refresh_token=...) on redirect — there's
    // no PKCE code_verifier for an admin-side call to hold. The app's real
    // login UI (/login) is the one route that reads that hash and converts
    // it into a real session; redirecting to '/' would hit middleware's
    // unauthenticated redirect first and lose the fragment before any
    // client code runs.
    options: { redirectTo: `${baseURL}/login` },
  })
  if (error || !data) {
    throw new Error(`Could not mint a session for ${email}: ${error?.message}`)
  }
  await page.goto(data.properties.action_link)
  // page.goto() only resolves once /login's initial load finishes — the
  // hash-token pickup that establishes the real session (app/(auth)/login/
  // page.tsx) runs after that, in a post-mount effect that awaits
  // supabase.auth.setSession() before hard-navigating away from /login.
  // Wait for that navigation so callers get a real, authenticated session
  // instead of racing ahead of it.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 })
}

/**
 * Same admin-generateLink mechanics as signInAsFixtureUser, but for a
 * brand-new, never-before-seen email — this is a real signup, not a sign-in.
 * admin.generateLink() auto-provisions the auth.users row, and since a fresh
 * identity has no profiles row (or one with verified_at still null),
 * middleware.ts routes it to /onboarding once the session lands. That's a
 * genuine extra hop an already-onboarded fixture user never takes (they land
 * straight on '/'), so this waits for /onboarding specifically rather than
 * reusing signInAsFixtureUser's generic "left /login" predicate, which could
 * resolve prematurely on the transient '/' this flow passes through first.
 */
export async function signUpNewUser(page: Page, email: string) {
  const admin = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  )
  const baseURL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000'
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${baseURL}/login` },
  })
  if (error || !data) {
    throw new Error(`Could not mint a signup session for ${email}: ${error?.message}`)
  }
  await page.goto(data.properties.action_link)
  await page.waitForURL((url) => url.pathname === '/onboarding', { timeout: 15_000 })
}
