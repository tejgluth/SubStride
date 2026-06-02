import { describe, expect, it } from "vitest";
import { decodeSslog, encodeSslog, SslogCrcError } from "../src/sslog";
import { generateSimulatorSession } from "../src/simulator";

describe("sslog codec", () => {
  it("round-trips binary frames with header metadata", () => {
    const session = generateSimulatorSession("normal_easy_run", { durationSeconds: 2 });
    const bytes = encodeSslog({
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
      frames: session.frames
    });

    const decoded = decodeSslog(bytes);
    expect(decoded.header.podId).toBe("SIM-LEFT");
    expect(decoded.header.foot).toBe("left");
    expect(decoded.frames).toHaveLength(session.frames.length);
    expect(decoded.frames[10].pressureRaw).toHaveLength(16);
  });

  it("detects frame CRC failures", () => {
    const session = generateSimulatorSession("normal_easy_run", { durationSeconds: 1 });
    const bytes = encodeSslog({
      podId: "SIM-LEFT",
      foot: "left",
      sessionId: session.id,
      hardwareRevision: "hw-v1",
      firmwareVersion: "fw-0.1.0",
      calibrationProfileId: "cal-sim-left",
      pressureSampleRateHz: 100,
      imuSampleRateHz: 100,
      startedAtUnixMs: 1,
      flags: 0,
      frames: session.frames
    });
    bytes[180] = bytes[180] ^ 0xff;
    expect(() => decodeSslog(bytes)).toThrow(SslogCrcError);
  });
});
