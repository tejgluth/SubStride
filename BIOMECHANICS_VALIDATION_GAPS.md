# Biomechanics Validation Gaps

What the hardware *physically measures* vs what the code *claims*. Every row here is **unvalidated** until real-hardware + reference data exist.

## What the sensor actually is

- **Over-insole**, 16 physically separated resistive/film pads, between sock/foot and the shoe's own insole.
- Measures a **relative, uncalibrated, possibly non-linear** electrical response to local normal pressure at 16 discrete points.
- Sits **above** the shoe insole → mechanically damped/redistributed vs a true plantar interface. Absolute force is not recoverable in beta.
- One IMU per pod, **lace-mounted**, arbitrary orientation, **104 Hz** ODR.

## Claims vs support

| Claim made (somewhere in code/UI) | Signal that would justify it | Reality on beta hardware | Action taken |
| --- | --- | --- | --- |
| "Tendency to **pronate / supinate**" (InsightsScreen) | Rearfoot eversion/inversion kinematics or validated medial/lateral CoP excursion | Over-insole medial/lateral *load* ratio is a weak, placement-sensitive proxy; cannot resolve subtalar motion | **Removed** wording; replaced with "medial/lateral load distribution shift (experimental)". |
| "Impact load" / impact proxy | Tibial accelerometry ≥ ~1 kHz or force-plate loading rate | 104 Hz lace IMU + over-insole load rate; misses true impact transient; orientation unknown | Kept as **experimental proxy**, made rotation-invariant, labelled "not a ground reaction force". |
| Ground contact time in ms (precise) | Validated event timing vs high-speed video / pressure plate | Threshold-based on damped over-insole signal; ±frame timing | EXPERIMENTAL until video/Garmin comparison. |
| "Toe-off contribution / efficiency" | Push-off power/force | Toe-pad load fraction; toe pads are smallest, most placement-sensitive | EXPERIMENTAL. |
| Arch/midfoot load as health signal | Validated arch loading | High/low arches load midfoot pads very differently by anatomy, not pathology | SHOW as neutral indicator; **no** "collapse"/"flat-foot" language. |
| Center of Pressure (CoP) | Zone centroid coordinates + validated loads | **No centroid coordinates exist** in `zoneMap` (only region/side labels). CoP is **not** computed — good. | Keep CoP **disabled** until centroids + validation exist (documented). |
| Newtons / kPa / %BW anywhere | Per-zone force calibration vs known weights | Not done | All units labelled "relative load"; known-weight test is in the protocol but **not executed**. |
| Injury risk / prediction | Longitudinal validated cohort | None | All injury language is "load/strain indicator"; AI forbidden from diagnosis. |
| Left vs right asymmetry | Two time-synced pods + validated per-foot metrics | Pods had no time sync; left-foot map was inverted | Mirroring fixed + time-sync command added; asymmetry marked EXPERIMENTAL pending alignment validation. |

## Assumptions that must be tested before trusting any biomechanics

1. **Pressure→load is monotonic and roughly repeatable.** Film/Velostat-style materials show hysteresis, creep, and temperature/humidity drift. The code assumes a linear `offset+gain` model. → Known-weight loading/unloading + hold tests required (`VALIDATION_PROTOCOL.md` §2). Add hysteresis handling only after measured.
2. **Channel→anatomy mapping is correct and identical to `zoneMap`.** Assembly may swap channels. → Per-pad poke test at bring-up.
3. **Left/right wiring orientation.** Code now assumes left foot is the anatomical mirror of right with **identical channel numbering** (`leftFootChannelLayout: "mirrored"`). If the left insole is wired with a different scheme, set the config and re-test. → Single-pad poke test on a *left* pod.
4. **Pad position is stable run-to-run.** Over-insole liners shift. → Remove/reinsert test; report placement sensitivity.
5. **IMU orientation/axis** unknown per mounting. Only rotation-invariant IMU features are safe. → Static orientation capture + treadmill comparison.
6. **Stance detection generalizes** across walk/easy/fast/treadmill/forefoot/heel strikers. Current thresholds were tuned on idealized simulator gait. → Multi-condition video comparison.

## Metrics safe to show in beta (relative, personal)

- Total/cumulative/peak relative load (same-length runs)
- Region distribution (heel/mid/fore/toe) and medial/lateral balance — **after** per-foot mirroring is confirmed
- Cadence — after Garmin/video check
- Training Strain — as a **personal, relative** number, gated by confidence

## Metrics that must be labelled EXPERIMENTAL

- Impact/braking proxy, load rate, ground contact time, toe-off contribution, left/right asymmetry, Shoe Load Score, Fatigue Shift magnitude.

## Claims removed or downgraded

- "Pronate/supinate" → load-distribution language.
- "Impact load" implied force → "experimental impact proxy, not GRF."
- Any implication that category 0–100 numbers are percentages or clinical severity → captioned as relative indicators.
- CoP confirmed **not** implemented (kept disabled, not faked).
