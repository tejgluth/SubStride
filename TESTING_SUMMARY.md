# Testing Summary

## Commands run and results (2026-06 audit)

| Command | Result |
| --- | --- |
| `npm test` (`vitest run`) | ✅ **12 files, 67 tests passed** (was 15). |
| `npm run build` (`tsc -p analytics/tsconfig.json`) | ✅ exit 0, no type errors. |
| `npx tsc -p mobile-app/tsconfig.json --noEmit` | ✅ exit 0, no type errors. |
| `npx tsx scripts/generate-sample-data.ts` | ✅ regenerated 6 simulator sessions (`.json` + `.sslog`). |
| `npx tsx scripts/validate-sample-data.ts` | ✅ all sessions decode + validate; **4/4 golden directionality checks pass**. |
| PlatformIO firmware build (`pio run`) | ⚠️ **NOT RUN** — toolchain not installed in this environment. Firmware changes are source-level only (see below). |

### Sample-data validator output

```
fatigued_long_run.sslog: 4500 frames, sampleRate≈100Hz, Total Training Load 34 (confidence high)
forefoot_overload.sslog: 4500 frames, sampleRate≈100Hz, Total Training Load 21 (confidence high)
heel_impact_spike.sslog: 4500 frames, sampleRate≈100Hz, Total Training Load 45 (confidence high)
medial_lateral_imbalance.sslog: 4500 frames, sampleRate≈100Hz, Total Training Load 21 (confidence high)
new_old_shoe_comparison.sslog: 4500 frames, sampleRate≈100Hz, Total Training Load 28 (confidence high)
normal_easy_run.sslog: 4500 frames, sampleRate≈100Hz, Total Training Load 21 (confidence high)
All 4 golden directionality checks passed.
```

Note the new score distribution: normal easy run = 21 (gain-invariant baseline), heel-impact = 45,
fatigued = 34 — directionally sensible. Before the patch the same scenarios were 44 / 71 / 70 with a
score that was not invariant to calibration gain and where imbalance (77) inflated strain just by
adding load.

## Test inventory

| File | Tests | Covers |
| --- | --- | --- |
| `analytics/tests/sslog.test.ts` | 2 | round-trip, strict CRC failure |
| `analytics/tests/calibration.test.ts` | 3 | offset/gain apply, saturation, fail classification |
| `analytics/tests/gait-metrics.test.ts` | 6 | gait events, score range, cal-fail flags, baseline build, AI prompt, sim directionality |
| `analytics/tests/sslog-integrity.test.ts` | 9 | **power-loss recovery**, recoverable header CRC damage, partial/truncated decode, clean-close flag, `validateDecodedSession` |
| `analytics/tests/storage-schema.test.ts` | 2 | legacy un-enveloped storage read, explicit version mismatch rejection |
| `analytics/tests/mirroring.test.ts` | 6 | per-foot medial/lateral resolution, the left-foot inversion bug, unverified flag |
| `analytics/tests/confidence.test.ts` | 7 | block on fail-cal/short/severe-loss/bad-channels; reduce on warn/loss; determinism |
| `analytics/tests/training-strain.test.ts` | 13 | **gain invariance**, directionality, determinism, stability, no-collapse, Mechanical/Perceived/Total Load streams, two-foot combine (cadence sum, distribution avg, asymmetry), rotation-invariant impact |
| `analytics/tests/ai-guardrails.test.ts` | 6 | payload whitelist, blocked→null, prompt forbids invention/diagnosis/clinical terms, display gate |
| `analytics/tests/signal-quality.test.ts` | 11 | stuck-low/no-response/noise detection, all-zero→blocked, gait spike rejection, event/timestamp alignment, pause handling |
| `tests/mobile-beta-app-model.test.ts` | 4 | app model: pod modes, single-foot, context, baseline history |
| `tests/mobile-session-import.test.ts` | 2 | mobile `.sslog` import pipeline, packet-loss estimate from sequence gaps |
| **Total** | **67** | |

## How to re-run

```bash
npm test                                  # all 67 unit tests
npm run build                             # analytics type build
npx tsc -p mobile-app/tsconfig.json --noEmit   # mobile typecheck
npx tsx scripts/generate-sample-data.ts   # regenerate sample sessions
npx tsx scripts/validate-sample-data.ts   # decode + validate + golden directionality
```

## Environment gaps / next commands

- **Firmware build not verified.** Install PlatformIO and run from `firmware/`:
  ```bash
  pio run -e seeed_xiao_esp32s3
  ```
  Then flash and execute the bench items in `HARDWARE_BRINGUP_CHECKLIST.md`. The firmware edits were
  kept minimal and self-contained (added `config.h` includes where new constants are referenced),
  but a real compile is required before trusting them.
- **No native firmware unit tests** (`firmware/test/` is empty). The `.sslog` byte layout is asserted
  from the TS side and documented in `docs/LOG_FORMAT.md`; a PlatformIO host test mirroring
  `crc32`/header offsets is a recommended follow-up.
- **No React Native runtime/UI test run** (Expo dev build not built here). Screens are typechecked
  only; visual/behavioral verification belongs in the device beta.

## What is explicitly NOT proven by these tests

These tests prove the **code is internally correct, deterministic, and fails safe**. They do **not**
prove biomechanical accuracy — every test runs on synthetic data. Real-hardware and reference
comparisons in `VALIDATION_PROTOCOL.md` remain outstanding.
