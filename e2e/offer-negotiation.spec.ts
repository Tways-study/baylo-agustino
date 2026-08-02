import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureListing } from './helpers/fixtures'

const OWNER_EMAIL = 'e2e-fixture@usa.edu.ph'
const OFFERER_EMAIL = 'e2e-fixture-2@usa.edu.ph'

test('offer → counter → counter → accept produces a reserved listing', async ({ browser }) => {
  const listing = await createFixtureListing({
    ownerEmail: OWNER_EMAIL,
    intent: 'swap',
    title: 'E2E Negotiation Calculator',
    estimatedValueCentavos: 60000,
  })

  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  await signInAsFixtureUser(ownerPage, OWNER_EMAIL)

  const offererContext = await browser.newContext()
  const offererPage = await offererContext.newPage()
  await signInAsFixtureUser(offererPage, OFFERER_EMAIL)

  // Offerer sends the initial offer (cash-only, no items required).
  await offererPage.goto(`/l/${listing.code}/offer`)
  await offererPage.getByPlaceholder('0').fill('500')
  await Promise.all([
    offererPage.waitForURL(/\/deals\/[0-9a-f-]+/),
    offererPage.getByRole('button', { name: 'Send offer' }).click(),
  ])
  const offerUrl = offererPage.url()

  // Owner sees it under Received, opens it, counters.
  await ownerPage.goto('/deals')
  await ownerPage.getByRole('button', { name: 'Received' }).click()
  await expect(ownerPage.getByText('E2E Negotiation Calculator')).toBeVisible()
  await ownerPage.getByText('E2E Negotiation Calculator').click()
  await ownerPage.getByRole('button', { name: 'Counter' }).click()
  await ownerPage.getByLabel('Cash (₱)').fill('700')
  await ownerPage.getByRole('button', { name: 'Send counter' }).click()
  await expect(ownerPage.getByText('· countered')).toBeVisible()

  // Offerer counters back.
  await offererPage.goto(offerUrl)
  await offererPage.reload()
  await offererPage.getByRole('button', { name: 'Counter' }).click()
  await offererPage.getByLabel('Cash (₱)').fill('650')
  await offererPage.getByRole('button', { name: 'Send counter' }).click()

  // Owner accepts the final terms.
  await ownerPage.goto('/deals')
  await ownerPage.getByRole('button', { name: 'Received' }).click()
  await ownerPage.getByText('E2E Negotiation Calculator').click()
  await Promise.all([
    ownerPage.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url() === ownerPage.url(),
    ),
    ownerPage.getByRole('button', { name: 'Accept' }).click(),
  ])

  // Listing is now reserved.
  await ownerPage.goto(`/l/${listing.code}`)
  await expect(ownerPage.getByText('RESERVED', { exact: false })).toBeVisible()
})
