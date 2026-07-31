import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'

test('an exam-key listing is blocked with a readable, named-rule explanation', async ({ page }) => {
  await signInAsFixtureUser(page, 'e2e-fixture@usa.edu.ph')
  await page.goto('/post')
  await page.getByRole('button', { name: 'Give' }).click()
  await page.getByRole('button', { name: 'Next' }).click() // skip photos

  await page.getByLabel('Title').fill('Selling the answer key to the midterm')

  await expect(page.getByText('Academic integrity')).toBeVisible()
  await expect(
    page.getByText("Exam papers, answer keys, and completed academic work aren't allowed"),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Blocked' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Post it' })).not.toBeVisible()
  await expect(page.getByRole('link', { name: 'Appeal this' })).toHaveAttribute(
    'href',
    'mailto:baylo.agustino@usa.edu.ph',
  )
})
