# Webflow Builder — React/TSX

React + TypeScript + Tailwind implementation of the Webflow Builder Designer Extension UI. 16 screens covering the full flow from onboarding to a completed page, plus the proposed Component opportunities setup.

## Stack

- React 18+ with TypeScript
- Tailwind CSS (extended theme)
- `lucide-react` for icons
- Pure UI — no Webflow Designer API wired in

## Structure

```
src/
├── index.css                    Tailwind directives + Google Font imports
├── types.ts                     ScreenName union + screen metadata
├── App.tsx                      Dev wrapper with screen routing
│
├── context/
│   └── NavigationContext.tsx    Screen state, history, app-level state
│
├── components/                  Shared UI primitives
│   ├── Panel.tsx                Outer extension panel chrome
│   ├── Titlebar.tsx
│   ├── Stepper.tsx              3-step progress (Skeleton → Style → Done)
│   ├── Headers.tsx              PageHeader, SectionDetailHeader, ListHeader
│   ├── Button.tsx               Button + IconButton variants
│   ├── Badge.tsx                Status badges + StatusDot + Spinner
│   ├── Callout.tsx              Warning / error callouts
│   └── DevShell.tsx             Sidebar + topbar (dev only — strip for production)
│
└── screens/                     One file per screen
    ├── WelcomeScreen.tsx
    ├── ChooseRepoScreen.tsx
    ├── MapPagesScreen.tsx
    ├── CreatePageScreen.tsx
    ├── SectionListScreen.tsx
    ├── GeneratingSkeletonScreen.tsx
    ├── SkeletonReviewScreen.tsx
    ├── SkeletonEditScreen.tsx
    ├── ApplyingStylesScreen.tsx
    ├── SectionCompleteScreen.tsx
    ├── PageCompleteScreen.tsx
    ├── SiteProgressScreen.tsx
    ├── SettingsScreen.tsx
    ├── NotMappedScreen.tsx
    ├── ErrorScreen.tsx
    └── ComponentOpportunitiesScreen.tsx
```

## Integration

1. Drop `src/` into your Webflow extension project.
2. Merge `tailwind.config.snippet.cjs` into your existing Tailwind config (the `theme.extend` block).
3. Install deps:
   ```bash
   npm install lucide-react
   ```
4. Import Inter + JetBrains Mono. `src/index.css` includes a `@import` for them, or add to `index.html`.
5. Use `<App />` as a dev sandbox, or import individual screens directly:
   ```tsx
   import { SectionListScreen } from './screens/SectionListScreen';
   ```

## Stripping the dev shell

`App.tsx` wraps screens in `<DevShell>` (sidebar + topbar). For production, render the current screen directly without the shell — the screens are size-aware (800×600) and self-contained.

## Navigation state

`NavigationContext` exposes:
- `current` — active screen
- `navigate(name)` — push new screen
- `goBack()` / `goForward()` — history
- `restart()` — reset to welcome
- `featuresGridState` / `setFeaturesGridState` — section list complete-state toggle (drives the post-build state on the section list and page complete screen)

Auto-advance on loading screens (`generating-skeleton`, `applying-styles`) is handled inside the screen components via `useEffect` + `setTimeout`.
