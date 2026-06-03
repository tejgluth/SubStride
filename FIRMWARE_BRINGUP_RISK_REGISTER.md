# Firmware Bring-up Risk Register

ESP32S3 firmware reviewed as if real hardware connects soon. Severity: 🟥 high / 🟧 medium / 🟩 low or fixed.

| ID | Area | Risk | Severity | Status |
| --- | --- | --- | --- | --- |
| FW-1 | SD / data integrity | Header `frameCount` written as 0 at start, patched only on clean close → **power loss = decoder reads 0 frames**, all data lost. | 🟥 | **FIXED**: decoder derives frame count from file size and can recover partial logs. Firmware flushes frame data during recording but stamps header count/clean-close only on clean close to avoid in-place header rewrite risk. |
| FW-2 | ADC / mux | Only `delayMicroseconds(3)` after mux select, no first-sample discard. High-impedance film + mux Ron will not settle → cross-channel ghosting. | 🟥 | **FIXED**: configurable settle (`kMuxSettleMicros`) + discard dummy reads (`kMuxDiscardSamples`) before the kept conversion. Values must be tuned on hardware. |
| FW-3 | Timing | 100 Hz frame pacing via `millis()` polling with `lastFrameMs = now` (no accumulator). SD flush (every 100 frames) blocks the loop for ms → dropped frames and slow drift below 100 Hz. | 🟧 | **MITIGATED**: pacing uses a fixed-period accumulator (`lastFrameMs += period`) so jitter doesn't accumulate; actual `millis()` still stored per frame so the app measures true rate. True worst-case SD-flush stall still needs on-hardware measurement. |
| FW-4 | Identity | Session ID = `serial-millis()`. After deep-sleep reboot `millis()` restarts → **session ID collision** across sleep cycles. | 🟧 | **FIXED**: NVS boot counter included in session ID (`serial-<boot>-<millis>`). |
| FW-5 | Time | BLE spec lists "set pod time" but it was not implemented; `startedAtUnixMs = 0` always → two pods cannot be aligned. | 🟧 | **SOFTWARE-WIRED**: firmware supports `time:<unixMs>` and the mobile BLE service sends it before recording. Real two-pod clock behavior still needs hardware validation. |
| FW-6 | IMU | LSM6DSOX ODR set to 104 Hz, polled at 100 Hz via `getEvent` (no FIFO). Aliasing; 104 Hz cannot capture impact transients (~need 500–1000 Hz). | 🟧 | **DOCUMENTED** as a limitation; impact metric marked experimental. Raising ODR + FIFO is a hardware-validated change, not done blind. |
| FW-7 | Robustness | `appendFrame` failure → `Error` state, but no retry, no low-storage pre-warning, no SD-full detection before write fails. | 🟧 | **PARTIAL**: added explicit error code surfacing via status JSON + LED; SD-full/near-full detection flagged as bring-up TODO (needs real card behavior). |
| FW-8 | BLE | Notify payloads up to 524 B require MTU≥527; no MTU negotiation guaranteed. File transfer reads (not pure notifies) mitigate but it's fragile. | 🟧 | **DOCUMENTED**: app should request MTU; chunk size already ≤512. Verify on iOS at bring-up. |
| FW-9 | BLE | `_pendingCommand` is a single non-atomic slot written from the BLE callback context and read in `loop()`; commands can be lost or torn. | 🟩 | **DOCUMENTED**: low impact (commands are user-paced). Recommend a small queue + `volatile`/critical section later. |
| FW-10 | Security/privacy | Open GATT: any central can pull files / send start/stop/foot commands. | 🟧 | **DOCUMENTED**: acceptable for closed beta; add bonding/whitelist before wider distribution. |
| FW-11 | Endianness | `setF64` does `memcpy` of host `double` → relies on ESP32 little-endian matching the JS `getFloat64(le)`. Works today, undocumented. | 🟩 | **DOCUMENTED** in `DATA_INTEGRITY_AUDIT.md`. |
| FW-12 | Power | Deep sleep wakes on button (ext0, level LOW). After wake it's a full reboot; NVS persists identity. Sensors not explicitly powered down (no controllable rail). | 🟩 | OK for MVP. Note: no battery gauge by design. |
| FW-13 | Button | Debounce uses press *duration* (≥40 ms short, ≥1800 ms long) on release; no detection of contact bounce mid-press, but release-time classification is adequate. | 🟩 | OK. Add bounce filtering only if hardware shows chatter. |
| FW-14 | MCP3208 | SPI command framing verified correct for single-ended ch0 read; result is 12-bit. Only ADC channel 0 used (all 16 zones via the 16:1 mux). | 🟩 | OK. If board spreads zones across ADC channels, update `readPressure` mapping only. |
| FW-15 | Rollover | `millis()` (uint32 frame timestamp) rolls at ~49.7 days; fine for ≤60-min runs but undocumented. | 🟩 | **DOCUMENTED**. |
| FW-16 | Tests | `firmware/test/` is empty; no host-buildable format test. | 🟧 | **PARTIAL**: byte-offset contract is now asserted from the TS side (`sslog.test.ts`) and documented in `LOG_FORMAT.md`; a native PlatformIO test still requires the toolchain. |

## Cannot be verified without hardware (blocking — see `HARDWARE_BRINGUP_CHECKLIST.md`)

- Actual achieved sample rate & jitter under real SD load.
- Mux settling time / crosstalk magnitude → tune `kMuxSettleMicros`, `kMuxDiscardSamples`.
- ADC noise floor, saturation thresholds, real no-load offsets (calibration constants `4090/20/3900/30/25` are placeholders).
- SD write latency, flush stalls, card-full behavior, brown-out resilience.
- BLE throughput, MTU, transfer time for a 30–60 min log.
- Deep-sleep current and wake reliability; battery runtime.
- IMU axis orientation per mounting.

## Build note

PlatformIO build was **not** run in this audit environment (no `pio`/toolchain available). Firmware changes are source-level and compile-checked by inspection only. See `TESTING_SUMMARY.md`.
