// e2e/deal-room.spec.ts
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureAcceptedOffer } from './helpers/fixtures'

const OWNER_EMAIL = 'e2e-fixture@usa.edu.ph'
const OFFERER_EMAIL = 'e2e-fixture-2@usa.edu.ph'

test('accepted deal: propose meetup, confirm, chat live, both mark swapped completes it', async ({
  browser,
}) => {
  const { listingId, listingCode, offerId } = await createFixtureAcceptedOffer({
    ownerEmail: OWNER_EMAIL,
    offererEmail: OFFERER_EMAIL,
    listingTitle: 'E2E Deal Room Fixture',
  })
  void listingCode

  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  await signInAsFixtureUser(ownerPage, OWNER_EMAIL)

  const offererContext = await browser.newContext()
  const offererPage = await offererContext.newPage()
  await signInAsFixtureUser(offererPage, OFFERER_EMAIL)

  // Offerer proposes a meetup.
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

  // Owner confirms it.
  await ownerPage.goto(`/deals/${offerId}`)
  await expect(ownerPage.getByText('E2E Deal Room Fixture', { exact: false })).toBeVisible()
  await Promise.all([
    ownerPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === ownerPage.url(),
    ),
    ownerPage.getByRole('button', { name: 'Confirm' }).click(),
  ])
  await ownerPage.reload()
  await expect(ownerPage.getByText('Add to calendar')).toBeVisible()

  // Owner sends a chat message; the offerer's already-open page sees it
  // arrive live over Realtime, no reload — proves message delivery works
  // end to end, not just that the raw-client script's isolation check passes.
  await ownerPage.getByPlaceholder('Write a message…').fill('Sige, see you there!')
  await ownerPage.getByRole('button', { name: 'Send' }).click()
  await expect(offererPage.getByText('Sige, see you there!')).toBeVisible({ timeout: 5000 })

  // Both mark swapped.
  await offererPage.reload()
  await Promise.all([
    offererPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === offererPage.url(),
    ),
    offererPage.getByRole('button', { name: 'Mark as swapped' }).click(),
  ])
  await ownerPage.reload()
  await Promise.all([
    ownerPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === ownerPage.url(),
    ),
    ownerPage.getByRole('button', { name: 'Mark as swapped' }).click(),
  ])

  // The stepper always renders all four step labels regardless of which one
  // is "now" — "Swapped" is visible on screen the moment the deal is merely
  // accepted, well before either party calls mark_swapped. Relying on that
  // text alone would still pass even if mark_swapped silently failed for
  // both parties, or the completion trigger never fired. Assert completion
  // directly at the DB level instead: offers.status and listings.status
  // must both have flipped to 'completed'. RLS on offers restricts
  // visibility to the two parties, so query as a signed-in fixture user
  // rather than an anonymous client.
  const checkClient = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  )
  const { error: checkAuthError } = await checkClient.auth.signInWithPassword({
    email: OWNER_EMAIL,
    password: 'not-a-real-password',
  })
  if (checkAuthError) {
    throw new Error(
      `Could not sign in fixture user for completion check: ${checkAuthError.message}`,
    )
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
    .eq('id', listingId)
    .single()
  if (finalListingError) {
    throw new Error(`Could not read final listing status: ${finalListingError.message}`)
  }
  expect(finalListing?.status).toBe('completed')

  // Secondary/visual confirmation that the UI reflects it too.
  await ownerPage.reload()
  await expect(ownerPage.getByText('Swapped')).toBeVisible()
})
