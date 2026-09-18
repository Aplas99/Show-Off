# TCG scanner integration

Pokémon and Magic use the same [scanner controls](../src/features/create/tcg/TcgScannerTools.tsx).
Curators see **InstaScan** beside Torch. The standard shutter stays on device;
InstaScan sends the game scanner's prepared crop to the shared
[`recognizeTextWithInstaScan`](../api/tcg/enhancedOcr.ts) client. Supabase checks
Curator membership before proxying it to the OCR service.

When adding another TCG game, use `TcgScannerTools` in its camera screen and
pass an `onInstaScan` handler that invokes its game-specific recognition pipeline
with `recognizeTextWithInstaScan` as the OCR dependency. Keep that game's crop,
text parsing, and catalog matching in its own scanner module. Disable the
standard shutter while either scan runs, and keep the remote request behind the
explicit InstaScan action. This gives new games the same control and upload
disclosure without another persistent toggle or large action bar.
