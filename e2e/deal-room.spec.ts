// e2e/deal-room.spec.ts
import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureAcceptedOffer } from './helpers/fixtures'

const OWNER_EMAIL = 'e2e-fixture@usa.edu.ph'
const OFFERER_EMAIL = 'e2e-fixture-2@usa.edu.ph'

test('accepted deal: propose meetup, confirm, chat live, both mark swapped completes it', async ({
  browser,
}) => {
  const { listingCode, offerId } = await createFixtureAcceptedOffer({
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

  await ownerPage.reload()
  await expect(ownerPage.getByText('Swapped')).toBeVisible()
})
