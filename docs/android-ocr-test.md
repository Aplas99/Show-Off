# Android OCR release test

The TCG scanner has two capture paths:

- The shutter reads text on the device with ML Kit, then searches the card catalog. Curators can enable **Enhanced scan** to try server OCR after an unsuccessful match.
- **InstaScan** is visible to Curators in the Pokémon TCG scanner. It sends the prepared card crop to the server OCR path immediately, then searches the same catalog. The button is an explicit choice to upload that crop.

Both paths require an installed native Android build. Expo Go cannot load the ML Kit module.

## Backend setup

1. Set up the production Supabase project and apply the membership and catalog migrations used by this app. Deploy `catalog-proxy` and `ocr-fallback` to that project. Keep JWT verification enabled for `ocr-fallback`.
2. Deploy `server/paddleocr` to an HTTPS Railway service. Set `OCR_SERVICE_TOKEN` there.
3. Set `OCR_SERVICE_URL` (the HTTPS base URL) and the same `OCR_SERVICE_TOKEN` as Supabase Edge Function secrets. Do not place either value in `EXPO_PUBLIC_*` variables.
4. Sign in with a Curator account to see the direct enhanced OCR button. A Collector can test on-device ML Kit OCR with the shutter, subject to the daily scan quota.

See [the OCR service setup](../server/paddleocr/README.md) and [catalog proxy setup](catalog-proxy.md) for backend details.

## Build an installable release-style APK

The `productionTest` EAS profile uses the production environment and makes an internally distributed APK. The `production` profile makes a store AAB, which is not directly installable.

1. In EAS, set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_ANON_KEY` for the **production** environment to the same Supabase project. Set `EXPO_PUBLIC_ADS_ENABLED=false` unless real ads have been configured. These public values are embedded in the app.
2. Run `npm install`, then `npx eas-cli login` and `npx eas-cli init` if the project is not yet linked to an Expo project. Complete Android signing setup when prompted.
3. Run `npx eas-cli build --platform android --profile productionTest`. Install the resulting APK from the EAS build page on a physical Android device. If an installed app with package `com.zed99.showoff` has a different signing key, uninstall it before installing this APK.

For a local native development test, `npm run android -- --device` also includes ML Kit, but it is not a release build. The EAS APK needs no Metro server.

## Device check

Open Create → TCG → Pokémon, choose a showcase, and grant camera access. Scan a sharp, centered card with the shutter, then with **InstaScan**. Confirm the identified card and collector number, review the queue, and save it. Try a card that cannot be matched to check the error and manual search path. If enhanced OCR is unavailable, check the Curator membership, Edge Function deployment and secrets, Railway health, and device connectivity.
