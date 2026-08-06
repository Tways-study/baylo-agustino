-- Expose a safe user-existence check for the login flow.
-- Returning users see a password field; new users see OTP.
-- SECURITY DEFINER allows anon to peek at auth.users, but only the
-- minimal signal (email exists AND onboarding complete) is exposed.
-- The verified_at IS NOT NULL guard prevents surfacing unfinished signups.

CREATE OR REPLACE FUNCTION public.user_is_registered(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE u.email = p_email
    AND p.verified_at IS NOT NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_is_registered(text) TO anon;
