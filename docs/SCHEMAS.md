# Typed Data Schemas

Typed schemas live in `analytics/src/types.ts` and runtime Zod validators live in `analytics/src/schemas.ts`.

Core entities:

- `UserProfile`
- `Pod`
- `ShoeProfile`
- `CalibrationProfile`
- `Session`
- `PodSession`
- `RawFrame`
- `CalibratedFrame`
- `RunMetrics`
- `AIInsight`

Design constraints:

- user profile and sessions are local-first
- cloud sync is optional and Supabase-ready
- calibration is shoe-linked when possible
- failed calibration is treated as a hardware/setup error but still allows debug viewing
- metrics expose value, units, contributing data, reason codes, and limitations
- numerical scores are deterministic and must not depend on AI
