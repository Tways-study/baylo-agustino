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

  // The save toggle flips its optimistic UI state synchronously on click,
  // before the Server Action resolves — waiting for that visual change
  // (or for page.waitForLoadState('networkidle'), which is already
  // latched by the goto('/') above and won't re-arm for a later
  // non-navigating fetch) would prove nothing about whether the DB write
  // actually landed. Wait for the actual POST the Server Action makes
  // instead — Next.js Server Actions post back to the current page's own
  // URL — set up the waiter before the click so it can't miss the
  // response firing between attaching and requesting.
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === 'POST' && res.url() === page.url()),
    saveButton.click(),
  ])

  // /ako is a Server Component that fetches saved listings once at
  // request time, so this navigation must happen after the write above
  // is confirmed complete, not just after the click event fires.
  await page.goto('/ako')
  await expect(page.getByText(title)).toBeVisible()
})
