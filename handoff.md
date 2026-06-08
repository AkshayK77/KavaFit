# Forge — App Handoff Document

## What This Document Is

A complete context dump for anyone (or any AI) continuing work on Forge. Read this before touching the codebase.

---

## Product Vision

**Forge** is an AI-powered fitness coaching app. The tagline is "Train smarter. Progress faster." It acts as a personal coach that knows your body, training history, and goals — it generates workout plans, tracks your sets in real time, monitors nutrition, and gives intelligent weekly feedback. The target user is someone who trains consistently (beginner to advanced) and wants structure without hiring a personal trainer.

The app is built for mobile-first but works on desktop. It is live and production-deployable.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS 4 + CSS custom properties |
| Routing | React Router v7 |
| Backend/Auth/DB | Supabase (PostgreSQL + Row Level Security) |
| Primary AI | Groq API — `llama-3.3-70b-versatile` |
| Fallback AI | Google Gemini API |
| Maps | Leaflet + React Leaflet |
| Offline storage | IndexedDB (`idb` library) |
| Deployment | Vercel |

Fonts: **Bebas Neue** (headers) + **DM Sans** (body). Design accent color: **`#C8F55A`** (lime green).

---

## Project Structure

```
src/
  pages/          # One file per screen
  components/     # Shared UI components
  hooks/          # Custom React hooks
  lib/            # Business logic, API wrappers, utilities
  context/        # React context providers
  types/          # TypeScript types (Supabase-generated + custom)
  styles/         # globals.css (design tokens)
supabase/
  functions/      # Edge functions (gym search, etc.)
supabase_schema.sql  # Full DB schema
```

---

## Pages (Screens)

| Route | Page | What it does |
|---|---|---|
| `/` | Homepage | Public landing page with hero section and CTAs |
| `/login` | LoginPage | Email/password + Google OAuth sign-in and sign-up |
| `/onboarding` | OnboardingPage | 5-step profile setup (age, goal, equipment, diet, etc.) |
| `/dashboard` | DashboardPage | Daily hub: today's workout, nutrition, muscle heatmap, AI insights, weekly summary |
| `/workout` | WorkoutPage | Live session logger + plan builder + plan viewer |
| `/anatomy` | BodyLabPage | Interactive body diagram (muscle groups, recovery times, injury notes) |
| `/progress` | ProgressPage | Monthly calendar, strength graphs, body measurement trends |
| `/nutrition` | NutritionPage | AI recipe generation, food logging, macro tracking, grocery lists |
| `/ai` | AIPage | Free-form AI coach chat with context awareness |
| `/gyms` | GymsPage | Leaflet map with nearby gym search (Overpass API) |
| `/settings` | SettingsPage | Edit profile, avatar upload, data export |

All routes except `/` and `/login` are behind `<ProtectedRoute>` and rendered inside `<AppShell>`.

---

## Key Components

| Component | Role |
|---|---|
| `AppShell.tsx` | Main layout: top nav, bottom mobile nav, floating AI button, active session timer |
| `AIDrawer.tsx` | Compact AI chat sidebar (slides in from the floating button) |
| `MuscleHeatmap.tsx` | Visual heatmap showing weekly training volume per muscle group |
| `ManualWorkoutLogger.tsx` | Form for logging sets outside of a structured session |
| `ExerciseModal.tsx` | Pop-up with exercise details (muscles, equipment, instructions) |
| `FoodSearch.tsx` | Autocomplete search over the Indian foods database |
| `VolumeTracker.tsx` | Widget showing per-muscle-group set counts vs. min/max thresholds |
| `Toast.tsx` | Toast notification system (success / warning / error) |
| `ProtectedRoute.tsx` | Auth guard — redirects to `/login` if unauthenticated |

---

## Business Logic (src/lib/)

| Module | What it does |
|---|---|
| `geminiAgent.ts` | **Primary AI caller.** Sends chat completions to Groq (Llama 3.3 70B). Handles system prompts, JSON parsing, and special agent modes. |
| `gemini.ts` | Fallback Gemini API caller (used for some secondary tasks). |
| `agentContext.ts` | Builds the context object sent to the LLM: profile, recent sessions, weekly volume, today's nutrition, today's plan. |
| `workoutPlan.ts` | Generates AI workout plans, creates session records in Supabase, handles plan structure (PPL, Bro Split, Full Body, etc.). |
| `progressiveOverload.ts` | Suggests weight increases when a user consistently hits the top of their rep range. |
| `volumeTracker.ts` | Tracks weekly sets per muscle group and compares to min/max thresholds. |
| `deloadDetector.ts` | Detects when a user has trained hard for 5+ consecutive weeks and flags a deload week. |
| `weeklySummary.ts` | Generates an AI-written Monday recap (cached in localStorage, only regenerates on Mondays). |
| `offlineDb.ts` | IndexedDB wrapper for storing pending sets and sessions while offline. |
| `gymCache.ts` | Caches gym search results and geocoded locations in localStorage. |
| `supabase.ts` | Supabase client initialization. |

---

## AI Agent System

The AI coach is the core differentiator of the app. Here is how it works:

**Model**: Groq `llama-3.3-70b-versatile`

**Context sent with every request** (built by `agentContext.ts`):
- Full user profile (age, weight, goal, experience, diet, injuries, equipment)
- Last N sessions (exercises, sets, weights)
- Weekly volume per muscle group
- Today's nutrition totals vs. targets
- Today's planned workout

**Special agent modes** (`AgentSpecialMode` type):
- `flags` — generates 3–5 insight bullets for the dashboard
- `recipe` — returns a structured recipe JSON
- `workout` — returns workout plan modifications
- `grocery` — returns a grocery list
- `warmup` — generates a warmup routine

The AI drawer in `AppShell` is a quick-access chat. The full `AIPage` has chat history, quick-prompt chips, and the ability to apply AI-suggested workouts directly to the active session.

---

## Database Schema (Supabase / PostgreSQL)

All tables have RLS enabled. Users can only read/write their own rows. The `exercises` table is public read-only.

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id`, `age`, `weight_kg`, `height_cm`, `city`, `fitness_goal`, `experience_level`, `sessions_per_week`, `equipment_available`, `injuries[]`, `dietary_preference`, `allergies[]`, `calorie_target`, `protein_target` | One row per user. Created by DB trigger on signup. |
| `exercises` | `id`, `name`, `muscle_groups[]`, `equipment`, `difficulty`, `instructions` | Pre-populated exercise library. Public read. |
| `workout_plans` | `id`, `user_id`, `name`, `created_by_ai` | A user's active plan. |
| `plan_days` | `id`, `plan_id`, `day_name`, `exercise_ids` (JSONB) | Individual days within a plan. |
| `sessions` | `id`, `user_id`, `plan_day_id`, `date`, `duration_minutes`, `notes`, `completed_at` | A completed workout session. |
| `session_sets` | `id`, `session_id`, `exercise_id`, `set_number`, `reps`, `weight_kg`, `rpe`, `completed` | Individual sets within a session. |
| `measurements` | `id`, `user_id`, `date`, `weight_kg`, `chest_cm`, `waist_cm`, `hips_cm`, `arms_cm`, `thighs_cm` | Body measurements over time. |
| `muscle_volume_log` | `id`, `user_id`, `week_start`, `muscle_group`, `total_sets` | Weekly set counts for heatmap and volume logic. |
| `meal_history` | `id`, `user_id`, `date`, `recipe_name`, `calories`, `protein_g`, `carbs_g`, `fat_g` | Logged meals. |
| `progress_photos` | `id`, `user_id`, `date`, `photo_url`, `notes` | Progress photos. |
| `indian_foods` | `id`, `name`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `serving_size_g` | Pre-seeded Indian food nutrition data. |

---

## Authentication & Onboarding Flow

1. User lands on `/login`, signs up via email or Google OAuth
2. Supabase trigger creates a `profiles` row on signup
3. User is redirected to `/onboarding` (5 steps):
   - Step 1: Basic info (age, weight, height, city)
   - Step 2: Fitness goal
   - Step 3: Experience level + sessions per week
   - Step 4: Equipment available + injuries
   - Step 5: Dietary preference + allergies
4. On completion, an initial AI workout plan is generated and the user lands on `/dashboard`

---

## State Management

There is no Redux or Zustand. State is handled via:

| Mechanism | What lives there |
|---|---|
| `AuthContext` | Auth session, user profile, active session exercises, workout update signals, avatar URL, heatmap refresh triggers, AI drawer open state |
| Component `useState` | Forms, modals, loading states, local UI |
| `localStorage` | Active session timer, AI flag cache, weekly summary cache, gym search cache, PR notification flags |
| `IndexedDB` (via `offlineDb.ts`) | Pending sets and sessions when the user is offline |

---

## Styling System

CSS custom properties defined in `src/styles/globals.css`:

```css
--bg            /* Page background (dark) */
--surface       /* Card/panel background */
--surface2      /* Slightly elevated surface */
--surface3      /* Hover/selected state */
--text          /* Primary text */
--muted         /* Secondary text */
--dim           /* Tertiary/placeholder text */
--accent        /* #C8F55A — lime green, primary CTA color */
--accent-dim    /* Muted accent for backgrounds */
--accent-glow   /* Box-shadow glow using accent */
--border        /* Default border */
--border2       /* Stronger border */
--amber         /* Warning color */
--red           /* Error/destructive color */
```

Components use a mix of Tailwind utility classes and inline styles referencing these variables. The `useIsMobile` hook (breakpoint: 768px) drives responsive layout switches.

---

## Volume Thresholds (Hardcoded)

Weekly set targets per muscle group (from `volumeTracker.ts`):

| Group | Min sets | Max sets |
|---|---|---|
| Chest | 10 | 20 |
| Back | 10 | 20 |
| Shoulders | 8 | 16 |
| Biceps | 8 | 14 |
| Triceps | 10 | 14 |
| Legs / Quads | 10 | 20 |
| Hamstrings | 6 | 12 |
| Glutes | 8 | 16 |
| Core | 6 | 12 |

The heatmap colors from grey → amber → green based on progress toward the max.

---

## Environment Variables

```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_SERVICE_ROLE_KEY
VITE_GROQ_API_KEY
VITE_GEMINI_API_KEY
VITE_RAPIDAPI_KEY           (food nutrition search)
VITE_USDA_API_KEY           (USDA FoodData Central)
```

All are in `.env` (gitignored). The Supabase project ID is `aidicvflcqarlwriyqfv`.

---

## External Services

| Service | Used for |
|---|---|
| **Supabase** | Database, auth, row-level security, edge functions |
| **Groq API** | Primary LLM (Llama 3.3 70B) |
| **Google Gemini API** | Fallback LLM |
| **Overpass API** | OSM-based gym search (called via Supabase edge function) |
| **OpenStreetMap Nominatim** | Geocoding city names + reverse geocoding GPS coordinates |
| **RapidAPI** | Supplemental food nutrition search |
| **USDA FoodData Central** | Nutrition data for food items |

---

## Workout Plan Types

The app supports generating these plan structures:
- **PPL** (Push/Pull/Legs) — 3 or 6 day
- **PPL + Upper/Lower** — 5 day hybrid
- **Bro Split** — Chest/Back/Legs/Shoulders/Arms
- **Full Body** — 3 day

Plans are AI-generated by sending the user's profile + goals to Groq. The response is parsed into `plan_days` rows linked to `exercises` by ID. There is a 3-tier name-matching fallback for resolving exercise names when the AI response doesn't exactly match DB names.

---

## Offline Support

- When the network is unavailable, sets are saved to IndexedDB via `offlineDb.ts`
- A sync function attempts to flush pending records to Supabase when connectivity returns
- The active session timer is persisted to `localStorage` under key `forge_active_session_v1`

---

## Known Gaps & Technical Debt

1. **No tests** — there is a Playwright dependency in `package.json` but no test files. Zero unit tests, zero integration tests.
2. **Hardcoded volume thresholds** — no UI for users to customize their target set ranges.
3. **Deload feature** — requires a `deload_suggested_at` column on `profiles` that may not exist in all environments; the code silently skips if the column is missing.
4. **Avatar upload** — the UI exists in SettingsPage but the Supabase storage bucket path may not be fully configured.
5. **AI token limits** — for users with long training histories, the context sent to Groq can get large. No trimming strategy is implemented beyond a recent-sessions cutoff.
6. **Weekly summary** — only regenerates on Mondays and is cached in `localStorage`. First-time users on non-Monday days see no summary.
7. **Gym search timeouts** — tries 3 Overpass mirror endpoints with 8s timeout each; can feel slow on mobile networks.
8. **No error boundaries** — an unhandled runtime error in any page will crash the whole app.
9. **No analytics** — no tracking of what features users actually use.
10. **Progress photos** — table exists in DB, upload UI in SettingsPage, but there is no photo gallery or comparison view yet.

---

## Feature Ideas & Future Direction

These are not commitments — they are directions worth considering:

### High Value / Near Term
- **Streak tracking** — consecutive days trained, visual streak counter on dashboard
- **PR notifications** — alert when a user lifts a new personal record (infrastructure partially exists via `forge_new_prs` localStorage key)
- **Rest timer** — built-in countdown between sets during a session
- **Body weight graph** — dedicated weight trend visualization (measurements exist, chart UI is partial)
- **Workout templates** — save and reuse custom workouts outside of AI-generated plans

### Medium Term
- **Social / sharing** — share a workout summary card (image export)
- **Apple Health / Google Fit sync** — pull weight data, push workouts
- **Video guidance** — link exercise instructions to video demos
- **Custom volume thresholds** — let users set their own min/max set targets per muscle
- **Periodization** — structured mesocycle planning (hypertrophy → strength → deload phases)

### Longer Term
- **Wearable integration** — heart rate data during sessions, HRV recovery scoring
- **Coach mode** — one account managing multiple users (trainer use case)
- **Nutrition barcode scanner** — use camera to scan food packaging
- **AI form feedback** — analyze workout video for form cues (would require on-device ML or a vision API)

---

## Codebase Entry Points

When starting on any feature, begin with these files:

- **Routing**: `src/App.tsx`
- **Global state / auth**: `src/context/AuthContext.tsx`
- **Daily user experience**: `src/pages/DashboardPage.tsx`
- **AI logic**: `src/lib/geminiAgent.ts` + `src/lib/agentContext.ts`
- **Workout logic**: `src/lib/workoutPlan.ts`
- **DB types**: `src/types/supabase.ts`
- **Custom types**: `src/types/app.ts`
- **Design tokens**: `src/styles/globals.css`

---

## How to Run Locally

```bash
npm install
npm run dev       # Vite dev server at localhost:5173
npm run build     # TypeScript check + production build
```

Requires a `.env` file with all variables listed above.

---

## Deployment

- Hosted on **Vercel** (`vercel.json` in root)
- `npm run build` produces `dist/` — Vercel picks this up automatically on push to `main`
- Supabase project is separate from the Vercel deployment — DB changes require running migrations manually or via Supabase dashboard

---

*Last updated: June 2026*
