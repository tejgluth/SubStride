# VALIDATION_PROTOCOL.md

## Purpose

This protocol exists to determine whether SubStride V1 is producing stable, repeatable, and mechanically plausible relative load data. It is not a clinical validation protocol.

## Required before trusting beta scores

1. No-load test
   - Record with no pressure on the liner.
   - Confirm all 16 zones stay near baseline and do not drift excessively.

2. Known-weight zone test
   - Apply a known dumbbell/weight to each zone or region.
   - Repeat 3 times per zone/region.
   - Confirm response direction, repeatability, and saturation behavior.

3. Standing balance test
   - Stand naturally.
   - Shift weight forward/back and medial/lateral.
   - Confirm heatmap shifts in expected directions.

4. Walking test
   - Walk 20–50 steps.
   - Confirm heel-to-toe progression and plausible cadence.

5. Treadmill run test
   - Run at easy pace.
   - Compare cadence and approximate ground contact timing against Garmin and/or slow-motion video.
   - Record side and rear video if possible.

6. Outdoor run test
   - 10–30 minute run.
   - Compare app metrics for consistency and obvious artifacts.

7. Remove/reinsert test
   - Remove and reinsert the liner in the same shoe.
   - Repeat a standing/walking test.
   - Estimate placement sensitivity.

8. Different shoe test
   - Repeat a simple walking/running test in a second shoe.
   - Confirm shoe-specific calibration or interpretation is needed.

## Metrics to report

- actual sample rate
- sample-rate jitter
- packet/frame loss
- SD write errors
- BLE sync failures
- channel noise
- stuck channels
- saturation events
- calibration quality
- step detection accuracy
- cadence error vs Garmin/video
- contact-time plausibility/error when reference is available
- zone repeatability
- user comfort
- setup time
- battery runtime if measured

## Pass/warn/fail idea

Pass:
- no stuck channels
- repeatable zone direction under known loads
- reliable step detection
- usable sync
- plausible heatmap progression

Warn:
- one questionable zone
- moderate drift
- short dropped sections
- calibration uncertainty

Fail:
- multiple broken zones
- wrong heel-to-toe progression
- severe saturation
- corrupted logs
- inability to sync

---

## Status of every validation item (added by 2026-06 audit)

**No real-hardware data exists yet. Nothing below is validated.**

### Implemented automated tests (run with `npx vitest run` — 67 tests)
- `.sslog` encode/decode round-trip, header/frame CRC, **power-loss/partial/truncated recovery**.
- `validateDecodedSession` (monotonic timestamps, zone count, ADC range, sample rate).
- Calibration bad-channel detection (stuck-low/high, saturation, noise, no-dynamic-response).
- Left/right zone mirroring (medial stays medial per foot; left-foot flag).
- Confidence gating (block on failed cal / short run / severe loss; reduce on warn/loss/bad channel).
- Training Load: gain-invariant Mechanical Load, RPE-minutes Perceived Load, weighted Total Training Load, directionality, determinism, stability, no-collapse, two-foot combine (cadence sum, distribution average, asymmetry), rotation-invariant impact proxy.
- Gait robustness: strike/toe-off detection, spurious-spike rejection, event/timestamp alignment, pause handling.
- AI guardrails: payload whitelist (no raw signals), blocked-score sent as null, prompt forbids invention/diagnosis/clinical terms, display gate.

### Synthetic-only (simulator) — NOT evidence of real-world accuracy
- The directionality "golden" checks in `scripts/validate-sample-data.ts` run on **simulator** data.
  They prove the code reacts in the right direction to idealized patterns, nothing about real feet.

### Manual validation still required (human-in-the-loop, real pods)
- Cadence vs Garmin/foot-pod; contact time + strike pattern vs slow-motion video.
- Heatmap heel→toe progression sanity; standing balance shifts.
- Remove/reinsert placement sensitivity; second-shoe behavior.

### Hardware tests still required (bench)
- No-load offsets, per-pad poke (channel map + crosstalk, on BOTH feet), known-weight loading **and unloading** (hysteresis/creep), saturation value, IMU orientation.
- Measured sample rate & jitter, SD flush stalls, **power-loss recovery on a real card**, SD missing/full.
- BLE MTU, full-log transfer time, interrupted/resumed sync, two-pod no-collision + time alignment, duplicate-import guard.
- Button/LED/deep-sleep/wake, battery runtime.

### Biomechanics assumptions still UNVALIDATED (see `BIOMECHANICS_VALIDATION_GAPS.md`)
- Pressure→load monotonicity/repeatability; channel→anatomy mapping; **left-foot wiring orientation**; IMU axis; stance-detection generalization across gaits.

---

## Calibration acceptance criteria (PLACEHOLDERS — replace with measured values)

The thresholds in `analytics/src/calibration.ts` are guesses until bench data exists:
`saturated max≥4090`, `stuck_low max<20`, `stuck_high min>3900`, `too_noisy noise>30`,
`no_dynamic_response dynamicRange<25`. Record real no-load and dynamic distributions and set these
from data before trusting calibration pass/warn/fail.

## When to BLOCK Total Training Load (implemented in `computeConfidence`)
- Calibration `fail`; < 8 detected steps; run < 15 s; packet loss > 50%; > 2 bad channels.
  Blocked runs hide the number (UI shows "unavailable") but still expose raw data in the debug tab.

## When to show LOW confidence (still scored, but flagged)
- Calibration `warn`; 8–15 steps; packet loss 10–50%; 1–2 bad channels; >5% frames flagged
  high-load/saturated; measured sample rate >20% off target; left-foot orientation unverified;
  single-foot (no asymmetry); baseline not mature.

## What data to save for debugging every run
- The raw `.sslog` (header + frames, CRCs), the decode report (`status`, `crcFailures`, `truncated`,
  `cleanClose`, `countMismatch`), the calibration profile used, `validateDecodedSession` output
  (measured sample rate, sequence gaps, out-of-range count), and the full `RunMetrics` incl.
  `confidence`. Surface these in the Validation/Debug tab; never on consumer screens.
