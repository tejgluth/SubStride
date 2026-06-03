import { crc32 } from "./crc32";
import type { FootSide, RawFrame } from "./types";

export const SSLOG_MAGIC = "SSLOG1\0\0";
export const SSLOG_VERSION = 1;
export const SSLOG_HEADER_LENGTH = 164;
export const SSLOG_FRAME_LENGTH = 58;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface SslogHeader {
  version: number;
  podId: string;
  foot: FootSide;
  sessionId: string;
  hardwareRevision: string;
  firmwareVersion: string;
  calibrationProfileId: string;
  pressureSampleRateHz: number;
  imuSampleRateHz: number;
  startedAtUnixMs: number;
  frameCount: number;
  flags: number;
}

export interface EncodeSslogInput extends Omit<SslogHeader, "version" | "frameCount"> {
  frames: RawFrame[];
}

export const SSLOG_FLAG_SIMULATED = 0x01;
export const SSLOG_FLAG_CLEAN_CLOSE = 0x02;

export type SslogDecodeStatus = "ok" | "partial" | "empty";

export interface SslogDecodeReport {
  /** "ok" = every physically present frame decoded; "partial" = stopped early (crash/corruption). */
  status: SslogDecodeStatus;
  /** Frame count declared in the header (0 when the writer never closed the file cleanly). */
  framesDeclared: number;
  /** Frames physically present given the file size: floor((size - headerLen) / frameLen). */
  framesAvailable: number;
  /** Frames actually decoded (before the first fault when allowPartial). */
  framesDecoded: number;
  /** Indices of frames whose CRC did not match. */
  crcFailures: number[];
  /** True when the file ends mid-frame (torn final write / power loss). */
  truncated: boolean;
  /** True when the header declared count disagrees with frames physically present. */
  countMismatch: boolean;
  /** True when the firmware set the clean-close flag at finishSession(). */
  cleanClose: boolean;
  /** False when allowPartial recovered a log whose header CRC was damaged. */
  headerCrcValid: boolean;
}

export interface DecodedSslog {
  header: SslogHeader;
  frames: RawFrame[];
  decode: SslogDecodeReport;
}

export class SslogCrcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SslogCrcError";
  }
}

function writeFixedString(bytes: Uint8Array, offset: number, length: number, value: string): void {
  const encoded = textEncoder.encode(value);
  bytes.fill(0, offset, offset + length);
  bytes.set(encoded.slice(0, length), offset);
}

function readFixedString(bytes: Uint8Array, offset: number, length: number): string {
  const slice = bytes.slice(offset, offset + length);
  const zero = slice.indexOf(0);
  return textDecoder.decode(zero >= 0 ? slice.slice(0, zero) : slice).trim();
}

function footToByte(foot: FootSide): number {
  if (foot === "left") return 1;
  if (foot === "right") return 2;
  return 0;
}

function byteToFoot(value: number): FootSide {
  if (value === 1) return "left";
  if (value === 2) return "right";
  return "unknown";
}

function clampUint16(value: number): number {
  return Math.max(0, Math.min(65535, Math.round(value)));
}

function clampInt16(value: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(value)));
}

export function encodeSslog(input: EncodeSslogInput): Uint8Array {
  for (const frame of input.frames) {
    if (frame.pressureRaw.length !== 16) {
      throw new Error(`Frame ${frame.sequence} has ${frame.pressureRaw.length} pressure channels; expected 16`);
    }
  }

  const length = SSLOG_HEADER_LENGTH + input.frames.length * SSLOG_FRAME_LENGTH;
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  writeFixedString(bytes, 0, 8, SSLOG_MAGIC);
  view.setUint16(8, SSLOG_VERSION, true);
  view.setUint16(10, SSLOG_HEADER_LENGTH, true);
  view.setUint16(12, SSLOG_FRAME_LENGTH, true);
  view.setUint32(14, input.frames.length, true);
  view.setFloat64(18, input.startedAtUnixMs, true);
  writeFixedString(bytes, 26, 24, input.podId);
  writeFixedString(bytes, 50, 40, input.sessionId);
  view.setUint8(90, footToByte(input.foot));
  view.setUint16(91, input.pressureSampleRateHz, true);
  view.setUint16(93, input.imuSampleRateHz, true);
  writeFixedString(bytes, 95, 16, input.hardwareRevision);
  writeFixedString(bytes, 111, 16, input.firmwareVersion);
  writeFixedString(bytes, 127, 32, input.calibrationProfileId);
  view.setUint8(159, input.flags);
  view.setUint32(160, crc32(bytes, 0, 160), true);

  input.frames.forEach((frame, index) => {
    const offset = SSLOG_HEADER_LENGTH + index * SSLOG_FRAME_LENGTH;
    view.setUint32(offset, frame.sequence, true);
    view.setUint32(offset + 4, Math.round(frame.timestampMs), true);
    for (let i = 0; i < 16; i += 1) {
      view.setUint16(offset + 8 + i * 2, clampUint16(frame.pressureRaw[i]), true);
    }
    view.setInt16(offset + 40, clampInt16(frame.accel[0] * 1000), true);
    view.setInt16(offset + 42, clampInt16(frame.accel[1] * 1000), true);
    view.setInt16(offset + 44, clampInt16(frame.accel[2] * 1000), true);
    view.setInt16(offset + 46, clampInt16(frame.gyro[0] * 10), true);
    view.setInt16(offset + 48, clampInt16(frame.gyro[1] * 10), true);
    view.setInt16(offset + 50, clampInt16(frame.gyro[2] * 10), true);
    view.setUint16(offset + 52, frame.flags, true);
    view.setUint32(offset + 54, crc32(bytes, offset, offset + 54), true);
  });

  return bytes;
}

export interface DecodeSslogOptions {
  /** Verify per-frame and header CRC32 (default true). */
  verifyCrc?: boolean;
  /**
   * Recover every good frame before the first fault instead of throwing (default false).
   * Use this for real synced logs where a power loss may have torn the final frame or the
   * writer never wrote a clean frame count. With allowPartial=false the decoder throws on
   * the first CRC failure or truncation (strict mode, used by tests).
   */
  allowPartial?: boolean;
}

export function decodeSslog(bytes: Uint8Array, options: DecodeSslogOptions = {}): DecodedSslog {
  const verifyCrc = options.verifyCrc ?? true;
  const allowPartial = options.allowPartial ?? false;
  if (bytes.length < SSLOG_HEADER_LENGTH) {
    throw new Error(`SSLOG too short: ${bytes.length} bytes`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = readFixedString(bytes, 0, 8);
  if (magic !== "SSLOG1") {
    throw new Error(`Invalid SSLOG magic: ${magic}`);
  }

  const headerLength = view.getUint16(10, true);
  const frameLength = view.getUint16(12, true);
  if (headerLength !== SSLOG_HEADER_LENGTH || frameLength !== SSLOG_FRAME_LENGTH) {
    throw new Error(`Unsupported SSLOG layout header=${headerLength} frame=${frameLength}`);
  }

  const headerCrc = view.getUint32(160, true);
  const headerCrcValid = !verifyCrc || headerCrc === crc32(bytes, 0, 160);
  if (!headerCrcValid && !allowPartial) {
    throw new SslogCrcError("Header CRC mismatch");
  }

  const declaredFrameCount = view.getUint32(14, true);

  const flags = view.getUint8(159);
  // Frames physically present is derived from the file size, NOT the header count, because a
  // pod that lost power mid-run never patched the header count (it stays 0) even though valid
  // frames are on disk. Trusting the header count would silently discard a whole run.
  const framesAvailable = Math.max(0, Math.floor((bytes.length - headerLength) / frameLength));
  const truncated = bytes.length > headerLength && (bytes.length - headerLength) % frameLength !== 0;
  const countMismatch = declaredFrameCount !== framesAvailable;

  const header: SslogHeader = {
    version: view.getUint16(8, true),
    frameCount: declaredFrameCount,
    startedAtUnixMs: view.getFloat64(18, true),
    podId: readFixedString(bytes, 26, 24),
    sessionId: readFixedString(bytes, 50, 40),
    foot: byteToFoot(view.getUint8(90)),
    pressureSampleRateHz: view.getUint16(91, true),
    imuSampleRateHz: view.getUint16(93, true),
    hardwareRevision: readFixedString(bytes, 95, 16),
    firmwareVersion: readFixedString(bytes, 111, 16),
    calibrationProfileId: readFixedString(bytes, 127, 32),
    flags
  };

  if (!allowPartial && truncated) {
    throw new Error(`SSLOG truncated: trailing ${(bytes.length - headerLength) % frameLength} bytes are not a whole frame`);
  }

  const frames: RawFrame[] = [];
  const crcFailures: number[] = [];
  let stoppedEarly = false;

  for (let i = 0; i < framesAvailable; i += 1) {
    const offset = headerLength + i * frameLength;
    const frameCrc = view.getUint32(offset + 54, true);
    if (verifyCrc && frameCrc !== crc32(bytes, offset, offset + 54)) {
      crcFailures.push(i);
      if (!allowPartial) {
        throw new SslogCrcError(`Frame ${i} CRC mismatch`);
      }
      // Treat the first corrupt frame as the end of trustworthy data: everything after a
      // torn write is suspect, so stop and report a partial decode.
      stoppedEarly = true;
      break;
    }
    const pressureRaw: number[] = [];
    for (let channel = 0; channel < 16; channel += 1) {
      pressureRaw.push(view.getUint16(offset + 8 + channel * 2, true));
    }
    frames.push({
      sessionId: header.sessionId,
      podId: header.podId,
      foot: header.foot,
      sequence: view.getUint32(offset, true),
      timestampMs: view.getUint32(offset + 4, true),
      pressureRaw,
      accel: [
        view.getInt16(offset + 40, true) / 1000,
        view.getInt16(offset + 42, true) / 1000,
        view.getInt16(offset + 44, true) / 1000
      ],
      gyro: [
        view.getInt16(offset + 46, true) / 10,
        view.getInt16(offset + 48, true) / 10,
        view.getInt16(offset + 50, true) / 10
      ],
      flags: view.getUint16(offset + 52, true)
    });
  }

  const status: SslogDecodeStatus = frames.length === 0
    ? "empty"
    : stoppedEarly || truncated || frames.length < framesAvailable || !headerCrcValid
      ? "partial"
      : "ok";

  return {
    header,
    frames,
    decode: {
      status,
      framesDeclared: declaredFrameCount,
      framesAvailable,
      framesDecoded: frames.length,
      crcFailures,
      truncated,
      countMismatch,
      cleanClose: (flags & SSLOG_FLAG_CLEAN_CLOSE) !== 0,
      headerCrcValid
    }
  };
}

export interface DecodedSessionValidation {
  ok: boolean;
  issues: string[];
  monotonicTimestamps: boolean;
  measuredSampleRateHz: number | null;
  outOfAdcRangeFrames: number;
  sequenceGaps: number;
}

/**
 * Structural sanity checks on decoded frames BEFORE analytics. This is the integrity gate:
 * analytics must not run on a session that fails the hard checks (wrong zone length, non-finite
 * values). Softer issues (non-monotonic timestamps, sequence gaps, out-of-ADC-range values) are
 * reported so confidence scoring can react.
 */
export function validateDecodedSession(decoded: DecodedSslog): DecodedSessionValidation {
  const issues: string[] = [];
  const { frames } = decoded;
  if (frames.length === 0) {
    return { ok: false, issues: ["no_frames"], monotonicTimestamps: true, measuredSampleRateHz: null, outOfAdcRangeFrames: 0, sequenceGaps: 0 };
  }

  let monotonic = true;
  let sequenceGaps = 0;
  let outOfRange = 0;
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    if (frame.pressureRaw.length !== 16) issues.push(`frame_${i}_zone_count_${frame.pressureRaw.length}`);
    if (frame.pressureRaw.some((v) => !Number.isFinite(v))) issues.push(`frame_${i}_non_finite_pressure`);
    if (frame.pressureRaw.some((v) => v < 0 || v > 4095)) outOfRange += 1; // MCP3208 is 12-bit
    if (i > 0) {
      if (frame.timestampMs < frames[i - 1].timestampMs) monotonic = false;
      if (frame.sequence > frames[i - 1].sequence + 1) sequenceGaps += frame.sequence - frames[i - 1].sequence - 1;
    }
  }
  if (!monotonic) issues.push("non_monotonic_timestamps");
  if (outOfRange > 0) issues.push(`out_of_adc_range_${outOfRange}_frames`);

  const spanMs = frames[frames.length - 1].timestampMs - frames[0].timestampMs;
  const measuredSampleRateHz = spanMs > 0 ? Math.round(((frames.length - 1) / (spanMs / 1000)) * 10) / 10 : null;
  if (measuredSampleRateHz !== null && (measuredSampleRateHz < 20 || measuredSampleRateHz > 1000)) {
    issues.push(`implausible_sample_rate_${measuredSampleRateHz}`);
  }

  // Hard failures: any zone-count / non-finite issue invalidates analytics.
  const hardFail = issues.some((issue) => issue.includes("zone_count") || issue.includes("non_finite") || issue === "no_frames");
  return { ok: !hardFail, issues, monotonicTimestamps: monotonic, measuredSampleRateHz, outOfAdcRangeFrames: outOfRange, sequenceGaps };
}
