import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * listing-images is a private Storage bucket — getPublicUrl does not
 * actually resolve against it. Use signed URLs everywhere a listing image
 * needs to render.
 */
export async function getSignedImageUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.storage
    .from('listing-images')
    .createSignedUrl(path, expiresInSeconds)
  return data?.signedUrl ?? null
}

/** Batched variant — avoids one round trip per image on a listing feed/list page. */
export async function getSignedImageUrls(
  paths: string[],
  expiresInSeconds = 3600,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const supabase = await createClient()
  const { data } = await supabase.storage
    .from('listing-images')
    .createSignedUrls(paths, expiresInSeconds)

  const result: Record<string, string> = {}
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) result[entry.path] = entry.signedUrl
  }
  return result
}
