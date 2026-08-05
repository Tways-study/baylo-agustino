import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureListing } from './helpers/fixtures'

test('Feed shows a chit within 2.5s on 3G', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP network emulation is Chromium-only')

  await createFixtureListing({ title: 'TTI fixture listing' })
  await signInAsFixtureUser(page, 'e2e-fixture@usa.edu.ph')

  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  })

  const start = Date.now()
  await page.goto('/')
  await expect(page.locator('article').first()).toBeVisible({ timeout: 2_500 })
  expect(Date.now() - start).toBeLessThan(2_500)
})
