# Authentication rollout

The client now explicitly uses PKCE. Mobile callbacks and web callbacks share
one code exchange, including duplicate warm-start deliveries. A real
`/auth/callback` route handles cold starts. Web redirects use the current
HTTPS origin; local HTTP development is allowed on localhost. Password
recovery also handles web links and validates the recovery link even when
another account is already signed in.

Before testing, allow these exact redirects in Supabase Auth:

- `showoff:///auth/callback`
- `showoff:///reset-password`
- `https://<test-host>/auth/callback`
- `https://<test-host>/reset-password`

Retain legacy two-slash mobile redirects until old emails/clients expire.
Configure the final site URL, production email delivery, confirmation settings,
and provider callback URLs in each provider's dashboard. PKCE email links must
be opened in the browser/device that initiated signup or recovery; the UI
explains this limitation and lets the user request another confirmation.

Apple is available alongside Google and Discord through Supabase's hosted
OAuth flow. Configure the Apple Services ID, redirect domain, signing secret,
and a calendar reminder for secret rotation before enabling public testing.
This does not provision Apple credentials or establish App Review acceptance.
First logins still use the shared username onboarding path.

Local tests cover native/web URL construction, insecure-origin rejection,
missing/provider-error codes, and duplicate code exchange. App TypeScript and
lint pass (existing warnings remain). Test Google/Discord/Apple success,
cancellation, expired links, confirmation resend, recovery while signed in to
another account, and cold/warm app starts on real iOS/Android and the test site.

References: [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow),
[Apple login setup](https://supabase.com/docs/guides/auth/social-login/auth-apple).
