import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/onboarding', '/suspended', '/legal']

// script-src and style-src both keep 'unsafe-inline' — not a default, a
// verified-necessary trade-off. A nonce-based script-src was tried first
// (the pattern Next's docs describe for the App Router), but a real
// production build showed Next's own RSC-streaming inline scripts
// (`<script>self.__next_f.push(...)</script>`, used on every page for
// hydration) ship with no `nonce` attribute in this Next.js version — a
// strict nonce policy silently breaks hydration everywhere. Confirmed by
// inspecting an actual `next build && next start` response, not assumed.
// style-src needs 'unsafe-inline' for a different, unrelated reason: React's
// style={{...}} prop (used pervasively — Button, Sheet, every page) compiles
// to a real inline `style` HTML attribute, which CSP's style-src governs the
// same as a literal style="" attribute.
function buildCsp() {
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : ''
  const supabaseWsOrigin = supabaseOrigin.replace(/^http/, 'ws')

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${supabaseOrigin}`,
    `connect-src 'self' ${supabaseOrigin} ${supabaseWsOrigin}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

const CSP = buildCsp()

function withSecurityHeaders(response: NextResponse) {
  response.headers.set('Content-Security-Policy', CSP)
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()')
  return response
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // No session: send to /login (unless already there)
  if (!user) {
    if (isPublicPath) return withSecurityHeaders(response)
    return withSecurityHeaders(NextResponse.redirect(new URL('/login', request.url)))
  }

  // Has session but on /login: check if already onboarded
  if (pathname.startsWith('/login')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('verified_at, is_suspended')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.verified_at && !profile.is_suspended) {
      return withSecurityHeaders(NextResponse.redirect(new URL('/', request.url)))
    }
    return withSecurityHeaders(response)
  }

  // On /onboarding, /suspended, or /legal: let through (middleware doesn't loop)
  if (isPublicPath) return withSecurityHeaders(response)

  // Protected route: verify profile status
  const { data: profile } = await supabase
    .from('profiles')
    .select('verified_at, is_suspended')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !profile.verified_at) {
    return withSecurityHeaders(NextResponse.redirect(new URL('/onboarding', request.url)))
  }

  if (profile.is_suspended) {
    return withSecurityHeaders(NextResponse.redirect(new URL('/suspended', request.url)))
  }

  return withSecurityHeaders(response)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|icons/).*)'],
}
