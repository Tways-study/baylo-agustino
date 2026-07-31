import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'

test('a swap listing posts end to end on 3G in under 45s', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'CDP network emulation is Chromium-only')
  await signInAsFixtureUser(page, 'e2e-fixture@usa.edu.ph')

  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8, // Regular 3G ≈ 1.6 Mbps
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  })

  const start = Date.now()
  await page.goto('/post')
  await page.getByRole('button', { name: 'Swap' }).click()
  await page.setInputFiles('input[type="file"]', 'e2e/fixtures/photo-with-gps-exif.jpg')
  await expect(page.getByText('Photo saved.')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Title').fill('E2E test calculator')
  await page.getByLabel('Category').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Good' }).click()
  await page.getByLabel('Meetup spot').selectOption({ index: 1 })
  await page.getByLabel('What would you take for it?').fill('Any GE book')
  await page.getByRole('button', { name: 'Post it' }).click()
  await page.waitForURL(/\/l\/BA-\d{4}/, { timeout: 45_000 })

  expect(Date.now() - start).toBeLessThan(45_000)
})
