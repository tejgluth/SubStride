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
