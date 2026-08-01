import { createClient } from '@supabase/supabase-js'

interface CreateFixtureListingOptions {
  title?: string
  intent?: 'swap' | 'sale' | 'give'
}

/**
 * Creates a listing directly via create_listing(), signed in as the seed
 * fixture user (supabase/seed.sql — email e2e-fixture@usa.edu.ph, password
 * 'not-a-real-password', both already checked into the repo as local-dev-
 * only fixtures). Bypasses the UI post flow entirely — this is test setup,
 * not the thing under test.
 */
export async function createFixtureListing(
  overrides: CreateFixtureListingOptions = {},
): Promise<{ id: string; code: string }> {
  const client = createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  )
  const { error: authError } = await client.auth.signInWithPassword({
    email: 'e2e-fixture@usa.edu.ph',
    password: 'not-a-real-password',
  })
  if (authError) throw new Error(`Could not sign in fixture user for setup: ${authError.message}`)

  const { data: categories } = await client.from('categories').select('id').limit(1)
  const { data: spots } = await client.from('meetup_spots').select('id').limit(1)
  const intent = overrides.intent ?? 'give'

  const { data, error } = await client.rpc('create_listing', {
    p_id: crypto.randomUUID(),
    p_intent: intent,
    p_title: overrides.title ?? 'Fixture listing',
    p_description: null,
    p_category_id: categories?.[0]?.id ?? null,
    p_condition: 'good',
    p_ask_centavos: intent === 'sale' ? 10000 : null,
    p_accepts_cash: false,
    p_meetup_spot_id: spots?.[0]?.id ?? null,
    p_wants: intent === 'swap' ? ['Anything useful'] : null,
    p_image_paths: null,
  })
  if (error || !data?.[0]) throw new Error(`Could not create fixture listing: ${error?.message}`)
  return data[0]
}
