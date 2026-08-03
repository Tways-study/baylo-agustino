// e2e/deal-room-cancellation.spec.ts
import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureAcceptedOffer } from './helpers/fixtures'

const OWNER_EMAIL = 'e2e-fixture@usa.edu.ph'
const OFFERER_EMAIL = 'e2e-fixture-2@usa.edu.ph'
const THIRD_PARTY_EMAIL = 'e2e-fixture-3@usa.edu.ph'

test('cancelling an accepted deal reverts the listing and shows the cancelled stamp', async ({
  browser,
}) => {
  const { listingCode, offerId } = await createFixtureAcceptedOffer({
    ownerEmail: OWNER_EMAIL,
    offererEmail: OFFERER_EMAIL,
    listingTitle: 'E2E Cancellation Fixture',
  })

  const context = await browser.newContext()
  const page = await context.newPage()
  await signInAsFixtureUser(page, OFFERER_EMAIL)

  await page.goto(`/deals/${offerId}`)
  await page.getByRole('button', { name: 'Cancel this deal' }).click()
  await page.getByRole('button', { name: 'Changed my mind' }).click()
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === 'POST' && res.url() === page.url()),
    page.getByRole('button', { name: 'Confirm cancellation' }).click(),
  ])

  await page.reload()
  await expect(page.getByText('Cancelled')).toBeVisible()

  await page.goto(`/l/${listingCode}`)
  await expect(page.getByText('RESERVED', { exact: false })).not.toBeVisible()
})

test('a third party cannot open a deal room they are not party to', async ({ browser }) => {
  const { offerId } = await createFixtureAcceptedOffer({
    ownerEmail: OWNER_EMAIL,
    offererEmail: OFFERER_EMAIL,
    listingTitle: 'E2E Third Party Fixture',
  })

  const context = await browser.newContext()
  const page = await context.newPage()
  await signInAsFixtureUser(page, THIRD_PARTY_EMAIL)

  const response = await page.goto(`/deals/${offerId}`)
  expect(response?.status()).toBe(404)
})
