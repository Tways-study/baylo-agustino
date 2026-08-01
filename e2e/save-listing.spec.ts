import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureListing } from './helpers/fixtures'

test('saving a listing shows it in Bantayan', async ({ page }) => {
  await createFixtureListing({ title: 'Save toggle test item' })
  await signInAsFixtureUser(page, 'e2e-fixture@usa.edu.ph')

  await page.goto('/')
  await page.getByLabel('Save this listing').first().click()

  await page.goto('/ako')
  await expect(page.getByText('Save toggle test item')).toBeVisible()
})
