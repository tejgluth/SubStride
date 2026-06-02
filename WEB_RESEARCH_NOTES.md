# WEB_RESEARCH_NOTES.md

These notes summarize current high-level sources that informed the scaffold. Agents should still verify implementation details from official docs during coding.

## Hardware

- Seeed XIAO ESP32S3 has BLE 5.0 and 8 MB flash / 8 MB PSRAM according to Seeed documentation.
- Seeed documents that XIAO ESP32S3 can be powered/charged by a LiPo battery, but battery voltage is not automatically exposed to software through a dedicated readable GPIO. A voltage divider to an ADC pin is needed if battery voltage monitoring is required.
- ESP32-S3 supports light sleep and deep sleep modes according to Espressif documentation.

## Mobile app

- Expo BLE work requires native modules/development builds, not plain Expo Go.
- iOS beta distribution can be handled later with EAS/internal distribution and/or TestFlight.

## Plantar pressure / gait

- Wearable plantar-pressure systems are sensitive to sensor placement, calibration, footwear, and sampling decisions.
- Running insole sampling literature suggests lower sample rates can sometimes estimate average peak force adequately, but SubStride should still start around 100 Hz if stable because gait timing, peak detection, and load-shift analysis benefit from higher temporal resolution.
