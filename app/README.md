# Chess Boxing Tracker

A personal, mobile-first PWA that tracks two goals side by side: your Lichess rating and your body weight, plus the training and chess-study sessions behind them. Everything is stored on the device (IndexedDB) and keeps working offline; Supabase sign-in and sync are optional, and add up once the same data has to follow you between devices.

## Run it locally

Needs Node 20 or newer. If your shell has `NODE_ENV=production` set, use `npm install --include=dev` so the build tools are installed.

```sh
npm install
npm run dev        # http://localhost:5173 — open it on your phone via the Network URL
```

## Build and preview

```sh
npm run build      # outputs dist/
npm run preview    # serves dist/ at http://localhost:4173
```

`dist/` is a plain static site. Serve it over HTTP(S) — opening `dist/index.html` straight from the file system won't run the app (browsers block module scripts on `file://`).

## Deploy to Vercel

The site is a Vite build plus two server functions in `api/`. Vercel serves both, so there is no separate backend.

### 1. Put the code on GitHub

From the folder that contains `app/`:

```sh
git init
git add .
git commit -m "Chess boxing tracker"
git branch -M main
```

Create an empty repository at github.com/new — no README, no .gitignore — then connect it:

```sh
git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
git push -u origin main
```

If git asks who you are on the first commit, set it once:

```sh
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

Only `app/` is built. The design PDFs, mockups and notes at the repo root are ignored by the build.

### 2. Import the repo

1. vercel.com → **Add New → Project** → **Import Git Repository** (connect GitHub once).
2. Choose the repo. Set **Root Directory** to `app` (Vercel may show an **Edit** button next to it).
3. Leave **Framework Preset** on Vite and the build/output fields alone — `app/vercel.json` sets the build command, the output folder, the SPA fallback and the function timeouts.
4. Open **Environment Variables** and add the ones you want (all optional):

   | Variable | What it turns on |
   |---|---|
   | `LICHESS_TOKEN` | Your latest games, in order (read-only, no scopes) |
   | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Sign-in and sync (public values) |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server-side account checks and coach limits |
   | `ANTHROPIC_API_KEY` | AI coach notes next to the engine feedback |

   The two `VITE_` values are public by design. The rest are server-only and never reach the browser.
5. **Deploy**. The first build takes about a minute; you get `https://<project>.vercel.app`.

Every push to `main` redeploys. From the terminal instead: `npx vercel --cwd app` for a preview URL, `npx vercel --cwd app --prod` to go live.

### 3. Check it

Open the URL on your phone and add it to the home screen. Onboarding asks for your goals and your Lichess username; the Chess tab then lists games to review under *Latest games*, *Worst losses* and *Best wins*. If the time control you picked has no finished games, the list says so — tap another time control above it (your main one is set in Settings). Without `LICHESS_TOKEN` the list still works, just from the games Lichess shares anonymously.

After the first load the app works offline, and Lichess ratings re-sync when you're back online.

**Lichess token:** create one at lichess.org → Preferences → API access tokens, leave every scope unticked (it can then only read public data), and paste it into `LICHESS_TOKEN` in Vercel. It stays on the server, so visitors still just type a username.

**Supabase (optional):** create a project, run `app/supabase/schema.sql` in its SQL editor, then copy the project URL and anon key into the two `VITE_` variables (plus the service-role values if you want server-side account checks).

**Sign-in is Google-only** (no emails, so Supabase's email rate limit never applies):
1. console.cloud.google.com → create a project → **Google Auth Platform** → configure the consent screen (External; app name, support email). While it's in "Testing", add each tester's Gmail under Audience → Test users, or click **Publish app**.
2. Clients → **Create client** → Web application. Authorised JavaScript origins: your site URL. Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → Authentication → Sign In / Providers → **Google** → enable, paste the Client ID and Client Secret, save.
4. Same page → **Email** → turn it off, so nobody can trigger magic-link emails directly against the API.
5. Authentication → URL Configuration: Site URL = your site; Redirect URLs include it (and `http://localhost:5173` for dev).

Any static host also works for the app itself (build with `npm run build`, publish `dist/`; the build uses relative paths, so subfolders are fine), but the AI coach and the game pull need the `api/` functions, which only run on Vercel.

## How it works

- **Setup:** Welcome → goals (time control, current/target rating, current/target weight, target date) → connect Lichess (optional). Your first weigh-in is your starting weight.
- **Lichess:** `GET https://lichess.org/api/user/{username}/rating-history` on app open and from the refresh button. Results are cached; unknown user, offline and rate-limit errors show a message and keep the last saved ratings.
- **Weight:** one entry per day (saving a day again replaces it). The trend is a 7-day moving average. Weekly rate = change in the moving average over the last 14 days, per week. Projected finish = kg remaining ÷ weekly rate. The trend appears after 3 entries.
- **Sessions:** date, chess or fitness, type, minutes, intensity 1–5, optional notes (and result for rated games). Edit or delete by tapping an entry.
- **Backup:** Settings → Export backup (JSON) / Import backup. Reset clears everything and returns to setup.

## Game review mode (Chess tab → Review your games)

Step through any of your games with a verdict on every move (Best, Good, Inaccuracy, Mistake, Blunder), the better move drawn as an arrow, engine feedback in plain words, and AI coach notes.

- **Engine:** Stockfish 19 (lite, single-threaded WASM) runs on the device from `public/engine/`. If Lichess already analysed the game, its analysis is used instead. Reviews are saved, so each game is analysed once.
- **Pulling your latest games:** with `LICHESS_TOKEN` set on the server, `api/games.ts` asks Lichess for that player's newest finished games in the selected time control (moves, evaluations and opening included), trims them to what the review screen needs and returns them under **Latest games**. The list refreshes with **Refresh**. Responses are cached for 60 seconds, and each IP is limited to 60 pulls an hour.
- **Without a token (username only, no login):** Lichess no longer lists a player's games to anonymous apps, so the app reads your public stats for the time control (`/api/user/{username}/perf/{perf}`), which name your best wins, worst losses, streak games (including your most recent game) and rating highs/lows, then fetches those games in one request (`POST /api/games/export/_ids`, which still works without a login and includes Lichess's own analysis when it exists). They're shown as *Latest*, *Worst losses* and *Best wins*. Any other game: paste its Lichess link or PGN.
- **AI coach:** `api/coach.ts` is a small server function that sends the engine data for your moves to Claude and returns a comment per move, a game summary and a key lesson. It needs an Anthropic API key on the server:
  - **Vercel:** add `ANTHROPIC_API_KEY` in Project → Settings → Environment Variables; the `api/` folder is deployed automatically.
  - **Local:** `ANTHROPIC_API_KEY=sk-ant-… npm run dev` (the dev server serves `api/coach` too).
  - Uses `claude-opus-5-5` with structured JSON output, one request per game, with Anthropic's default refusal fallback enabled. Without a key, engine feedback still covers every move.
  - **Chess-only guardrails:** no free text ever reaches the model. The endpoint accepts only strict chess data (SAN moves, FEN positions, verdict and evaluation values, ratings), replays the game with chess.js and rejects anything illegal or inconsistent with `400 not_chess`. Unknown fields and the opening name are dropped. Bodies over 120 KB get `413`, and each client is limited to 30 requests an hour (`429`). The system prompt restricts the model to coaching this game and has it flag anything off-topic, and only comments for the plies that were sent are returned, each length-capped. The rate limit is per server instance; for a public launch, back it with a shared store (e.g. Vercel KV / Upstash).

## Stack

React + Vite + TypeScript, Tailwind CSS, Recharts, Dexie (IndexedDB), vite-plugin-pwa, chess.js, Stockfish.js, Anthropic SDK (server function only). Fonts (Inter, Barlow Condensed) are bundled, so they work offline.

```
src/
  db.ts              data model (Settings, WeightEntry, Session, RatingCache, GameReview)
  lib/calc.ts        goal maths: target lines, moving average, rates, projection
  lib/lichess.ts     rating-history fetch + error handling
  state/             live data, Lichess sync, toasts, navigation
  components/        UI kit, bottom sheet, charts, weight keypad, Lichess connect
  screens/           Onboarding, Home, Chess, Weight, Log, SessionForm, Settings, GameReview
  lib/games.ts       Lichess game fetching (list, single game, PGN)
  lib/engine.ts      Stockfish worker wrapper
  lib/review.ts      per-move verdicts, accuracy and engine feedback
  lib/coach.ts       client for the AI coach endpoint
api/games.ts         server function: latest games via a read-only Lichess token
api/coach.ts         server function: Claude coaching (needs ANTHROPIC_API_KEY)
supabase/schema.sql  cloud tables and row-level security for optional sync
```

Design tokens (colours for dark and light themes) live at the top of `src/index.css`.
