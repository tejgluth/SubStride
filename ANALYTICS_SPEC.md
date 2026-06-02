# ANALYTICS_SPEC.md

## Core rule

All numerical outputs must be deterministic, computed from sensor data, calibration, baseline, and explicitly coded rules/statistics. AI may only explain the already-computed results.

## Data levels

1. Raw frame
   - pod timestamp
   - sequence number
   - 16 pressure channel readings
   - IMU accelerometer
   - IMU gyroscope
   - status flags

2. Cleaned/calibrated frame
   - relative load units per zone
   - quality flags
   - normalized total load
   - filtered IMU signals

3. Gait events
   - foot strike
   - heel strike estimate when possible
   - midstance estimate
   - toe-off
   - stance/swing phase
   - step/stride segmentation

4. Per-step/per-window metrics
   - peak total load
   - cumulative load/impulse-like metric
   - load rate proxy
   - contact time
   - cadence
   - medial/lateral load balance
   - rearfoot/midfoot/forefoot load balance
   - toe-off contribution
   - impact/acceleration proxy
   - step-to-step variability

5. Run-level metrics
   - Training Strain
   - Load Balance
   - Impact Load
   - Forefoot/Metatarsal Load
   - Heel Load
   - Arch/Midfoot Load
   - Toe-Off Efficiency
   - Fatigue Shift
   - Shoe Load Score

## Baseline logic

- Run 1: show preliminary insights.
- Runs 2–3: begin preliminary baseline comparison.
- Run 3+: allow baseline-based scoring.
- Runs 5–7+: stronger baseline comparison.
- Exclude or downweight runs marked with pain/injury or bad calibration.
- Keep shoe and surface context for interpretations.
- Do not claim population-normal injury prediction in MVP.

## Calibration logic

Required calibration stages:
- no-load baseline
- standing still
- controlled weight shift
- walking steps
- optional short jog/treadmill section
- known weight/zone bench test for validation mode

Calibration outputs:
- per-zone offset
- per-zone gain/normalization
- noise level
- saturation/stuck-channel checks
- quality pass/warn/fail
- calibration profile ID
- shoe association if selected

## Hardware and data-quality errors

Block or flag results for:
- failed/warning calibration
- missing zones
- stuck or saturated channels
- high noise
- dropped packets
- low sample rate
- impossible load patterns
- walking when running analysis was expected
- unknown shoe when shoe-specific comparison is requested
- no baseline yet

## AI explanation layer

AI is optional and should be stubbed until an API key is configured.

The AI may:
- summarize computed metrics
- explain likely meaning of load shifts
- suggest conservative running-form or monitoring ideas
- compare to the user's baseline

The AI must not:
- diagnose
- invent hidden metrics
- claim medical accuracy
- claim it can prevent injury
- say someone will get injured
- use body-part injury names unless the deterministic metric directly supports the wording and the UI labels it as experimental

## Post-run UX data

Ask only:
- shoe used
- surface
- workout type
- pain 0–10
