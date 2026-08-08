// e2e/happy-path.spec.ts
// Stitches the build-spec's named critical journey — sign up → post → offer
// → counter → complete — into one spec, on top of the existing per-feature
// specs (post-flow, offer-negotiation, deal-room) that already cover each
// piece individually. A brand-new poster identity has zero prior listings,
// so it can't collide with the existing fixture owner's accumulating 10/day
// listing cap across the rest of this serial E2E run (CLAUDE.md notes
// listing creation touches shared rate-limit state) — using a fresh user
// here actually avoids that problem rather than adding to it.
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import { signUpNewUser, signInAsFixtureUser } from './helpers/auth'

const POSTER_EMAIL = `e2e-happy-${Date.now()}@usa.edu.ph`
const OFFERER_EMAIL = 'e2e-fixture-2@usa.edu.ph'
const LISTING_TITLE = 'E2E Happy Path Calculator'

// Drives the 6-step onboarding wizard (app/(auth)/onboarding/page.tsx) to
// completion, skipping every optional step (program, year, avatar) to keep
// the journey focused on proving the path works end to end, not on
// exercising each optional field — those aren't this spec's job.
async function completeOnboardingWizard(page: Page, displayName: string) {
  await page.getByLabel('What should we call you?').fill(displayName)
  await page.getByRole('button', { name: 'Next' }).click()

  await page.getByRole('button', { name: 'Skip' }).click() // program
  await page.getByRole('button', { name: 'Skip' }).click() // year level
  await page.getByRole('button', { name: 'Skip' }).click() // avatar

  await page.getByLabel('Create a password').fill('e2e-happy-path-pw')
  await page.getByPlaceholder('Confirm password').fill('e2e-happy-path-pw')
  await page.getByRole('button', { name: 'Next' }).click()

  await page.getByLabel("I've read these and I'm in.").check()
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/onboarding', { timeout: 15_000 }),
    page.getByRole('button', { name: 'Enter the floor' }).click(),
  ])
}

test('sign up → post → offer → counter → complete', async ({ browser }) => {
  const posterContext = await browser.newContext()
  const posterPage = await posterContext.newPage()

  // ═══ Sign up (real onboarding UI, not a fixture sign-in) ═══
  await signUpNewUser(posterPage, POSTER_EMAIL)
  await completeOnboardingWizard(posterPage, 'E2E Happy Poster')

  // ═══ Post a listing through the real /post UI ═══
  await posterPage.goto('/post')
  await posterPage.getByRole('button', { name: 'Swap' }).click()
  await posterPage.getByRole('button', { name: 'Next' }).click() // skip photos — optional
  await posterPage.getByLabel('Title').fill(LISTING_TITLE)
  await posterPage.getByLabel('Category').selectOption({ index: 1 })
  await posterPage.getByRole('button', { name: 'Good' }).click()
  await posterPage.getByLabel('Meetup spot').selectOption({ index: 1 })
  await posterPage.getByLabel('What would you take for it?').fill('Any GE book')
  await posterPage.getByRole('button', { name: 'Post it' }).click()
  await posterPage.waitForURL(/\/l\/BA-\d{4}/, { timeout: 20_000 })
  const listingCode = posterPage.url().match(/\/l\/(BA-\d{4})/)?.[1]
  if (!listingCode) throw new Error('Could not read the posted listing code from the URL.')

  // ═══ Offerer signs in (already-onboarded fixture — no need to re-run signup) ═══
  const offererContext = await browser.newContext()
  const offererPage = await offererContext.newPage()
  await signInAsFixtureUser(offererPage, OFFERER_EMAIL)

  // ═══ Offer → counter → counter → accept (mirrors offer-negotiation.spec.ts) ═══
  await offererPage.goto(`/l/${listingCode}/offer`)
  await offererPage.getByPlaceholder('0').fill('500')
  await Promise.all([
    offererPage.waitForURL(/\/deals\/[0-9a-f-]+/),
    offererPage.getByRole('button', { name: 'Send offer' }).click(),
  ])
  const offerUrl = offererPage.url()
  const offerId = new URL(offerUrl).pathname.split('/').pop()
  if (!offerId) throw new Error('Could not read the offer id from the URL.')

  await posterPage.goto('/deals')
  await posterPage.getByRole('button', { name: 'Received' }).click()
  await expect(posterPage.getByText(LISTING_TITLE)).toBeVisible()
  await posterPage.getByText(LISTING_TITLE).click()
  await posterPage.getByRole('button', { name: 'Counter' }).click()
  await posterPage.getByLabel('Cash (₱)').fill('700')
  await posterPage.getByRole('button', { name: 'Send counter' }).click()
  await expect(posterPage.getByText('· countered')).toBeVisible()

  await offererPage.goto(offerUrl)
  await offererPage.reload()
  await offererPage.getByRole('button', { name: 'Counter' }).click()
  await offererPage.getByLabel('Cash (₱)').fill('650')
  await offererPage.getByRole('button', { name: 'Send counter' }).click()

  await posterPage.goto('/deals')
  await posterPage.getByRole('button', { name: 'Received' }).click()
  await posterPage.getByText(LISTING_TITLE).click()
  await Promise.all([
    posterPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === posterPage.url(),
    ),
    posterPage.getByRole('button', { name: 'Accept' }).click(),
  ])

  // ═══ Deal room: propose meetup, confirm, chat live, both mark swapped ═══
  // (mirrors deal-room.spec.ts)
  await offererPage.goto(`/deals/${offerId}`)
  await offererPage.getByLabel('Meetup spot').selectOption({ index: 0 })
  await offererPage.getByLabel('When').fill('2030-01-15T10:30')
  await Promise.all([
    offererPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === offererPage.url(),
    ),
    offererPage.getByRole('button', { name: 'Propose' }).click(),
  ])
  await offererPage.reload()
  await expect(offererPage.getByText('Waiting for the other side')).toBeVisible()

  await posterPage.goto(`/deals/${offerId}`)
  await Promise.all([
    posterPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === posterPage.url(),
    ),
    posterPage.getByRole('button', { name: 'Confirm' }).click(),
  ])
  await posterPage.reload()
  await expect(posterPage.getByText('Add to calendar')).toBeVisible()

  // Live chat delivery — proves Realtime works end to end, not just that
  // the deal room renders.
  await posterPage.getByPlaceholder('Write a message…').fill('Sige, see you there!')
  await posterPage.getByRole('button', { name: 'Send' }).click()
  await expect(offererPage.getByText('Sige, see you there!')).toBeVisible({ timeout: 5000 })

  await offererPage.reload()
  await Promise.all([
    offererPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === offererPage.url(),
    ),
    offererPage.getByRole('button', { name: 'Mark as swapped' }).click(),
  ])
  await posterPage.reload()
  await Promise.all([
    posterPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === posterPage.url(),
    ),
    posterPage.getByRole('button', { name: 'Mark as swapped' }).click(),
  ])

  // ═══ Assert completion at the DB level, not just via UI text ═══
  // Same rationale as deal-room.spec.ts: the stepper always renders
  // "Swapped" once a deal is accepted, well before either mark_swapped call
  // — relying on that text alone would still pass even if the completion
  // trigger never fired. RLS restricts offers/listings visibility to
  // parties, so query as the poster rather than an anonymous client.
  const checkClient = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  )
  const { error: checkAuthError } = await checkClient.auth.signInWithPassword({
    email: POSTER_EMAIL,
    password: 'e2e-happy-path-pw',
  })
  if (checkAuthError) {
    throw new Error(`Could not sign in poster for completion check: ${checkAuthError.message}`)
  }

  const { data: finalOffer, error: finalOfferError } = await checkClient
    .from('offers')
    .select('status')
    .eq('id', offerId)
    .single()
  if (finalOfferError)
    throw new Error(`Could not read final offer status: ${finalOfferError.message}`)
  expect(finalOffer?.status).toBe('completed')

  const { data: finalListing, error: finalListingError } = await checkClient
    .from('listings')
    .select('status')
    .eq('code', listingCode)
    .single()
  if (finalListingError) {
    throw new Error(`Could not read final listing status: ${finalListingError.message}`)
  }
  expect(finalListing?.status).toBe('completed')

  await posterPage.reload()
  await expect(posterPage.getByText('Swapped')).toBeVisible()
})
