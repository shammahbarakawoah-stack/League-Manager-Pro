# eFootball League

A competitive online football league platform where players register teams, join leagues, submit match results, and climb the standings table — powered by Firebase.

## Run & Operate

- `pnpm --filter @workspace/efootball-league run dev` — run the frontend (port auto-assigned)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS v4, shadcn/ui, wouter, react-hook-form + zod
- Backend: Firebase Auth + Firestore (no custom API server needed)
- Icons: lucide-react
- Build: Vite

## Where things live

- `artifacts/efootball-league/src/` — all frontend source
- `artifacts/efootball-league/src/lib/firebase.ts` — Firebase init (reads VITE_ env vars)
- `artifacts/efootball-league/src/contexts/AuthContext.tsx` — auth state, signIn/signUp/signOut, isAdmin
- `artifacts/efootball-league/src/lib/types.ts` — TypeScript interfaces (User, League, Team, Match)
- `artifacts/efootball-league/src/components/StandingsTable.tsx` — EPL-style standings (computed from approved matches)
- `artifacts/efootball-league/src/components/NavBar.tsx` — responsive nav with admin link
- `artifacts/efootball-league/src/pages/` — Login, Register, Dashboard, Leagues, LeagueDetail, Fixtures, Results, Standings, Profile, Admin

## Architecture decisions

- **Firebase-only**: No custom Express backend. All data lives in Firestore, auth via Firebase Auth.
- **Computed standings**: League table is calculated live from approved matches — no stored standings field that can drift out of sync.
- **Admin via Firestore flag**: `users/{uid}.isAdmin = true` grants admin access. Set manually in Firestore Console.
- **Real-time updates**: Admin panel and standings use `onSnapshot` for live data.
- **Match approval flow**: Submit result → `status: "pending_approval"` → admin approves → `status: "approved"` → standings auto-update.

## Firestore Data Model

```
users/{uid}          — email, displayName, photoURL, isAdmin, createdAt
leagues/{leagueId}   — name, description, adminUid, memberUids[], status, createdAt
teams/{teamId}       — name, leagueId, ownerUid, logoURL, createdAt
matches/{matchId}    — leagueId, homeTeamId, awayTeamId, homeTeamName, awayTeamName,
                       scheduledDate, status, homeScore, awayScore, submittedByUid,
                       resultNotes, createdAt, updatedAt
```

## Product

Full eFootball league management: user auth, league creation/joining, team registration with logos, fixture scheduling, result submission, admin approval flow, EPL-style standings table (P/W/D/L/GF/GA/GD/Pts), fixtures and results pages, profile with career stats, admin panel.

## User preferences

- Dark mode by default
- Football/esports aesthetic: deep navy background, electric green accents
- No emojis in UI

## Gotchas

- **Firebase setup required**: Must enable Email/Password auth and Firestore in Firebase Console before the app works.
- **Admin setup**: After first login, manually set `isAdmin: true` on your user doc in Firestore Console.
- **VITE_ prefix**: All Firebase env vars must be prefixed `VITE_` to be accessible in the browser bundle.
- **Firestore rules**: Default test-mode rules expire after 30 days — replace with production rules before going live.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
