# PROMPT_1_CODEX_BACKEND_FIRMWARE_ANALYTICS.md

You are Codex running inside the `SubStride` repository. Build the functional foundation for SubStride V1. This is not a brainstorming task. Create real files, real code, real schemas, real tests, and runnable setup instructions.

## Absolute product context

SubStride V1 / SubStride Lab is a beta prototype for runners. It uses a thin 16-zone over-insole pressure liner and one lace-mounted pod per foot. Each pod records pressure and IMU data standalone during the run, then the mobile app syncs the recorded session afterward and computes gait/load/training-strain metrics.

Accuracy and biomechanics robustness matter more than speed. UX matters, but Claude Code will do the major visual redesign in Prompt 2. Your job is the reliable foundation.

Priority order:
1. Accuracy and reliable biomechanics analysis.
2. UX.
3. Scalable codebase.
4. Demo quality.
5. Speed.

## Non-negotiable decisions

- Over-insole only. Do not support under-insole MVP mode.
- 16 physically separated pressure pads per foot.
- Two-pod architecture from day one, but support one-pod sessions.
- Each pod has its own ESP32S3, battery, SD/flash logging, IMU, BLE, button, and LED.
- Phone does not need to be connected during the run.
- Local recording to SD card is primary.
- Post-run BLE sync is primary.
- ESP32S3 internal flash is not enough for normal high-frequency run logs; use it only for settings/metadata/short diagnostics.
- No required battery gauge in MVP.
- Deep sleep is required.
- Button:
  - short press starts/stops recording
  - long press enters service/pairing/reset mode
- Mobile app: React Native + Expo development build architecture, iOS-first, local-first, Supabase-ready but no Supabase keys required.
- AI/OpenAI API may be stubbed and should become functional when a key is added later.
- Numerical scores must be deterministic code, not AI.
- AI may only explain computed metrics.
- Main score: Training Strain, 0–100.
- Claims must be load/gait/strain indicators, not medical diagnosis.
- No fake biomechanics.

## Build a monorepo

Create a clean repo structure. You may adjust exact names if needed, but preserve the conceptual separation:

- `/firmware`
- `/mobile-app`
- `/analytics`
- `/docs`
- `/hardware`
- `/sample-data`
- `/tests`
- `/scripts`

Include README files and setup instructions. Make the project runnable without cloud keys and without hardware by using simulator data.

## Firmware requirements

Create firmware for Seeed XIAO ESP32S3 in PlatformIO / Arduino C++ unless you have a very strong reason not to.

Hardware:
- XIAO ESP32S3
- CD74HC4067 mux
- MCP3208 ADC
- LSM6DSOX IMU
- SD card module
- physical button
- status LED
- 3.7 V LiPo
- no required battery gauge

Firmware must include:
- editable pin map file
- hardware revision and firmware version
- pod serial/device ID
- left/right assignment support
- pressure channel scanning
- MCP3208 reading over SPI
- CD74HC4067 select logic if needed
- LSM6DSOX reading over I2C
- SD card session logging
- compact binary `.sslog` writer
- CRC/checksum or equivalent integrity checks
- session manifest file
- BLE services for device info, control, session listing, and file transfer
- button start/stop behavior
- LED status patterns
- deep sleep when idle
- USB serial debug logs for creator testing
- test/simulator mode that can write fake frames

Firmware must not compute final Training Strain or injury-risk metrics. Phone-side analytics do that.

## Sampling and log format

Choose sample rates intelligently. Start from these targets unless tests or constraints force changes:
- pressure frame rate target: 100 Hz if stable, configurable down to 50 Hz
- IMU target: 100–200 Hz if stable
- beta run duration: 30–60 minutes
- battery target: one 2-hour run or full-day standby plus one run

Create a binary log specification and implement encode/decode tests. Include:
- magic header
- format version
- pod ID
- foot side
- session ID
- hardware/firmware version
- calibration/profile references
- sample rate targets
- timestamps or monotonic milliseconds
- sequence numbers
- 16 pressure values
- IMU values
- flags
- CRC/chunk integrity

## Mobile app foundation

Create a React Native + Expo development build app foundation. It does not need final visual polish. Claude Code will improve UI later.

The app must support:
- local-first profile
- onboarding
- pod scan/pair/assign left-right
- calibration flow
- run/session list
- sync flow
- simulator mode
- session decode/import
- run summary screen
- pressure heatmap screen
- Training Strain and category scores
- hardware/data-quality error flags
- post-run questions:
  - shoe
  - surface
  - workout type
  - pain 0–10
- local storage
- Supabase-ready abstraction without requiring Supabase now
- OpenAI explanation stub that works when key is added later

Do not require login for the first local runnable build unless you can implement it without blocking local use. Architecture should make Supabase auth easy later.

## Analytics engine

Create a deterministic analytics engine, preferably TypeScript so it can run in the app. If Python is also useful for validation scripts, include it separately, but the app must not depend on Python at runtime.

Implement layers:
1. raw log decode
2. signal cleanup
3. calibration application
4. gait event detection
5. step/stance segmentation
6. per-window and run-level metrics
7. baseline comparison
8. score computation
9. deterministic explanation templates
10. AI summary prompt construction

Metrics to implement or scaffold with tested placeholders:
- cadence
- contact time estimate
- foot-strike/stance/toe-off events
- total relative load
- peak load
- cumulative load/impulse-like proxy
- load rate proxy
- medial/lateral load balance
- heel/midfoot/forefoot/toe distribution
- forefoot/metatarsal load
- heel load
- arch/midfoot load
- toe-off contribution
- impact load from pressure + IMU proxy
- fatigue shift, first half vs second half
- shoe load score
- Training Strain 0–100

Do not pretend these are clinically validated. Each metric should expose:
- value
- units/relative units
- contributing data
- reason codes
- limitations when relevant

## Baseline

Implement baseline logic:
- preliminary insights after 1 run
- baseline scoring after 3 runs
- stronger baseline comparison after 5–7 runs
- exclude/downweight bad calibration or pain-marked sessions
- compare primarily to user's own baseline, not population norms

## AI explanation layer

Create a strict prompt builder for OpenAI, but make the system work without an API key.

The AI prompt must instruct:
- do not diagnose
- do not invent metrics
- only explain computed metrics passed in JSON
- clearly state uncertainty
- use conservative language
- do not claim medical-grade accuracy
- do not claim injury prevention
- do not recommend medical action except for persistent pain or concerning symptoms, and even then phrase conservatively

The numerical analytics must work without AI.

## Calibration

Create calibration flow and data model:
- no-load baseline
- standing still
- controlled weight shift
- walking
- optional short jog
- known-weight validation mode
- per-zone offset/gain/noise statistics
- pass/warn/fail calibration quality
- shoe-linked calibration profile
- bad-channel detection:
  - stuck high
  - stuck low
  - saturated
  - too noisy
  - no dynamic response
  - cross-talk suspicion if feasible

If calibration quality fails, block confident Training Strain/risk-style scoring. Still allow debug/validation viewing.

## Sample data

Create realistic simulator sessions:
- normal easy run
- fatigued long run
- forefoot overload
- heel impact spike
- medial/lateral imbalance
- new/old shoe comparison

Simulated data must be clearly labeled as simulated.

## Tests

Include meaningful tests:
- binary encode/decode
- CRC failure detection
- calibration transform
- bad-channel detection
- gait event detection on synthetic data
- score bounds 0–100
- hardware/data-quality error handling
- baseline update logic
- AI prompt refuses invented metrics
- simulator sessions produce expected relative patterns

Run tests before final handoff and document results.

## Documentation

Create or update:
- root README
- firmware flashing guide
- app setup guide
- BLE spec
- binary log spec
- data schema
- analytics assumptions
- validation protocol
- hardware wiring checklist
- pin map guide
- zone map guide
- known limitations
- next steps

## Existing scaffold docs

Read these files first and preserve their locked decisions:
- `DECISIONS_LOCKED.md`
- `OPEN_ASSUMPTIONS.md`
- `HARDWARE_SPEC.md`
- `ANALYTICS_SPEC.md`
- `BLE_SPEC_DRAFT.md`
- `DATA_SCHEMA_DRAFT.md`
- `VALIDATION_PROTOCOL.md`
- `INSOLE_ZONE_MAP_NOTES.md`

## Final handoff

At the end, provide:
- exact commands to run app
- exact commands to build/upload firmware
- exact commands to run tests
- what works
- what is simulated
- what needs real hardware testing
- any assumptions you made
