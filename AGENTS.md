AGENTS PLAYBOOK FOR show-off (Expo + React Native + TypeScript)
Purpose: give agentic coders fast, correct guidance for this repo.
Command quickstart
- Install deps: `npm install` (Node 18+ recommended by Expo).
- Dev server: `npm start` (interactive Expo CLI menu).
- iOS: `npm run ios` (requires Xcode; may prebuild native code).
- Android: `npm run android` (requires Android SDK/emulator; may prebuild).
- Web: `npm run web` (Expo web target with react-native-web).
- Lint: `npm run lint` (ESLint via expo config, ignores `dist/*`).
- Tests: `npm test` (Jest + ts-jest, Node env).
- Single test file: `npx jest lib/createItemValidation.test.ts` (path-based).
- Single test case: `npx jest lib/createItemValidation.test.ts -t "fails when price is negative"`.
- Watch tests: `npx jest --watch` for iterative runs.
- Jest config: `jest.config.js` uses `ts-jest`, `testEnvironment: "node"`, alias `^@/(.*)$ -> <rootDir>/$1`.
- Reset template example (not main app): `npm run reset-project` (see `app-example/scripts/reset-project.js`).
Environment and secrets
- Supabase client expects `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_ANON_KEY` (see `lib/supabase.ts`).
- These keys are public anon keys; do not store service role or private keys in repo.
- Auth storage uses `expo-secure-store` adapter; avoid bespoke storage for tokens.
- `react-native-url-polyfill/auto` already imported for Supabase; no extra setup.
Repo map
- `app/` holds Expo Router routes: `(auth)` stack, `(tabs)` screens, `(admin)`, layouts, providers.
- `app/providers/` includes `QueryProvider` and `AuthInitializer` wrappers.
- `src/features/` contains screen logic for discover, marketplace, profile, showcase, create flow.
- `src/components/` reusable UI, modals (comment, barcode scanner, item generation, skeletons).
- `api/` wraps Supabase + TanStack Query hooks for auth, profile, items, showcase, social interactions.
- `lib/` utilities: validation schemas, Supabase client, auth helpers.
- `constants/` theme/layout/item condition definitions; reuse instead of literals.
- Tests live beside libs (e.g., `lib/authValidation.test.ts`, `lib/createItemValidation.test.ts`).
- Assets and fonts under `assets/`; add new ones sparingly and optimize size.
TypeScript and typing
- `tsconfig.json` extends `expo/tsconfig.base` with `strict: true` and path alias `@/* -> ./*`.
- Prefer inference; annotate function props and public return types.
- Use `zod` for runtime validation; export `z.infer` types for downstream use.
- Avoid `any`; if unavoidable, confine and document.
- For components, type props explicitly; use `PropsWithChildren` when children are accepted.
- In Supabase responses, narrow types instead of casting; surface errors early.
Imports and module resolution
- Use alias `@/` for root imports (works in TS and Jest).
- Import order: external deps, then aliased internal modules, then relative paths.
- Prefer named exports for hooks/utils; default exports acceptable for screens/components.
- Avoid long `../../..` chains when alias applies.
Formatting and style
- ESLint config: `eslint.config.js` using `eslint-config-expo/flat`; minimal overrides.
- VS Code save actions (per `.vscode/settings.json`) set to `explicit`: run organize/fix via command palette when needed.
- Prefer 2-space indentation (some legacy code uses 4; keep new code 2).
- Strings: double quotes; template strings only when interpolating.
- Semicolons present; keep them.
- Trailing commas acceptable in objects/arrays and multiline JSX props.
- Keep files ASCII; only introduce non-ASCII when intentional and already used.
React/React Native patterns
- Use functional components; hooks belong at top-level only.
- Use `StyleSheet.create` to group styles; avoid new inline objects every render when reuse is possible.
- Respect safe areas via `useSafeAreaInsets`; see `DiscoverScreen` pattern.
- Manage loading/empty states explicitly with `ActivityIndicator` or friendly text.
- Memoize callbacks and computations passed to child components (`useCallback`, `useMemo`).
- For lists, supply `keyExtractor`, `getItemLayout`, and pagination handlers as shown in `DiscoverScreen`.
- Favor stable refs for viewability callbacks (`useRef(...).current`).
State, data, and networking
- TanStack Query is primary data layer; define queries/mutations under `api/*` and export hooks.
- Invalidate caches with `queryClient.invalidateQueries({ queryKey: [...] })` after mutations (see auth hooks).
- Infinite queries: use `fetchNextPage`, `hasNextPage`, `isFetchingNextPage`, and a consolidated item list via `pages.flatMap`.
- Local state via React hooks or `zustand` (see `useAuthStore`).
- Supabase operations should throw on `{ error }` so UI can handle messaging.
- Prefer centralized API helpers; avoid duplicating Supabase calls inside components.
- For forms, pair `zod` schemas with handler helpers (as in `createItemValidation.ts`).
- Persist auth/session only through the provided Supabase adapter; do not bypass it.
Error handling and UX
- Check Supabase responses for `error` and throw immediately; avoid silent failures.
- Surface user-facing errors via toasts/modals/dialogs; avoid console-only handling.
- Keep error messages actionable and concise; match current friendly tone.
- When catching, log minimal context (avoid sensitive payloads) and rethrow or set UI state.
- Handle loading, error, and empty states distinctly in screens and lists.
Navigation and routing
- Expo Router directory names define routes; keep new screens under correct segment (`(auth)`, `(tabs)`, `(admin)`).
- Use `Redirect` for auth gating (see `app/index.tsx`).
- Prefer Router hooks for params/navigation; avoid ad-hoc navigation objects.
- Keep layout wrappers (`_layout.tsx`) minimal and consistent across stacks.
Theming and layout
- Colors and palette in `constants/theme.ts`; prefer `COLORS.primary/background` over hardcoded values.
- Layout constants (e.g., tab bar height) in `constants/layoutConfig.ts`; reuse for spacing and overlays.
- Size full-screen content with `useWindowDimensions` and safe area insets.
- Maintain consistent typography weights/sizes with surrounding code.
Testing practices
- Jest + ts-jest; Node test environment.
- Keep tests co-located with subject; mirror existing describe/it style.
- For schemas, assert both success (`parse`) and failure (`toThrow`) paths.
- Use deterministic inputs; avoid timers/network.
- Use alias imports `@/...` in tests; ts-jest handles resolution.
- Run focused tests during edits (`npx jest path -t "case" --watch`).
- Add coverage only when helpful; not required in CI by default.
Linting and quality
- Run `npm run lint` before shipping; fix warnings/errors.
- Respect ignored `dist/*`; avoid placing source there.
- Organize imports and sort members explicitly when necessary (VS Code commands).
- Adjust ESLint rules sparingly; prefer following existing patterns.
Validation and schema usage
- Validation lives in `lib/*Validation.ts`; extend instead of ad-hoc checks.
- Keep messages user-friendly and specific.
- When extending enums (`ITEM_CONDITIONS`), update schemas and tests together.
- Export helper functions like `validateCreateItem` to centralize parsing.
File naming and structure
- Components/screens: `PascalCase.tsx`; hooks: `useThing.ts`.
- Constants/utilities: descriptive noun or camelCase file names.
- Keep file name aligned with default export when used as screen.
Styling specifics
- Use `StyleSheet.create`; reuse shared style objects where possible.
- Prefer existing palette; black/white inline okay where precedent exists (e.g., `DiscoverScreen`).
- Keep touch targets padded; align content with flex layouts instead of absolute unless required.
Performance guidance
- Memoize FlatList callbacks and pass stable refs; use `removeClippedSubviews`, `initialNumToRender`, `windowSize` when appropriate.
- Avoid expensive work in render; move to effects or background tasks.
- Defer non-critical queries until focus (`useIsFocused` pattern).
- Keep `useMemo` for derived arrays (e.g., `pages.flatMap`) to prevent recalculation.
Accessibility and UX polish
- Provide meaningful text labels; ensure contrast on overlays/backgrounds.
- Keep status bar handling intentional (e.g., translucent with overlays when dark backgrounds used).
Assets and fonts
- Assets in `assets/images/`, fonts in `assets/fonts/`; add optimized files only.
Git and workflow
- Repo is dirty-aware; do not reset or amend user commits without instruction.
- Keep changes focused; avoid touching unrelated files.
- Commit only when explicitly asked.
Security and privacy
- Do not commit secrets; only public Supabase anon key belongs in env.
- Redact tokens/session data from logs and errors.
Tooling notes
- No Cursor rules found (`.cursor/rules` or `.cursorrules` absent when written).
- No Copilot instructions file found (`.github/copilot-instructions.md` absent).
- VS Code recommendation: `expo.vscode-expo-tools` (see `.vscode/extensions.json`).
Adding features
- Follow existing path: API helper in `api/...` + hook export + UI in `src/features` or `src/components`.
- Add validation/schema updates alongside new payloads and update/create tests.
- Wire new screens by placing files in correct route segment and ensuring layouts exist.
- Reuse theme/layout constants rather than duplicating literals.
Debugging tips
- Auth issues: check `useAuthStore` session state and Supabase env vars.
- Query issues: verify `queryKey` stability and invalidate appropriately.
- Jest path errors: ensure imports use `@/` or relative paths matching tsconfig/jest config.
Build considerations
- `npm run ios/android` triggers native builds; ensure Xcode/Android SDK present.
- Web target uses `react-native-web`; guard native-only modules with platform checks.
Comments and copy
- Add comments only when intent is non-obvious; keep them concise.
Pre-ship checklist
- Run `npm run lint`.
- Run relevant `npx jest ...` for touched code.
- Verify navigation paths match folder names.
- Confirm required env vars are set for Supabase flows.
- Check imports, styles, and file naming stay consistent with nearby code.
