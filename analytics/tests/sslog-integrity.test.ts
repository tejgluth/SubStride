import { describe, expect, it } from "vitest";
import {
  decodeSslog,
  encodeSslog,
  validateDecodedSession,
  SslogCrcError,
  SSLOG_HEADER_LENGTH,
  SSLOG_FRAME_LENGTH,
} from "../src/sslog";
import { crc32 } from "../src/crc32";
import { generateSimulatorSession } from "../src/simulator";

function buildLog(frameCount = 200) {
  const session = generateSimulatorSession("normal_easy_run", { durationSeconds: frameCount / 100, sampleRateHz: 100 });
  return encodeSslog({
    podId: "SIM-LEFT",
    foot: "left",
    sessionId: session.id,
    hardwareRevision: "hw-v1",
    firmwareVersion: "fw-0.1.0",
    calibrationProfileId: "cal-sim-left",
    pressureSampleRateHz: 100,
    imuSampleRateHz: 100,
    startedAtUnixMs: 1_700_000_000_000,
    flags: 0,
    frames: session.frames.slice(0, frameCount),
  });
}

/** Zero the declared frame count (bytes 14-17) and re-stamp a valid header CRC, exactly as a pod
 * that lost power mid-run would leave the file: valid frames on disk, header count never patched. */
function simulatePowerLossNeverClosed(bytes: Uint8Array): Uint8Array {
  const copy = bytes.slice();
  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
  view.setUint32(14, 0, true); // frame count = 0
  view.setUint32(160, crc32(copy, 0, 160), true); // re-CRC the header so it is valid
  return copy;
}

describe("sslog integrity / power-loss resilience", () => {
  it("recovers ALL frames when the header frame count was never written (power loss)", () => {
    const bytes = simulatePowerLossNeverClosed(buildLog(200));
    const decoded = decodeSslog(bytes, { allowPartial: true });
    expect(decoded.decode.framesDeclared).toBe(0);
    expect(decoded.frames.length).toBe(200); // derived from file size, not the (zero) header count
    expect(decoded.decode.countMismatch).toBe(true);
    expect(decoded.decode.status).toBe("ok");
  });

  it("strict decode still throws on a corrupt frame (test contract preserved)", () => {
    const bytes = buildLog(50);
    bytes[SSLOG_HEADER_LENGTH + 10 * SSLOG_FRAME_LENGTH + 12] ^= 0xff; // flip a payload byte in frame 10
    expect(() => decodeSslog(bytes)).toThrow(SslogCrcError);
  });

  it("partial decode recovers frames before a corrupt frame and reports it", () => {
    const bytes = buildLog(50);
    bytes[SSLOG_HEADER_LENGTH + 10 * SSLOG_FRAME_LENGTH + 12] ^= 0xff;
    const decoded = decodeSslog(bytes, { allowPartial: true });
    expect(decoded.frames.length).toBe(10); // stopped at the first bad frame
    expect(decoded.decode.status).toBe("partial");
    expect(decoded.decode.crcFailures).toContain(10);
  });

  it("partial decode recovers frames when only the header CRC was damaged", () => {
    const bytes = buildLog(50);
    bytes[14] ^= 0xff; // damage declared frame count, leaving magic/layout and frame data intact
    expect(() => decodeSslog(bytes)).toThrow(SslogCrcError);

    const decoded = decodeSslog(bytes, { allowPartial: true });
    expect(decoded.frames.length).toBe(50);
    expect(decoded.decode.status).toBe("partial");
    expect(decoded.decode.headerCrcValid).toBe(false);
    expect(decoded.decode.countMismatch).toBe(true);
  });

  it("handles a torn final frame (truncated file)", () => {
    const bytes = buildLog(50);
    const torn = bytes.slice(0, bytes.length - 20); // drop part of the last frame
    expect(() => decodeSslog(torn)).toThrow(/truncated/);
    const decoded = decodeSslog(torn, { allowPartial: true });
    expect(decoded.decode.truncated).toBe(true);
    expect(decoded.frames.length).toBe(49);
    expect(decoded.decode.status).toBe("partial");
  });

  it("exposes the clean-close flag", () => {
    const clean = buildLog(20);
    // encodeSslog does not set the clean-close bit (only the firmware does on finishSession),
    // so a JS-encoded file reads cleanClose=false by design.
    expect(decodeSslog(clean).decode.cleanClose).toBe(false);
  });

  it("validateDecodedSession passes a clean session and measures the real rate", () => {
    const decoded = decodeSslog(buildLog(300));
    const validation = validateDecodedSession(decoded);
    expect(validation.ok).toBe(true);
    expect(validation.monotonicTimestamps).toBe(true);
    expect(validation.measuredSampleRateHz).toBeGreaterThan(90);
    expect(validation.measuredSampleRateHz).toBeLessThan(110);
  });

  it("validateDecodedSession flags out-of-ADC-range pressure values", () => {
    const decoded = decodeSslog(buildLog(20));
    decoded.frames[5].pressureRaw[0] = 9999; // impossible for a 12-bit ADC
    const validation = validateDecodedSession(decoded);
    expect(validation.outOfAdcRangeFrames).toBeGreaterThan(0);
    expect(validation.issues.some((i) => i.startsWith("out_of_adc_range"))).toBe(true);
  });

  it("validateDecodedSession hard-fails a wrong zone count", () => {
    const decoded = decodeSslog(buildLog(20));
    decoded.frames[2].pressureRaw = [1, 2, 3]; // not 16
    expect(validateDecodedSession(decoded).ok).toBe(false);
  });
});
