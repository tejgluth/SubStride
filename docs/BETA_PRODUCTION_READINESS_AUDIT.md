# SubStride Beta Production Readiness Audit

Date: 2026-06-05

This pass focused on whether the app is safe to put in front of beta runners as
a relative mechanical-load product, not as a validated medical or lab-grade
biomechanics system.

## Executive Status

SubStride is closer to beta-ready, but it is not fully production-ready until
real hardware, Supabase deployment, and AI-response monitoring are validated.
The simulator flow is usable, the analytics build passes, and the training-load
math now follows the report-3 EWMA model instead of over-accumulating repeated
easy runs. Shoe comparison and risk-signal logic now have focused edge-case
tests for condition matching, outliers, cold start, and painful-run context.

The most important remaining risk is validation: the product can show useful
relative load, heatmap, and coaching signals, but it cannot yet claim exact
force, injury probability, braking force, leg stiffness, or validated
pronation/supination labels.

## Checks Run

- `npm test`: 82 passing tests.
- `npm run build`: passed.
- `npx tsc -p mobile-app/tsconfig.json --noEmit`: passed.
- `npm run validate:sample-data`: passed, including all golden directionality
  checks.
- `git diff --check`: passed.
- Previous iOS Simulator smoke test: app launched, onboarding skipped, run started,
  stopped, saved, synced into history, Trends viewed, Insights generated, heatmap
  progression toggled and scrubbed, Settings and Connect screens rendered.

Checks not run:

- Supabase live database advisors: Supabase CLI is not installed locally.
- Supabase Edge Function type check: Deno is not installed locally.
- PlatformIO firmware build: toolchain is not available locally.
- Real BLE, SD-card, and pod sensor validation: hardware is not available.

## Implemented During This Audit

### Training Load EWMA Correction

Issue found: longitudinal training load was using unweighted exponential impulse
sums. That made several normal easy runs accumulate into a high current-load
score too quickly. Seven normal easy simulator runs could push current load near
the upper range even though the session score was low.

Fix: `computeLongitudinalTrainingLoad` now applies the report-3 EWMA weighting:

```text
alpha = 1 - exp(-1 / tau)
contribution = runLoad * alpha * exp(-ageDays / tau)
```

This makes acute and chronic load behave like 7-day and 42-day load states,
rather than cumulative score buckets. Repeated easy runs now stabilize near
their session-load level instead of saturating.

### Risk Signal Cold-Start Gate

Issue found: the app could calculate a risk signal before it had a meaningful
chronic baseline.

Fix: the risk signal is now withheld for no-data, session-only, and
acute-provisional histories. The app can still show current load and weekly
signals, but it does not show a pseudo-precise risk value until chronic history
exists.

Additional hardening: the risk signal now has tests proving it stays gated until
at least 28 days and 3 valid saved runs exist, and that one painful run alone
does not produce a high-risk signal. Pain context is one bounded input in the
signal, not a direct injury probability.

### Shoe Score Hardening

Issue found: the Trends UI still had its own shoe-score implementation even
though a more conservative domain module existed. That duplicated UI logic used
plain means and exact-condition means, which could make sparse or outlier
histories less reliable.

Fix: Trends now imports `buildShoeScores` from the domain module. The score uses:

- only score-showable runs
- hierarchical condition matching by surface, workout type, and perceived-effort
  bucket
- no condition adjustment for a unique condition until at least one comparable
  peer run exists
- robust aggregation so one painful or extreme run does not dominate a shoe's
  summary
- a low-sample penalty for 1-2 run shoe histories
- bounded numeric inputs for odd user-entered values

Tests added for matched-condition ranking, unmatched terrain/workout behavior,
outlier resistance, blocked-run exclusion, and bounded finite scoring.

Research constraint: shoe comparisons must remain condition-adjusted because
plantar pressure is affected by speed, incline, treadmill/overground context,
cadence, shoe wear, and surface. The current beta can match on surface, workout,
and perceived effort. It cannot yet match pace, grade, or GPS terrain quality
until Garmin/GPS data is connected.

### Trends Screen Scope Correction

Issue found: the global Trends screen could include the live simulator preview
session, even before a run was saved.

Fix: app-wide current training load now uses saved run history only. The post-run
view still shows the just-completed run load, while Trends shows the saved
longitudinal state.

### OpenAI Edge Function Cost and Privacy Improvements

The Supabase Edge Function now sends OpenAI requests with:

- `store: false`
- `prompt_cache_key` scoped to a hashed user identifier
- `prompt_cache_retention: "24h"`
- `safety_identifier` set to the same hash

This should reduce avoidable storage exposure and enables prompt caching where
the request shape qualifies.

## Statistics Sanity Results

Normal easy-run session load from current sample data is 21. After the EWMA fix,
repeated saved easy runs stabilize below the session score instead of saturating:

- 1 saved easy run: current load around 2, risk withheld.
- 7 saved easy runs: current load around 10, risk withheld.
- 10 saved easy runs: current load around 12, risk withheld.
- 28 saved easy runs: current load around 16, risk withheld.
- 42 saved easy runs: current load around 16, chronic history begins.

This behavior is more realistic for beta: current load changes over hours and
days, but a few easy runs no longer create an extreme training-load state.

Sample-data session totals currently remain in a plausible beta-relative range:

- `normal_easy_run`: 21
- `forefoot_overload`: 21
- `medial_lateral_imbalance`: 21
- `new_old_shoe_comparison`: 28
- `fatigued_long_run`: 34
- `heel_impact_spike`: 45

These are relative indicators, not percentages and not absolute stress doses.

## Simulator UX Findings

Working in simulator:

- First open/onboarding flow renders.
- Start, stop, post-run check-in, and save flow works.
- Header separates current session run load from saved-history current load.
- Trends shows ATL, CTL, balance, tolerance, monotony, weekly strain, and gated
  risk state.
- AI run summary and suggestions render automatically after analysis.
- AI copy is runner-facing and gives next-run plus form suggestions.
- Heatmap progression toggle, play control, and scrubber render and respond.
- Connect screen resolves to simulated left and right pods.
- Settings and account surfaces render without visible developer-only AI routing
  text.

Observed limitations:

- The app still has simulator/lab language in some places. That is acceptable
  for internal beta but should be cleaned up for an external paid beta build.
- Heatmap color is zone-level. It can show minute differences between regions,
  but one anatomical region remains one shape. True intra-zone pressure gradients
  require denser sensor data or a validated interpolation model.
- The React Native SafeAreaView deprecation warning appears in runtime logs. It
  is not a blocking bug, but it should be cleaned up before wide beta.

## AI Summary and Suggestions

Current status:

- Requests are routed through Supabase Edge Functions, so the OpenAI API key is
  not shipped in the mobile app bundle.
- The app auto-generates run summary and suggestions after run analysis.
- The prompt receives summarized region pressure percentages and trend/load
  features, not raw pressure frames.
- The UI no longer explains technical routing to runners.

Production gaps:

- Add a small AI eval suite with fixed run payloads and expected coaching themes.
  Example: heel-heavy run should mention softer under-body landing and cadence,
  not generic app usage.
- Store and reuse summaries by run hash so repeated views do not call OpenAI
  again.
- Log model, token usage, latency, refusal/fallback status, and cached token
  counts in Supabase.
- Add a daily or monthly per-user AI cost limit for beta.

Cost recommendations:

- Keep `gpt-5.4-mini` as the default until quality is measured, because form
  advice quality matters for user trust.
- Run an A/B eval against `gpt-5.4-nano` for cheap summaries. Nano may be good
  enough for concise summaries, but it should not be assumed for form coaching
  before testing.
- Keep the prompt structured and compact. Send percentages and derived signals,
  not raw frame arrays.
- Consider reducing `max_output_tokens` after eval if suggestions stay concise.
- Use prompt caching and run-hash response caching together. Prompt caching
  reduces provider input cost when applicable; run-hash caching avoids a provider
  call entirely.

OpenAI docs checked:

- https://platform.openai.com/docs/pricing
- https://platform.openai.com/docs/guides/prompt-caching
- https://platform.openai.com/docs/api-reference/responses/create

## Supabase Readiness

Implemented or present locally:

- Supabase client integration in the mobile app.
- Auth/account screen flow.
- Runs storage and local/cloud sync plumbing.
- Edge Function route for AI summaries.
- Database migration files for beta backend schema.

Needs live verification:

- Apply migrations to the linked Supabase project.
- Deploy the Edge Function.
- Add the OpenAI API key as a Supabase secret.
- Run RLS tests with two test users to confirm users cannot read or update each
  other's profiles, runs, summaries, shoes, or device records.
- Run Supabase advisors for security and performance once the CLI or MCP tools
  are available.
- Verify the mobile app uses the production Supabase URL and anon key for the
  intended beta build.

## Hardware Readiness

Still required before external beta claims:

- Compile firmware with PlatformIO.
- Confirm each sensor channel maps to the intended foot region.
- Confirm left-foot orientation and wiring; do not show left/right medial
  balance claims until this is done.
- Measure multiplexer settling and crosstalk on real film sensors.
- Validate real sampling rate, jitter, SD flush behavior, and power-loss
  recovery.
- Validate BLE MTU, transfer speed, resume behavior, dedupe, and time sync.
- Run per-pad poke tests and compare decoded frames against expected anatomy.
- Compare cadence against Garmin or another trusted wearable.
- Compare contact timing against video.

## Metrics Safe for Beta

Safe wording:

- Relative mechanical load.
- Current training load.
- Mechanical acute and chronic load.
- Perceived load when RPE and duration are available.
- Total training load as a weighted relative indicator.
- Regional pressure distribution.
- Medial/lateral and forefoot/rearfoot balance only after foot wiring is
  confirmed.
- AI suggestions as coaching suggestions, not medical guidance.

Unsafe wording:

- Injury risk probability.
- Exact vGRF.
- Exact braking force.
- Leg stiffness.
- Validated pronation or supination labels.
- Ground-reaction force.
- Percent injury risk.

## Production-Readiness Action List

Highest priority:

1. Deploy Supabase migrations and Edge Function to the real project.
2. Add the OpenAI key as a Supabase secret and run one cloud AI request from the
   beta build.
3. Run RLS isolation tests with two users.
4. Add run-hash AI response caching.
5. Add AI eval fixtures for expected coaching behavior.
6. Replace remaining simulator/lab copy for external beta builds.
7. Replace deprecated SafeAreaView usage.
8. Run a real BLE download-to-decode-to-save-to-cloud flow.
9. Run the hardware bring-up checklist before making any biomechanics claims.
10. Add mobile end-to-end tests with Detox or Maestro for onboarding, login,
    run save, cloud sync, heatmap progression, trends, and AI summary.

Good next improvements:

- Add Garmin integration as an optional enrichment layer, not a dependency.
- Store raw mechanical dose separately from 0-100 user-facing scores.
- Add a "data confidence" banner for short runs, simulated data, missing RPE, or
  unverified hardware calibration.
- Add a beta admin dashboard for failed AI calls, sync failures, and outlier
  training-load states.
- Add alerting for Edge Function error rate and p95 latency.
- Add feature flags for AI generation and any experimental biomechanics metric.
