# show-off

## Project Overview
`show-off` is a mobile application built with **React Native** and **Expo**, utilizing the **Expo Router** for file-based navigation. It is configured with **TypeScript** and has the **New Architecture** and **React Compiler** enabled.

**Purpose:** A social application for collectors to showcase their items. Users can create "showcases" which are collections of items verified by databases. Items can be created and imported manually without verification bit will be unverified. They can follow other users, like, comment on, and bookmark items. Users can also share their showcases to other users.

- **Current Version:** Expo SDK 54 (~54.0.30)
- **Source of Truth:** [Expo Documentation](https://docs.expo.dev/versions/latest/)

---

## Tech Stack

### Core & Framework
- **Framework:** Expo SDK 54
- **Runtime:** React Native 0.81.5, React 19.1.0
- **Language:** TypeScript (~5.9.2)
- **Navigation:** Expo Router (~6.0.21)

### Data & State Management
- **Backend:** Supabase (Auth, DB, Storage)
- **Data Fetching:** TanStack Query
- **State Management:** Zustand
- **Local Storage:** MMKV
- **Forms & Validation:** TanStack Form + Zod

### UI & Styling
- **Styling System:** \`constants/theme.ts\` (Custom color palette)
- **Animations:** \`react-native-reanimated\`
- **Gestures:** \`react-native-gesture-handler\`

### Testing
- **Jest:** Unit and component testing

---

## Key Commands
| Command | Description |
| :--- | :--- |
| \`npm run start\` | Start the Expo development server |
| \`npm run android\` | Run on Android emulator/device |
| \`npm run ios\` | Run on iOS simulator/device |
| \`npm run web\` | Run in web browser |
| \`npm run lint\` | Run ESLint |

---

## Project Structure
- **\`app/\`**: Application routes and layouts (Expo Router).
- **\`assets/\`**: Images, icons, and fonts.
- **\`constants/\`**: Theme and application constants.
- **\`api/\`**: API layer and Supabase integration.
- **\`hooks/\`**: Custom React hooks.
- **\`scripts/\`**: Utility scripts (e.g., \`reset-project.js\`).
- **\`supabase/\`**: Database migrations and configuration.

---

## Development Conventions

### Routing & UI
- **File-based Routing:** All routes reside in the \`app/\` directory.
- **Theming:** Always use the color palette from \`constants/theme.ts\`. The UI follows a dark theme with purple accents.
- **Path Aliases:** Use \`@/*\` for absolute imports as configured in \`tsconfig.json\`.

### Architecture & Performance
- **New Architecture:** Enabled (\`newArchEnabled: true\`).
- **React Compiler:** Enabled for optimized rendering.

### Data & Security
- **Database:** Migrations are managed in \`supabase/migrations\`.
- **API Keys:** Use environment variables for sensitive keys.

---
