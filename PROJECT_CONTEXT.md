# PROJECT_CONTEXT.md

SubStride V1 is a beta prototype for runners. It pairs one or two lace-mounted pods with a thin over-insole pressure liner. Each pod records pressure and IMU data during a run, then syncs the run to a mobile app afterward.

The central goal is not a generic fitness tracker. The central goal is accurate relative load, gait, and training-strain analysis from imperfect but useful wearable data.

## User's key preferences

- Accuracy first.
- Great UX second.
- Clean scalable architecture third.
- Demo quality fourth.
- Speed fifth.
- Avoid excessive integrations in the first beta.
- Do not make medical-device claims.
- Do not add FDA/legal workflows right now.
- Do not show raw debug complexity to normal beta users.
- Include validation/debug tools for the creator.
- Build for two pods from day one, while supporting one-pod sessions.
- Physical button start/stop is important.
- Post-run sync is the main flow.
- AI explanations are allowed only after deterministic scores are computed.

## First beta user flow

1. User opens app.
2. Creates local profile.
3. Pairs left and/or right pod.
4. Assigns foot side.
5. Selects shoe.
6. Completes calibration.
7. Starts run by pod button or app when connected.
8. Pod records standalone.
9. User stops recording.
10. App syncs session from pod after run.
11. App decodes data.
12. App computes deterministic metrics.
13. App shows run summary, heatmap, Training Strain, category scores, hardware/data-quality errors, and simple explanations.
14. Optional AI summary explains the computed metrics only.

## Non-goals for first beta

- Coach dashboard.
- App Store production deployment.
- FDA/legal compliance package.
- Full cloud data pipeline.
- GPS route collection.
- Live audio feedback.
- Production battery gauge.
- Medical diagnosis.
