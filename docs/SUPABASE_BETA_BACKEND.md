# Supabase Beta Backend

This backend gives beta users cloud accounts, owned run storage, private run artifacts, and AI summaries without shipping the OpenAI API key in the mobile app.

Project ref:

```bash
mclfqiugjyzpyknvrlyo
```

## Mobile app env

Copy `mobile-app/.env.example` to `mobile-app/.env`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://mclfqiugjyzpyknvrlyo.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=replace-with-your-supabase-publishable-or-anon-key
```

These values are public client values. Do not put `OPENAI_API_KEY`, Supabase service-role keys, or secret keys in the mobile app.

## Supabase secrets

Set Edge Function secrets in Supabase:

```bash
npx supabase secrets set \
  OPENAI_API_KEY=sk-replace-with-your-openai-key \
  OPENAI_MODEL=gpt-5.4-mini \
  AI_DAILY_LIMIT=20 \
  --project-ref mclfqiugjyzpyknvrlyo
```

`OPENAI_MODEL` and `AI_DAILY_LIMIT` are optional; the function defaults to `gpt-5.4-mini` and 20 requests per user per day.

## Deploy

Authenticate the Supabase CLI if needed:

```bash
npx supabase login
```

Push the schema and RLS policies:

```bash
npx supabase db push --linked
```

Or push directly by project ref after linking:

```bash
npx supabase link --project-ref mclfqiugjyzpyknvrlyo
npx supabase db push --linked
```

Deploy the AI proxy:

```bash
npx supabase functions deploy explain-run --project-ref mclfqiugjyzpyknvrlyo
```

## What Gets Stored

- `profiles`: beta user profile fields owned by `auth.users.id`
- `shoes`: user-owned shoe profiles keyed by local app shoe IDs
- `pods`: user-owned pod metadata
- `calibrations`: user-owned calibration profiles
- `run_sessions`: session metadata, context, confidence, timestamps
- `run_metrics`: computed deterministic metrics and beta load scores
- `training_load_snapshots`: timestamp-aware longitudinal load snapshot
- `run_artifacts`: private storage manifest rows
- `ai_usage_daily`: per-user AI quota counters
- `ai_explanation_logs`: AI request audit log

Private storage bucket:

```text
run-bundles
```

The bucket is private. Storage policies require object paths to start with the authenticated user ID.

## Security Notes

- RLS is enabled on every public table.
- User-owned tables require `auth.uid() = user_id`.
- The OpenAI Edge Function requires a signed-in Supabase user JWT.
- The Edge Function blocks raw frames, pressure arrays, IMU fields, and unexpected metric keys before calling OpenAI.
- The app sends only whitelisted computed metrics to AI.
- Beta AI usage is capped per user per day by `ai_usage_daily`.

## Beta Checklist

Before inviting testers:

```bash
npm test
npm run build
npx tsc -p mobile-app/tsconfig.json --noEmit
npx supabase db push --linked --dry-run
```

Then confirm in Supabase Dashboard:

- Email Auth signup/sign-in settings match your beta invite plan.
- `OPENAI_API_KEY` is set under Edge Function secrets.
- Function `explain-run` is deployed with JWT verification enabled.
- Tables have RLS enabled.
- Storage bucket `run-bundles` is private.
