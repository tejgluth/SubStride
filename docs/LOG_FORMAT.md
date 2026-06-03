# SubStride `.sslog` Binary Log Format

The firmware writes compact binary `.sslog` files to SD card. The TypeScript analytics package decodes the same format.

## Targets

- Pressure: 100 Hz target, configurable down to 50 Hz
- IMU: 100 Hz currently configured, hardware can move toward 200 Hz after SD stability testing
- Duration: 30-60 minute beta runs
- Storage: SD card primary; flash is not used for normal run logs

## Header

Little-endian, fixed 164 bytes.

| Offset | Type | Field |
| --- | --- | --- |
| 0 | 8 bytes | magic `SSLOG1\0\0` |
| 8 | uint16 | format version |
| 10 | uint16 | header length |
| 12 | uint16 | frame length |
| 14 | uint32 | frame count |
| 18 | float64 | startedAtUnixMs, 0 when only monotonic time is known |
| 26 | char[24] | pod ID |
| 50 | char[40] | session ID |
| 90 | uint8 | foot side: 0 unknown, 1 left, 2 right |
| 91 | uint16 | pressure sample-rate target |
| 93 | uint16 | IMU sample-rate target |
| 95 | char[16] | hardware revision |
| 111 | char[16] | firmware version |
| 127 | char[32] | calibration profile ID/reference |
| 159 | uint8 | file flags: bit 0 = simulated, bit 1 = clean close |
| 160 | uint32 | CRC32 of bytes 0-159 |

The firmware writes an initial header with `frameCount = 0`, periodically flushes frame data, and
stamps the final `frameCount` plus clean-close bit only at `finishSession()`. It intentionally does
not rewrite the header during recording; a power cut during an in-place header rewrite can damage
the header CRC. A file missing the clean-close bit was interrupted (e.g. power loss); decode it
defensively (see below).

## Frame

Little-endian, fixed 58 bytes.

| Offset | Type | Field |
| --- | --- | --- |
| 0 | uint32 | sequence number |
| 4 | uint32 | monotonic timestamp ms |
| 8 | uint16[16] | raw pressure channels |
| 40 | int16 | accel X in g x 1000 |
| 42 | int16 | accel Y in g x 1000 |
| 44 | int16 | accel Z in g x 1000 |
| 46 | int16 | gyro X in deg/s x 10 |
| 48 | int16 | gyro Y in deg/s x 10 |
| 50 | int16 | gyro Z in deg/s x 10 |
| 52 | uint16 | frame flags |
| 54 | uint32 | CRC32 of bytes 0-53 |

The app must verify CRC before analytics. Corrupt frames are not silently repaired.

## Decoding (resilience contract)

`decodeSslog(bytes, { allowPartial, verifyCrc })` in `analytics/src/sslog.ts`:

- Derives the frame count from **file size**, never trusting the header count (a power-lost file
  has `frameCount = 0` but valid frames on disk — trusting the count would discard the whole run).
- `allowPartial: true` (use for real synced logs): recovers every CRC-valid frame up to the first
  corrupt/torn frame and returns a `decode` report (`status: ok | partial | empty`, `crcFailures`,
  `truncated`, `countMismatch`, `cleanClose`). `allowPartial: false` (default, used by tests):
  throws on the first CRC failure or truncation.
- A bad **header** CRC is fatal in strict mode. In `allowPartial: true`, the decoder may recover
  frame data if the magic and fixed layout fields are still readable; the decode report sets
  `headerCrcValid: false` and `status: partial`.

After decoding, call `validateDecodedSession(decoded)` (monotonic timestamps, 16-zone arrays,
finite + in-ADC-range values, plausible sample rate). Analytics must not run on a session whose
hard checks fail.
