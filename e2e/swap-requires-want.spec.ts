import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'

test('a swap listing cannot be submitted without at least one want', async ({ page }) => {
  await signInAsFixtureUser(page, 'e2e-fixture@usa.edu.ph')
  await page.goto('/post')
  await page.getByRole('button', { name: 'Swap' }).click()
  await page.getByRole('button', { name: 'Next' }).click() // skip photos

  await page.getByLabel('Title').fill('E2E swap-without-want test')
  await page.getByLabel('Category').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Good' }).click()
  await page.getByLabel('Meetup spot').selectOption({ index: 1 })

  const submit = page.getByRole('button', { name: 'Post it' })
  await expect(submit).toBeDisabled()

  await page.getByLabel('What would you take for it?').fill('Any GE book')
  await expect(submit).toBeEnabled()
})
