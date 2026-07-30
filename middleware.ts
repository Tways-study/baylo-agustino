import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/onboarding', '/suspended']

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
    if (isPublicPath) return response
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Has session but on /login: check if already onboarded
  if (pathname.startsWith('/login')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('verified_at, is_suspended')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.verified_at && !profile.is_suspended) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return response
  }

  // On /onboarding or /suspended: let through (middleware doesn't loop)
  if (isPublicPath) return response

  // Protected route: verify profile status
  const { data: profile } = await supabase
    .from('profiles')
    .select('verified_at, is_suspended')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !profile.verified_at) {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  if (profile.is_suspended) {
    return NextResponse.redirect(new URL('/suspended', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|icons/).*)'],
}
