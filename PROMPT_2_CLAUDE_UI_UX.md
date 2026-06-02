# PROMPT_2_CLAUDE_UI_UX.md

You are Claude Code running inside the same `SubStride` repository after Codex has completed Prompt 1. Your job is to transform the working but plain app into a polished consumer-grade SubStride Lab UX while preserving the functioning backend, analytics, firmware docs, schemas, tests, and data flow.

Do not rewrite the analytics engine unless you find a clear bug. Do not replace deterministic scores with AI. Do not fake biomechanics. Do not invent metrics.

## Product feel

SubStride Lab should feel like a premium running-tech app, not a generic AI dashboard and not a raw research tool.

Design goals:
- clear
- fast
- trustworthy
- runner-focused
- scientific but understandable
- polished enough for beta testers

Avoid:
- AI-slop visuals
- meaningless gradients everywhere
- vague “health score” claims
- medical diagnosis language
- fake precision
- cluttered debug UI for normal users

## Screens to polish

Prioritize these screens:

1. Onboarding
   - explain the pod + over-insole liner
   - local-first beta
   - setup steps

2. Device pairing
   - scan for `SubStride-Pod-0001` style devices
   - assign left/right
   - show connection/sync state
   - show simple status

3. Calibration
   - no-load
   - standing
   - weight shift
   - walk/jog
   - pass/warn/fail
   - simple explanations
   - no raw numbers for normal users unless in validation/debug mode

4. Run/sync flow
   - explain that pods record standalone
   - user starts/stops with pod button
   - sync after run
   - session import progress
   - error recovery if sync fails

5. Run summary
   - Training Strain 0–100
   - category score cards
   - hardware/data-quality status
   - key changes from baseline
   - simulated/real data label

6. Pressure heatmap
   - over-insole visual based on 16 zones
   - compare left/right when both are available
   - allow one-foot mode
   - show cumulative load and peak load modes

7. Insights
   - deterministic explanation first
   - optional AI summary after metrics
   - never let AI invent scores
   - show contributing metrics under each insight

8. Trends
   - baseline-building status
   - trend over runs
   - shoe comparison summaries
   - surface/workout tags

9. Settings
   - local profile
   - shoes
   - pods
   - export
   - API key placeholders if implemented
   - developer/validation mode toggle

10. Validation/debug tab
   - hidden behind developer mode
   - session quality
   - sample rate
   - packet loss
   - bad zones
   - calibration detail
   - export tools

## Main content hierarchy

The home/run summary should lead with:

- Training Strain
- hardware/data-quality status
- top 2–3 reasons
- pressure heatmap preview
- category scores
- baseline comparison
- AI interpretation if enabled

## Wording rules

Use phrases like:
- “elevated load pattern”
- “higher than your recent baseline”
- “relative load”
- “training strain”
- “hardware error”
- “may indicate”
- “worth monitoring”

Avoid:
- “diagnosed”
- “medical-grade”
- “you will get injured”
- “prevents injury”
- “stress fracture detected”
- “plantar fasciitis detected”

## UI quality rules

- Use a consistent design system.
- Use spacing, typography, and hierarchy carefully.
- Build reusable components.
- Avoid huge walls of text.
- Make cards tappable for deeper explanations.
- Make errors actionable.
- Keep developer/debug information out of normal flow.
- Make simulator data clearly labeled.
- Ensure dark/light mode works if implemented.
- Use accessible contrast and readable font sizes.

## Do not break

Do not break:
- tests
- local simulator mode
- analytics outputs
- log decoder
- schemas
- calibration flow
- pod sync abstractions
- AI prompt safety
- TypeScript types

## Final handoff

At the end, provide:
- what UI screens changed
- how to run the app
- screenshots if your environment supports them
- known UI limitations
- what still needs hardware testing
