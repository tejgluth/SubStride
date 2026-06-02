# DECISIONS_LOCKED.md

These decisions are locked unless the user explicitly changes them.

## Product

- Product name: SubStride V1.
- App/system name: SubStride Lab.
- Product type: beta testing prototype, not FDA/medical device work.
- Primary users: competitive runners, casual runners, and injured runners.
- Future users: teams/coaches, but not in V1.
- Priority order:
  1. Accuracy and reliable biomechanics analysis.
  2. UX.
  3. Scalable codebase.
  4. Demo quality.
  5. Speed.

## Physical system

- MVP physical placement: **over-insole only**.
- The sensor liner sits on top of the existing shoe insole and directly under the sock/foot.
- Do not support under-insole mode in MVP.
- Pressure sensing: 16 physically separated pressure pads.
- Each pad uses copper electrode regions with pressure film/material.
- The uploaded SVG is included at `docs/assets/SubStrideInsolev0.svg`.
- The final stack thickness is unknown; code/docs should treat liner thickness as a hardware measurement to fill in later.
- Cable routing:
  - Right foot: exits from the right/front side near the tongue and routes to the lace-mounted pod.
  - Left foot: exits from the left/front side near the tongue and routes to the lace-mounted pod.
- Each foot gets its own full pod: ESP32S3, battery, SD/flash logging, IMU, BLE, button, and LED.
- Left and right pods are hardware-identical except for a left/right software assignment.

## Electronics

- MCU: Seeed XIAO ESP32S3.
- Multiplexer: CD74HC4067.
- ADC: MCP3208.
- IMU: LSM6DSOX.
- Battery: 3.7 V 400 mAh LiPo target.
- Storage: SD card primary; ESP32S3 flash fallback only for config, metadata, short diagnostic logs, and failure cases.
- Battery gauge: **not included in MVP** because no extra components should be required now.
- Deep sleep: required.
- LED: include one small status LED per pod.
- Button: include one physical button per pod.
- Button behavior:
  - Short press: start/stop recording.
  - Long press: pairing/reset/service mode.
- Firmware must be real compilable code, not pseudocode.

## Data flow

- During the run, the pod works standalone and records locally.
- The phone does not need to be connected during the run.
- After the run, the phone connects and syncs logs over BLE.
- Data should be logged in a compact binary format with CRC/checking and converted to app-readable data after sync.
- Phone-side analytics are the main computation path for beta.
- Firmware should not compute final gait/risk metrics in MVP.

## App

- Mobile-first.
- iOS-oriented beta.
- Recommended stack: React Native + Expo development build, not plain Expo Go, because BLE requires native modules.
- Distribution should be compatible with EAS internal distribution and later TestFlight/App Store.
- No polished web dashboard in V1.
- Local-first profiles for the first beta.
- Supabase-ready architecture, but no required Supabase keys for first run.
- OpenAI API integration may be stubbed/simulated at first and should work once an API key is added.
- The app must be usable in simulator/demo mode before real pod data exists.

## Analysis

- Main score: **Training Strain**, 0–100.
- “Injury risk” may appear as secondary wording or AI explanation wording, but deterministic metrics should be framed as load/gait indicators.
- Numerical scores are deterministic and computed in code.
- AI summaries may explain computed metrics, but must not invent metrics or diagnose.
- Main MVP score/category candidates:
  - Training Strain
  - Load Balance
  - Impact Load
  - Forefoot/Metatarsal Load
  - Heel Load
  - Arch/Midfoot Load
  - Toe-Off Efficiency
  - Fatigue Shift
  - Shoe Load Score
- Baseline:
  - preliminary insights after 1 run
  - baseline scoring after 3 runs
  - stronger baseline comparison after 5–7 runs
- Post-run questions should be minimal:
  - shoe
  - surface
  - workout type
  - pain 0–10

## Validation

- Validation protocol must be generated.
- User can do treadmill testing, Garmin comparison, slow-motion phone video, repeated dumbbell/known-weight tests, and remove/reinsert liner tests.
- App should block confident risk-style scoring if calibration quality fails.
- Bad calibration can still show raw/relative data in a validation/debug tab.
