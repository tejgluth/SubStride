import { z } from "zod";

/**
 * Bump when any persisted schema changes shape. Stored envelopes carry this so the app can
 * migrate or safely discard incompatible data instead of crashing or silently mis-reading it.
 */
export const SCHEMA_VERSION = 1;

export const footSideSchema = z.enum(["left", "right", "unknown"]);
export const assignedFootSchema = z.enum(["left", "right", "unknown", "unassigned"]);
export const calibrationQualitySchema = z.enum(["pass", "warn", "fail"]);

const numericArray16 = z.array(z.number().finite()).length(16);
const vector3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

export const userProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  createdAt: z.string().datetime(),
  heightCm: z.number().positive().optional(),
  weightKg: z.number().positive().optional(),
  weeklyMileageKm: z.number().nonnegative().optional(),
  localOnly: z.boolean()
});

export const podSchema = z.object({
  id: z.string().min(1),
  serialNumber: z.string().min(1),
  nickname: z.string().optional(),
  assignedFoot: assignedFootSchema,
  firmwareVersion: z.string().min(1),
  hardwareRevision: z.string().min(1),
  lastSeenAt: z.string().datetime().optional()
});

export const shoeProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().optional(),
  model: z.string().optional(),
  size: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string().datetime()
});

export const calibrationProfileSchema = z.object({
  id: z.string().min(1),
  podId: z.string().min(1),
  foot: footSideSchema,
  shoeId: z.string().optional(),
  createdAt: z.string().datetime(),
  zoneOffsets: numericArray16,
  zoneGains: numericArray16,
  noiseStats: numericArray16,
  quality: calibrationQualitySchema,
  badChannels: z.array(
    z.object({
      zoneIndex: z.number().int().min(0).max(15),
      codes: z.array(z.string()),
      severity: calibrationQualitySchema
    })
  ),
  notes: z.string().optional()
});

export const rawFrameSchema = z.object({
  sessionId: z.string().min(1),
  podId: z.string().min(1),
  foot: footSideSchema,
  sequence: z.number().int().nonnegative(),
  timestampMs: z.number().nonnegative(),
  pressureRaw: numericArray16,
  accel: vector3,
  gyro: vector3,
  flags: z.number().int().nonnegative()
});

export const sessionSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional(),
  source: z.enum(["real_pod", "simulator", "imported"]),
  mode: z.enum(["run", "walk", "treadmill", "test", "unknown"]),
  surface: z.string().optional(),
  workoutType: z.string().optional(),
  shoeId: z.string().optional(),
  painScore0To10: z.number().int().min(0).max(10).optional(),
  podSessionIds: z.array(z.string()),
  syncStatus: z.enum(["not_synced", "partial", "synced"])
});

export const podSessionSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  podId: z.string().min(1),
  foot: footSideSchema,
  logFileName: z.string().min(1),
  startMonotonicMs: z.number().nonnegative(),
  sampleRateEstimateHz: z.number().nonnegative(),
  packetLossEstimate: z.number().min(0).max(1),
  crcStatus: z.enum(["ok", "failed", "missing"]),
  decodedStatus: z.enum(["pending", "decoded", "failed"])
});

export const confidenceAssessmentSchema = z.object({
  level: z.enum(["blocked", "low", "moderate", "high"]),
  score: z.number().min(0).max(100),
  reasonCodes: z.array(z.string()),
  blocking: z.array(z.string()),
  baselineStatus: z.enum(["none", "preliminary", "baseline_enabled", "mature"]),
  scoreShowable: z.boolean()
});

export function validateRawFrames(frames: unknown[]) {
  return z.array(rawFrameSchema).parse(frames);
}

/**
 * Versioned persistence envelope. Stored blobs are `{ schemaVersion, payload }`. On read, a
 * mismatched or unparsable envelope is rejected (the caller falls back to defaults and backs up
 * the bad blob) rather than feeding malformed data into analytics.
 */
export interface StoredEnvelope<T> {
  schemaVersion: number;
  payload: T;
}

export function wrapStored<T>(payload: T, schemaVersion = SCHEMA_VERSION): StoredEnvelope<T> {
  return { schemaVersion, payload };
}

export function parseStored<T>(raw: string | null | undefined, schema?: z.ZodType<T>): { value: T | undefined; status: "ok" | "empty" | "version_mismatch" | "corrupt" } {
  if (raw == null || raw === "") return { value: undefined, status: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { value: undefined, status: "corrupt" };
  }
  // Tolerate legacy un-enveloped blobs by reading them as-is. Only explicit envelopes are subject
  // to version mismatch handling; otherwise existing beta data would disappear on first launch.
  if (!(parsed && typeof parsed === "object" && "schemaVersion" in (parsed as object))) {
    if (schema) {
      const result = schema.safeParse(parsed);
      if (!result.success) return { value: undefined, status: "corrupt" };
      return { value: result.data, status: "ok" };
    }
    return { value: parsed as T, status: "ok" };
  }
  const envelope = parsed as StoredEnvelope<unknown>;
  if (envelope.schemaVersion !== SCHEMA_VERSION) {
    return { value: undefined, status: "version_mismatch" };
  }
  if (schema) {
    const result = schema.safeParse(envelope.payload);
    if (!result.success) return { value: undefined, status: "corrupt" };
    return { value: result.data, status: "ok" };
  }
  return { value: envelope.payload as T, status: "ok" };
}
