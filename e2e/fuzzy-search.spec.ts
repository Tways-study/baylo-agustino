import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureListing } from './helpers/fixtures'

test('searching calcu, casio, and calculator all surface the same listing', async ({ page }) => {
  await createFixtureListing({ title: 'Casio fx-991EX Scientific Calculator' })
  await signInAsFixtureUser(page, 'e2e-fixture@usa.edu.ph')

  for (const term of ['calcu', 'casio', 'calculator']) {
    await page.goto('/')
    await page.getByLabel('Search listings').fill(term)
    await page.waitForURL(new RegExp(`[?&]q=${term}`))
    await expect(page.getByText('Casio fx-991EX Scientific Calculator')).toBeVisible({
      timeout: 10_000,
    })
  }
})
