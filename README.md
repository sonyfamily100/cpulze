# cpulze-verify

A small local app for running the API pipeline, pasting in consumer-app answers, loading a corpus, and running the Claude verification engine — all in one place.

## Setup

```bash
npm install
cp .env.example .env
# then fill in .env with real keys:
#   OPENAI_API_KEY, GEMINI_API_KEY, PERPLEXITY_API_KEY, ANTHROPIC_API_KEY
#   SUPABASE_URL, SUPABASE_SERVICE_KEY
npm start
```

If this is the first setup for a shared project, create a Supabase project and run this once in its SQL editor:

```sql
create table hotels (
  id text primary key,
  name text not null,
  location text default '',
  created_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);
```

Use the project's **service_role** key (not the anon key) for `SUPABASE_SERVICE_KEY` — all access is server-side from `server.js`. Everyone sharing the app points `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` at the same project, so hotels created or scanned by one person show up for everyone else.

If you have existing hotels in a local `data/` folder from before this change, migrate them once with `node scripts/migrate-to-supabase.js`.

Open http://localhost:3000

## What it does

1. **Add a hotel** (name + location) in the sidebar.
2. **Run the API pipeline** — one button per engine, runs Part A/B/C sequentially using the exact prompts (with the OPTIONAL-attribution fix applied — see `prompts/shared.js`) and stores raw + parsed results.
3. **Load a corpus** — paste CSV text directly, or upload a file. Expected columns: `url,reviewer,date,rating,title,text` (matches your Tampermonkey extractor's output).
4. **Paste consumer-app answers** — a 12-theme × 3-engine grid. Saves automatically when you click out of a box.
5. **Run verification** — sends everything (API findings + consumer findings + corpus) to Claude, which returns a structured verdict per finding: `VERIFIED / THEME_VERIFIED / UNVERIFIABLE / FABRICATED / CONTRADICTED`, each with visible reasoning, plus a separate list of cross-finding contradictions (e.g. two different dollar figures for the same fee).

## Data storage

Each hotel is a row in a Supabase (hosted Postgres) `hotels` table, accessed through `lib/db.js`. `id`/`name`/`location`/`created_at` are real columns; everything else (`api_findings`, `consumer_findings`, `corpus`, `verification`, `verification_history`, `email_history`) lives in a single `data` jsonb column. Because storage is centralized instead of per-machine, everyone sharing the app sees the same hotels and scans in real time — see the Supabase setup step above.

## Notes

- `.env` is never committed — only `.env.example` is.
- The Gemini caller checks `groundingMetadata.webSearchQueries` specifically — an empty result means search never fired, even if the call otherwise succeeded. This is surfaced in the raw per-branch data (`grounded: false`) and the verification prompt is told to treat ungrounded findings with appropriate skepticism, but it doesn't auto-exclude them — the verdict taxonomy (FABRICATED / UNVERIFIABLE) is where that judgment actually gets applied, with reasoning attached.
- The attribution fields (`REVIEWER_n`, `REVIEW_DATE_n`, `PLATFORM_n`) are deliberately optional in the prompts now, per the fix discussed on July 15 — worth A/B testing against the original mandatory-field version if you want to confirm this reduces fake-reviewer fabrication.
- Consumer-app answers still require manual collection and paste-in — no browser automation is included, deliberately (see conversation notes on why that's a separate decision).
