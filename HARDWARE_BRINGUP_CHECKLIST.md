# Hardware Bring-up Checklist

Blocking gates between "code compiles" and "trust the numbers." Nothing below has been done yet — **no real-hardware data exists.**

Legend: ☐ not started · each item lists the **pass criterion** and **where the value feeds code**.

## A. Before applying power

- ☐ Verify every pin in `firmware/include/pin_map.h` against the physical pod (SCK/MISO/MOSI, ADC CS, SD CS, MUX S0–S3/EN, I2C, button, LED). **Pass:** continuity matches schematic.
- ☐ Confirm the MCP3208 is fed by the CD74HC4067 output on ADC channel 0 (firmware reads ch0 for all 16 mux channels). If zones are spread across ADC channels, update `readPressure` only.
- ☐ Confirm left and right insole **channel→pad wiring scheme**. Decide `leftFootChannelLayout` (`"mirrored"` vs `"identical"`) — see `analytics/src/zoneMap.ts`. **This determines whether medial/lateral are correct for the left foot.**
- ☐ Confirm SD card seated, formatted FAT32.

## B. Sensor electrical bring-up

- ☐ **No-load offsets:** record 10 s untouched. **Pass:** all 16 zones stable, low noise. Record real values → replace calibration placeholder thresholds (`max>=4090`, `max<20`, `min>3900`, `noise>30`, `dynamicRange<25` in `calibration.ts`).
- ☐ **Per-pad poke test:** press each pad individually. **Pass:** only the expected zone index rises (confirms channel→`zoneMap` mapping and no crosstalk). Do this on **both** a left and a right pod.
- ☐ **Mux settling / crosstalk:** with one pad loaded, read neighbors. **Pass:** neighbor ghost < agreed %. Tune `kMuxSettleMicros` / `kMuxDiscardSamples` in `config.h` until it passes.
- ☐ **Saturation:** load a pad hard. **Pass:** approaches but the firmware/analytics flag it; record the real saturation ADC value.
- ☐ **IMU sanity:** static pod reads ‖accel‖≈1g; rotate to find which axis is "up" for the as-mounted pod. Record orientation.

## C. Timing & logging

- ☐ **Measured sample rate & jitter:** record 60 s, compute rate from frame timestamps. **Pass:** ≈100 Hz, jitter within agreed bound; no large gaps. Feeds the app's sample-rate confidence check.
- ☐ **SD flush stalls:** confirm no frame loss across the every-100-frame flush. **Pass:** sequence numbers contiguous.
- ☐ **Power-loss test (critical):** yank power mid-run. **Pass:** the partial `.sslog` decodes via `decodeSslog(bytes,{allowPartial:true})` and recovers all frames before the cut, marked `partial`. (This validates FW-1/DI-1/DI-2 fixes.)
- ☐ **Boot-counter session IDs:** start, sleep, wake, start again. **Pass:** session IDs differ (no collision).
- ☐ **SD missing / full:** boot with no card / full card. **Pass:** Error state + clear status code, no crash loop.

## D. BLE & sync

- ☐ Scan, connect, read device-info, send `time:<unixMs>` on connect. **Pass:** header `startedAtUnixMs` populated.
- ☐ Negotiate MTU; transfer a real 30–60 min log. **Pass:** reassembled file CRC-verifies; record transfer time.
- ☐ Interrupt sync mid-transfer, resume. **Pass:** resumes from offset; final file verifies.
- ☐ Two pods: record both, sync both. **Pass:** no ID collision; `sessionsOverlap()` true; asymmetry enabled.
- ☐ Duplicate-import guard: sync same session twice. **Pass:** imported once.

## E. Button / LED / power

- ☐ Short press start/stop; long press service. **Pass:** correct transitions, no accidental rapid toggles.
- ☐ LED patterns match state (idle/recording/sync/service/error).
- ☐ Deep sleep after idle; button wake. **Pass:** wakes, identity preserved.
- ☐ Battery runtime sanity (no gauge — measure wall-clock to cutoff).

## F. Calibration acceptance criteria (replace placeholders with measured values)

- ☐ Define pass/warn/fail from real no-load + dynamic data.
- ☐ Known-weight test (dumbbell on region) loading **and unloading** to measure hysteresis/creep. **Pass:** monotonic, repeatable direction across 3 trials.

## G. Biomechanics reference comparison (gates "SHOW")

- ☐ Cadence vs Garmin / foot-pod over ≥10 min. **Pass:** within agreed error.
- ☐ Ground contact + strike pattern vs slow-motion video. **Pass:** plausible, consistent.
- ☐ Heatmap progression heel→toe during stance looks correct on real walk/run.
- ☐ Remove/reinsert liner; repeat standing/walking. **Pass:** placement sensitivity documented.

---

## "Before hardware bring-up" checklist (software side — done in this audit)

- ✅ Decoder is crash/partial resilient.
- ✅ Analytics confidence-gates the score.
- ✅ Left/right mirroring wired + documented assumption.
- ✅ Score made gain-invariant + directional.
- ✅ Calibration placeholder thresholds clearly marked as TODO-from-hardware.
- ✅ AI guardrails + UI claim softening.
- ☐ Wire real BLE-download → decode → validate → analytics in the app (still sim-only).

## "First real run" checklist (do in order)

1. Send `time:<unixMs>` to each pod on connect.
2. Run the **per-pad poke test** (B) and the **power-loss test** (C) first — they validate the two scariest fixes.
3. Do a no-load + standing + walk calibration; record real thresholds.
4. Capture a 10-min treadmill run with Garmin + side video.
5. Sync both pods; confirm overlap, no dup, partial handling.
6. Open the **Validation/Debug tab** (dev mode) — confirm measured sample rate, packet loss, bad channels, per-zone offsets look sane **before** trusting any score.
7. Only then look at Training Strain — and only as a personal relative number with its confidence label.
