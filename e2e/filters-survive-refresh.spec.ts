import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureListing } from './helpers/fixtures'

test('filters survive a refresh and a share', async ({ page, context }) => {
  await createFixtureListing({ title: 'Filter test swap item', intent: 'swap' })
  await signInAsFixtureUser(page, 'e2e-fixture@usa.edu.ph')

  await page.goto('/')
  await page.getByRole('button', { name: 'Swap' }).click()
  await page.waitForURL(/[?&]intent=swap/)
  const filteredUrl = page.url()

  await page.reload()
  expect(page.url()).toContain('intent=swap')
  await expect(page.getByText('Filter test swap item')).toBeVisible()

  const freshPage = await context.newPage()
  await freshPage.goto(filteredUrl)
  await expect(freshPage.getByText('Filter test swap item')).toBeVisible()
  await freshPage.close()
})
