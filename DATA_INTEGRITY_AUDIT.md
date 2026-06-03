# Data Integrity Audit

Covers `.sslog` format, CRC, schema validation, sync, and storage.

## 1. `.sslog` format — firmware ↔ app contract

The format is defined **twice** and must stay byte-identical:

- Writer: `firmware/include/sslog_format.h` + `firmware/src/sslog_writer.cpp`
- Reader: `analytics/src/sslog.ts`
- Human spec: `docs/LOG_FORMAT.md`

Header = 164 bytes, frame = 58 bytes, little-endian. Header CRC over bytes 0–159; frame CRC over bytes 0–53. **CRC32 verified identical** between `firmware/src/crc32.cpp` and `analytics/src/crc32.ts` (IEEE 802.3, poly `0xEDB88320`, init `0xFFFFFFFF`, reflected, final XOR). A byte-offset regression test now guards the layout.

### Findings & fixes

| ID | Finding | Status |
| --- | --- | --- |
| DI-1 | **Power-loss data loss.** Header `frameCount` is 0 until clean close; decoder trusted it → 0 frames decoded after a crash even though frame data is intact. | **FIXED** — decoder derives frame count from `(fileSize − headerLength) / frameLength`, decodes until the first truncated/bad frame, and reports a status. Firmware flushes frame data during recording and stamps final count + clean-close only on clean close. |
| DI-2 | **All-or-nothing decode.** First bad frame CRC → exception → *no* frames recovered. | **FIXED** — non-strict decode recovers all good frames before the fault and marks the session `partial`. Strict mode retained for tests. |
| DI-3 | No "clean close" marker beyond the manifest. | **FIXED** — header flag bit 1 = clean close; decoder exposes `cleanClose`. |
| DI-4 | No monotonic-timestamp / sane-rate check on decoded frames. | **FIXED** — `validateDecodedSession()` flags non-monotonic timestamps, duplicate/996 backward sequences, zone-length ≠ 16, and out-of-range sample rate. |
| DI-5 | `timestampMs` is uint32 (relative ms, ~49.7-day range). Assumed relative; absolute unix would overflow. | **DOCUMENTED** — frame timestamps are pod-relative; absolute time lives in the float64 `startedAtUnixMs` header field. |
| DI-6 | `startedAtUnixMs` always 0 (no time sync). | **FIXED at firmware** (set-time command); app reconciles using phone time when 0. |
| DI-7 | Endianness of `setF64` relies on host LE. | **DOCUMENTED** — ESP32S3 is little-endian; matches JS `getFloat64(…, true)`. |
| DI-8 | Pressure values not range-checked on decode (ADC is 12-bit, 0–4095; field is uint16). | **FIXED** — `validateDecodedSession()` flags values > 4095 as `out_of_adc_range`. |

## 2. BLE sync integrity

| ID | Finding | Status |
| --- | --- | --- |
| DI-9 | App `downloadSessionLog` concatenates chunks but **never verifies CRC or decodes** before trusting bytes. Violates "no analytics on unverified file." | **DOCUMENTED + helper added.** `decodeSslog` is the gate; the app must call `decodeSslog(bytes, { allowPartial:true })` and `validateDecodedSession()` after download. The simulator-only app does not yet exercise this path — tracked as an integration TODO. |
| DI-10 | No resumable sync / no duplicate-import guard / partial sessions not marked. | **PARTIAL** — protocol supports byte offsets (resumable); dedupe must key on `podId+sessionId`; `decode.status==="partial"` now flows to the session record. App wiring is a TODO. |
| DI-11 | Two-pod sessions: no overlap/clock-alignment check. | **FIXED (lib)** — `sessionsOverlap()` / time-alignment helper added; app should warn when overlap is absent or clocks are 0. |
| DI-12 | Chunk-level integrity relies entirely on embedded frame CRCs (no per-chunk CRC at BLE layer). | **ACCEPTED** — frame/header CRCs provide end-to-end integrity; the reassembled file is verified by the decoder. |

## 3. Schemas

| ID | Finding | Status |
| --- | --- | --- |
| DI-13 | Schemas not versioned; no migration/compat path. | **FIXED** — `SCHEMA_VERSION` constant + `schemaVersion` on persisted envelopes; unknown fields tolerated (zod `.passthrough` where appropriate). |
| DI-14 | `rawFrameSchema.pressureRaw` allowed any number (negative/huge). | **FIXED** — constrained to 16 finite values; decode-time range check separate. |
| DI-15 | No schema for `PodSession`, decoded-session result, or confidence. | **FIXED** — added `podSessionSchema` and `decodedSessionMetaSchema`. |
| DI-16 | `localStore` `JSON.parse` + cast with no validation → throws or coerces wrong types on corrupt/old data. | **FIXED** — fail-safe read: try/catch, returns `undefined` on parse error, backs up the corrupt blob to `*.corrupt`, never crashes hydration. |

## 4. Left/right data separation

| ID | Finding | Status |
| --- | --- | --- |
| DI-17 | Left and right frames could be combined without explicit foot-aware logic; two-foot distribution silently used left only. | **FIXED** — combine logic is explicit; per-foot zone resolution applied; asymmetry computed only when both feet present and time-aligned. |

## Residual integrity TODOs (need app wiring or hardware)

1. Wire the real BLE download → `decodeSslog` → `validateDecodedSession` → analytics path in the app (currently sim-only).
2. Persist sync progress for resume; implement `podId+sessionId` dedupe in the import flow.
3. Confirm SD brown-out behavior (does a half-written final flush corrupt earlier frames? Frame CRCs say no, but verify on hardware).
