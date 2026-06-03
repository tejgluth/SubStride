# Patch Notes — 2026-06 SubStride V1 Audit

Every code/firmware/schema/test/doc change made during the audit. Grouped by subsystem.
All changes keep the build, typecheck, and tests green (see `TESTING_SUMMARY.md`).

## Analytics — data integrity

**`analytics/src/sslog.ts`**
- `decodeSslog` rewritten to be **power-loss resilient**: derives frame count from file size (not
  the header count, which is 0 after a crash), decodes frame-by-frame, and returns a `decode`
  report (`status: ok|partial|empty`, `framesDeclared/Available/Decoded`, `crcFailures`,
  `truncated`, `countMismatch`, `cleanClose`). New `allowPartial` option recovers good frames before
  the first fault; default strict mode still throws on CRC/truncation (preserves existing tests).
- Added `SSLOG_FLAG_SIMULATED` / `SSLOG_FLAG_CLEAN_CLOSE` and clean-close detection.
- Added `validateDecodedSession()` — the pre-analytics integrity gate (monotonic timestamps,
  16-zone arrays, finite + in-ADC-range values, plausible sample rate; hard-fails on structural
  problems).

## Analytics — biomechanics (left/right mirroring)

**`analytics/src/zoneMap.ts`**
- `mirroredZoneMap()` documented; added `LeftFootChannelLayout`, `DEFAULT_LEFT_FOOT_LAYOUT`
  (`"mirrored"`, documented assumption), `LEFT_FOOT_LAYOUT_VERIFIED` (false), and
  `resolveZoneMapForFoot(foot, layout)`.

**`analytics/src/calibration.ts`**
- `computeRegionLoads(relativeLoad, zoneDefs)` now takes a foot-resolved zone map (was hardcoded to
  the right-foot map → medial/lateral were inverted for the left foot).
- `applyCalibration` resolves the zone map from the profile foot, and emits a
  `left_foot_orientation_unverified` quality flag while the wiring assumption is unconfirmed.
  New `leftFootLayout` option.

## Analytics — Total Training Load, metrics, confidence

**`analytics/src/types.ts`**
- Added `ConfidenceLevel`, `ConfidenceAssessment`; added `confidence` (required) and `asymmetry`
  (optional) to `RunMetrics`; added optional `confidence` + `experimental` to `MetricValue`.

**`analytics/src/metrics.ts`**
- Added `computeConfidence()` + `MIN_STEPS_FOR_SCORE` / `MIN_DURATION_SECONDS_FOR_SCORE`; the
  previously-ignored `calibrationQuality`/`packetLossEstimate` options now drive a real
  confidence/blocking gate. `trainingStrain` carries the level and a `score_blocked_low_confidence`
  reason when blocked.
- **Mechanical Load reworked to be gain-invariant**: built from dimensionless / gain-cancelling
  components (rotation-invariant impact in g, load-rate ratio, peak/median spikiness, **directional**
  fatigue shift) × a bounded baseline volume factor. Removed the unit-mismatched `baselineFactor`
  (load-sum vs strain-mean) and the simulator-gain-tuned magic divisors.
- **Impact proxy** now uses `|‖accel‖ − 1g|` (rotation invariant) instead of `|accel_z − 1|`
  (which assumed Z = vertical). Units `g over 1g`, marked experimental.
- `fatigueShift` direction preserved (`forefoot_increasing/decreasing`); only forefoot increase
  feeds strain.
- Measured sample rate computed from timestamps and fed to confidence.
- `combineFootMetrics`: **cadence is summed** (was averaged → reported half); total/cumulative load
  summed; distribution **averaged across both feet** (was left-only); added experimental
  `asymmetry`; confidence combined to the worse level. Added `worseConfidence()`.
- Category `impactLoad` rescaled to the gain-invariant impact component; experimental metrics
  flagged.

**`analytics/src/baseline.ts`**
- Baseline now also tracks `cumulativeLoad` and `cumulativeLoadPerStep` (foot-count-invariant),
  which the strain volume factor compares against like-to-like.

## Analytics — AI guardrails

**`analytics/src/explanations.ts`**
- Added `AI_ALLOWED_METRIC_KEYS`, `buildAiPayload()` (pure whitelist projection — no frames, steps,
  pressure, or IMU samples), `canShowAiExplanation()`, `findDisallowedAiPayloadKeys()`,
  `AI_PROMPT_VERSION`.
- Blocked scores are sent to the AI as `{ value: null, blocked: true }`, never a fabricated number.
- System prompt strengthened: forbids inventing/recomputing scores, diagnosis, and clinical movement
  terms (pronation/supination/collapse), and requires reflecting confidence.
- `deterministicExplanation` now leads with the reliability caveat when the score is blocked.

## Analytics — schemas

**`analytics/src/schemas.ts`**
- Added `SCHEMA_VERSION`, `StoredEnvelope`, `wrapStored()`, `parseStored()` (versioned, fail-safe).
- Added `podSessionSchema`, `confidenceAssessmentSchema`; tightened `numericArray16`/`vector3` to
  finite numbers.

## Firmware

**`firmware/include/sslog_format.h`** — added `SSLOG_FLAG_SIMULATED` / `SSLOG_FLAG_CLEAN_CLOSE`.

**`firmware/src/sslog_writer.cpp`, `.../sslog_writer.h`**
- Frame data is flushed on every flush boundary (~1 s), but the header is not rewritten during
  recording. The decoder derives frame count from file size, avoiding the risk of corrupting the
  header during an in-place update. `finishSession()` stamps the final frame count and clean-close
  flag.

**`firmware/include/config.h`, `firmware/src/sensors.cpp`**
- Added `kMuxSettleMicros` (3 µs → 25 µs) and `kMuxDiscardSamples` (discard conversions after a mux
  switch) to fight channel-to-channel crosstalk. Values flagged TUNE-on-hardware.

**`firmware/src/main.cpp`**
- NVS **boot counter** added to the session ID → no collisions across deep-sleep reboots.
- Frame pacing uses a fixed-period accumulator (was `lastFrameMs = now`) so jitter/SD stalls don't
  drag the rate below target; resync guard for long stalls; pacing reset on record start.
- Handles the new `time:` command → populates `startedAtUnixMs`; uses `SSLOG_FLAG_SIMULATED`.

**`firmware/src/ble_services.cpp`, `.../ble_services.h`**
- Added `time:<unixMs>` control command + `pendingTimeUnixMs()` so the phone can set wall-clock for
  absolute timestamps and two-pod alignment.

## Mobile app

- `src/storage/localStore.ts`: versioned, fail-safe reads (corrupt/old blobs are backed up to a
  `.corrupt` key and the app falls back to defaults instead of crashing).
- `src/services/openAiExplanations.ts`: gated by `canShowAiExplanation` + payload whitelist check;
  returns `unavailable` rather than narrating missing/blocked data.
- `src/domain/betaAppModel.ts`: two-foot metrics now computed **per foot then combined** (was
  recomputed on interleaved two-foot frames, which corrupts gait detection); threads
  `badChannelCount`.
- `src/screens/RunSummaryScreen.tsx`: Total Training Load hero is **gated on confidence** (shows
  "unavailable" + reasons when blocked; shows confidence label otherwise).
- `App.tsx`: header strain pill shows "—" when the score is not showable.
- `src/screens/InsightsScreen.tsx`: removed "pronate/supinate" clinical claim → relative
  load-distribution language; confidence-gated insights (blocked/low banners); AI box gated.
- `src/screens/ValidationScreen.tsx`: packet-loss now from **sequence gaps** (was quality-flag
  fraction, could read 100%); added confidence + flagged-frame rows.

## Tooling / docs

- `scripts/validate-sample-data.ts`: now decodes partial-tolerantly, runs `validateDecodedSession`,
  and asserts **golden directionality** checks (fails loudly on wrong directionality).
- `docs/LOG_FORMAT.md`, `BLE_SPEC_DRAFT.md`: documented flags, resilient decode, and the `time:` command.
- New audit docs: `AUDIT_REPORT.md`, `ALGORITHM_RISK_REGISTER.md`, `BIOMECHANICS_VALIDATION_GAPS.md`,
  `FIRMWARE_BRINGUP_RISK_REGISTER.md`, `DATA_INTEGRITY_AUDIT.md`, `HARDWARE_BRINGUP_CHECKLIST.md`,
  `TESTING_SUMMARY.md`; updated `VALIDATION_PROTOCOL.md`.

## New tests (added)

`analytics/tests/`: `sslog-integrity.test.ts`, `mirroring.test.ts`, `confidence.test.ts`,
`training-strain.test.ts`, `ai-guardrails.test.ts`, `signal-quality.test.ts`
(15 → **67 passing tests**).
