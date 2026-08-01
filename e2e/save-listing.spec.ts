import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createFixtureListing } from './helpers/fixtures'

test('saving a listing shows it in Bantayan', async ({ page }) => {
  const title = 'Save toggle test item'
  await createFixtureListing({ title })
  await signInAsFixtureUser(page, 'e2e-fixture@usa.edu.ph')

  await page.goto('/')

  // .first() on a bare "Save this listing" query would grab whatever
  // listing sorts first in the feed, not necessarily this one — other
  // specs create their own fixture listings and Playwright parallelizes
  // across spec files by default even with fullyParallel: false (which
  // only serializes within one file). Scope to this listing's own card:
  // its <article> is wrapped in a Link, and the save button is that
  // Link's sibling under one shared per-card <div> (see FeedList.tsx) —
  // walk up from the article to that specific wrapper, not to any div.
  const card = page.locator('article').filter({ hasText: title })
  const cardWrapper = card.locator('xpath=ancestor::div[1]')
  const saveButton = cardWrapper.locator('button')
  await saveButton.click()

  // The save toggle flips its optimistic UI state synchronously on click,
  // before the Server Action resolves — waiting for that visual change
  // would prove nothing about whether the DB write actually landed.
  // /ako is a Server Component that fetches saved listings once at
  // request time, so navigating before the write completes would render
  // a stale, pre-save snapshot with no client-side retry to save us.
  await page.waitForLoadState('networkidle')

  await page.goto('/ako')
  await expect(page.getByText(title)).toBeVisible()
})
