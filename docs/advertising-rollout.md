# Advertising and remote processing

Advertising defaults off (`EXPO_PUBLIC_ADS_ENABLED=false`). Web builds never
load the native ads UI/module. Do not enable real units until the consent setup
and observed release-build traffic match the privacy declarations.

Implemented safeguards:

- Unknown age/membership, failed queries, minors, and paid accounts cannot
  initialize ads or issue requests. Eligibility is checked before and after
  consent; identity changes invalidate pending preparation.
- Eligible adults use Google UMP before SDK initialization. Failure or inability
  to request ads leaves the app usable without ads. Settings exposes privacy
  options; existing banners are removed while choices change.
- Requests explicitly use non-personalized ads with PG maximum content rating.
  No profile age, username, email, or interest targeting is sent to AdMob.
- `app.config.ts` delays native app measurement initialization and blocks the
  Android advertising-ID permission. No ATT request is made in app code. NPA
  alone is not proof of non-tracking: verify the built SDK configuration and
  network behavior before enabling ads, and configure any required permission
  before introducing tracking.
- Rewarded ads have duplicate-tap protection, bounded waits, failure handling,
  listener cleanup, and account/unmount cancellation. Unavailable controls are
  labelled. Core collecting does not require consent or viewing an ad.
- Enhanced OCR is opt-in for Curators after a failed on-device scan. The app
  sends the cropped image through an authenticated Supabase function to Railway;
  the shared OCR token stays on those servers. Legacy public OCR variables are
  ignored. Rotate any previously exposed service tokens.

Google's September 2026 documentation deprecates TFUA/TFCD in favor of TFAT.
The installed library's configuration API lacks that new signal. This release
therefore withholds all ads from minors; adding minor ads requires an SDK update
and review of the supported age-treatment API, not just an NPA flag.

Before enabling advertising:

1. Configure real AdMob app IDs and units, UMP US privacy messages and applicable
   consent messages. Do not enable an IDFA/ATT flow inconsistent with the app.
2. Test first launch, consent denial, privacy changes, paid/free transitions,
   adult-to-teen account switching, offline failures, and reinstall on devices.
3. Verify manifests and actual traffic. Once an SDK has initialized in a process,
   it cannot be uninitialized; account changes stop further app ad requests but
   require observation for any SDK background activity.
4. Audit rewarded-bonus server verification before enabling real rewarded units;
   the existing client bonus RPC is not proof that an ad was watched.
5. Confirm App Privacy/Data safety declarations against observed providers.

References:
- [Google age-treatment guidance](https://support.google.com/admob/answer/6219315)
- [Installed library consent workflow](https://docs.page/invertase/react-native-google-mobile-ads/european-user-consent)
