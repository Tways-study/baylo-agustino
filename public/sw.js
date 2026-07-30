// Baylo Agustino Service Worker
// Strategy: network-first for /api/*, cache-first for static assets

const CACHE_VERSION = 'v1'
const STATIC_CACHE = `baylo-static-${CACHE_VERSION}`
const API_CACHE = `baylo-api-${CACHE_VERSION}`

const STATIC_PATTERNS = [/\/_next\/static\//, /\/icons\//, /\/manifest\.json$/]

const API_PATTERNS = [/\/api\//]

self.addEventListener('install', (_event) => {
  // Skip waiting so the new SW activates immediately
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Clean up old caches
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return

  const isStatic = STATIC_PATTERNS.some((p) => p.test(url.pathname))
  const isApi = API_PATTERNS.some((p) => p.test(url.pathname))

  if (isStatic) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
  } else if (isApi) {
    event.respondWith(networkFirst(request, API_CACHE))
  }
  // All other requests: browser default (no SW interception)
})

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Offline', { status: 503 })
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)

  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
