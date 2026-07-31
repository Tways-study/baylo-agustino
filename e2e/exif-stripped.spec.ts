import { test, expect } from '@playwright/test'
import { signInAsFixtureUser } from './helpers/auth'
import { createClient } from '@supabase/supabase-js'

test('uploaded listing photo carries no EXIF', async ({ page }) => {
  await signInAsFixtureUser(page, 'e2e-fixture@usa.edu.ph')
  await page.goto('/post')
  await page.getByRole('button', { name: 'Give' }).click()
  await page.setInputFiles('input[type="file"]', 'e2e/fixtures/photo-with-gps-exif.jpg')
  await expect(page.getByText('Photo saved.')).toBeVisible({ timeout: 20_000 })

  // PostSheet stashes the last uploaded Storage path on window ONLY when
  // NODE_ENV !== 'production' — an explicit, gated test seam, not leftover
  // debug code.
  const storagePath: string = await page.evaluate(
    () => (window as unknown as { __lastUploadedPathForTest?: string }).__lastUploadedPathForTest!,
  )
  expect(storagePath).toBeTruthy()

  const supabase = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  )
  const { data } = await supabase.storage.from('listing-images').download(storagePath)
  const bytes = new Uint8Array(await data!.arrayBuffer())
  const asString = Buffer.from(bytes).toString('latin1')

  expect(asString).not.toContain('Exif')
})
