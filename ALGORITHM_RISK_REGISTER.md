# Algorithm Risk Register

Every deterministic metric, its inputs, assumptions, failure modes, and beta disposition.
Disposition values:

- **SHOW** — safe to display as a personal/relative beta indicator.
- **EXPERIMENTAL** — display only with an "experimental" label and reduced confidence.
- **SCORING** — allowed to contribute to Training Strain.
- **HIDDEN/BLOCKED** — must not be presented as a confident number until validated.

Units note: there is **no validated physical unit**. "Relative load" is `max(0, (raw_adc − offset) × gain)` where gain normalizes each zone's ~95th-percentile dynamic response to ≈1000. It is **not** Newtons, kPa, or %BW.

---

## Pressure-derived metrics

| Metric | Raw inputs | Preprocessing | Assumptions | What invalidates it | Beta disposition |
| --- | --- | --- | --- | --- | --- |
| **Total relative load** (`totalRelativeLoad`) | 16 zones, all frames | offset/gain, sum per frame, sum over run | gain comparable across zones | uncalibrated gain, missing zones, saturation | SHOW (per-user only). Scales with duration — compare same-length runs. |
| **Cumulative load / impulse proxy** (`cumulativeLoad`) | per-step total load × dt | step segmentation | correct contact windows; valid dt | bad step detection, irregular dt | SCORING (normalized), SHOW as "load·s". |
| **Peak zone/stance load** (`peakLoad`) | per-step peak total load, p95 | step segmentation | peak within stance is meaningful | no steps → falls back to per-frame p95 (different meaning) | SCORING (normalized), SHOW. |
| **Load rate proxy** (`loadRateProxy`) | early-stance slope (first ~15% of contact) p90 | step segmentation | early stance = loading phase; 100 Hz adequate | low sample rate, smoothing lag, missed strike | EXPERIMENTAL → SCORING (normalized). 100 Hz under-samples true loading rate. |
| **Region distribution** heel/mid/fore/toe | zone groups | fraction of summed region load | zone→region map correct; **foot-correct mirroring** | wrong channel map, mirrored foot (now fixed), missing zone | SHOW. Fractions sum to 1. |
| **Medial/lateral balance** (`medialLateralBalance`) | medial vs lateral zone groups | `100 − |Δ|/total × 160` | medial/lateral correctly assigned **per foot** | **left-foot mirror bug (FIXED)**, missing side zone | SHOW (relative). The ×160 spread is arbitrary and now documented as a display scaling, not a physical quantity. |
| **Forefoot/metatarsal load** category | forefoot+toe fraction | `fraction × 130` clamp 0..100 | over-insole captures metatarsal load | sensor placement shift, arch-only contact | SHOW as load indicator. Multiplier is a display scaling. |
| **Heel load** category | heel fraction | `fraction × 170` | heel pads loaded at strike | forefoot strikers legitimately low | SHOW as load indicator. |
| **Arch/midfoot load** category | midfoot fraction | `fraction × 200` | midfoot pads contact ground | high-arch feet barely load midfoot → low ≠ bad | SHOW as load indicator. |
| **Toe-off contribution** category | toe fraction | `fraction × 220` | toe pads capture push-off | toe pads noisy/edge-mounted | EXPERIMENTAL. Toe pads are smallest/most placement-sensitive. |

## Time/event metrics

| Metric | Raw inputs | Assumptions | What invalidates it | Disposition |
| --- | --- | --- | --- | --- |
| **Cadence** | foot-strike events, duration | one pod = one foot; **two pods sum** (was averaged — FIXED) | missed/extra strikes, walking, irregular dt | SHOW. Validate vs Garmin/video. |
| **Ground contact time** | strike→toe-off interval | thresholds track stance | threshold too high/low, double peaks | EXPERIMENTAL until validated vs video. |
| **Stance %** | (not currently computed) | — | — | absent; candidate after validation. |
| **Step-to-step variability** | (not currently computed) | — | — | absent; recommended add. |
| **Left/right asymmetry** | per-foot metrics | both pods time-aligned | clocks unaligned, one foot only | EXPERIMENTAL (added). Requires two pods + time sync. |

## IMU-derived metrics

| Metric | Raw inputs | Assumptions | What invalidates it | Disposition |
| --- | --- | --- | --- | --- |
| **Impact/braking proxy** (`impactLoad`) | accel, load rate | ~~Z axis is vertical~~ → now **‖accel‖−1g** (rotation invariant, FIXED) | 104 Hz ODR misses true impact peaks; pod looseness | EXPERIMENTAL. Not a ground-reaction force. |

## Composite scores

### Training Strain (0–100) — `trainingStrain`

- **Inputs:** normalized cumulative load, peak load, load rate, impact proxy, directional fatigue shift, personal baseline.
- **Directionality:** every term increases with "more / more-unusual load." Verified by tests.
- **Pre-audit problems (now fixed):**
  - Unit-mismatched `baselineFactor` (load-sum vs strain-mean) → effectively constant.
  - Magic constants tuned to simulator `gain=1`; not invariant to real calibration gain.
  - `fatigueShift` used `abs()` (non-directional).
  - Could quietly saturate to 100 on bad data with full confidence.
- **Post-audit behavior:** gain-invariant normalization, directional fatigue, baseline-relative once ≥3 runs, **carries `confidence` and `blocked`**; very-bad data → blocked, not "100."
- **Disposition:** SHOW only when `confidence !== "blocked"`. Always labelled relative/beta.

### Category scores (Load Balance, Impact, Forefoot, Heel, Arch, Toe-off, Fatigue, Shoe Load)

- Mostly linear rescalings of fractions/proxies into 0–100 for display.
- **Risk:** the rescaling multipliers (130/170/200/220 etc.) are arbitrary and were chosen to "look spread out," not from data. They are fine as *relative* indicators but must **never** be read as percentages or clinical severity.
- **Shoe Load Score** mixes balance + fatigue with weak justification → EXPERIMENTAL.
- **Disposition:** SHOW as relative indicators with the existing "not medical measurements" caption; reduce confidence label when calibration is `warn`/`fail`.

---

## Cross-cutting algorithmic risks

| ID | Risk | Status |
| --- | --- | --- |
| ALG-1 | Score not invariant to calibration gain | FIXED (per-run normalization) |
| ALG-2 | Confidence/quality inputs ignored | FIXED |
| ALG-3 | Left-foot medial/lateral inverted | FIXED |
| ALG-4 | Cadence averaged across feet | FIXED |
| ALG-5 | Two-foot distribution uses left only | FIXED |
| ALG-6 | Fatigue shift non-directional | FIXED |
| ALG-7 | Impact proxy assumes vertical=Z | FIXED (magnitude) |
| ALG-8 | Magic display multipliers unjustified | DOCUMENTED (display-only) |
| ALG-9 | Thresholds (`balance<70`, `impact>65`, `fatigue>8`) absolute, not baseline-relative | PARTIALLY ADDRESSED (softened wording); needs real-data tuning |
| ALG-10 | Gait thresholds tuned to simulator scale | MITIGATED by adaptive threshold; needs real-data tuning |
| ALG-11 | No step-to-step variability / stance% (spec lists them) | OPEN (not implemented) |
| ALG-12 | Baseline can normalize an already-pathological gait as "healthy" | OPEN (documented limitation; requires reference data) |
