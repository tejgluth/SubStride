# SubStride V1 / SubStride Lab

Functional foundation for the SubStride V1 beta prototype.

SubStride Lab pairs one or two lace-mounted pods with thin 16-zone over-insole pressure liners. Each pod records standalone to SD during a run, then the app syncs and computes deterministic load/gait/training-strain indicators afterward.

This foundation includes:

- `firmware`: PlatformIO / Arduino firmware for Seeed XIAO ESP32S3
- `analytics`: deterministic TypeScript analytics package
- `mobile-app`: Expo development-build React Native app shell
- `sample-data`: generated simulator sessions
- `docs`: setup, binary log format, schemas, analytics, and validation notes
- `hardware`: locked hardware notes

## Quick Start

```bash
npm install
npm test
npm run generate:sample-data
npm run validate:sample-data
```

Firmware:

```bash
cd firmware
pio run
```

Mobile app:

```bash
cd mobile-app
npm run ios
```

BLE requires an Expo development build, not Expo Go.

## Claim Boundaries

SubStride V1 reports beta load, gait, and training-strain indicators. It does not diagnose, does not claim medical-grade accuracy, and does not claim injury prevention. AI may explain computed metrics only; numerical scores are deterministic code.
