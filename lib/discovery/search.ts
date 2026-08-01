/**
 * Builds a Postgres tsquery prefix-match string from raw user input, safe
 * to pass straight to supabase-js's `.textSearch()`. Each token becomes a
 * prefix match (`token:*`), ANDed together. Returns '' for input with no
 * usable tokens — callers should skip the search filter entirely in that
 * case rather than pass an empty tsquery.
 */
export function buildPrefixTsQuery(input: string): string {
  const sanitized = input.replace(/[^\p{L}\p{N}\s]/gu, ' ')
  const tokens = sanitized.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return ''
  return tokens.map((t) => `${t}:*`).join(' & ')
}
