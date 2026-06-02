import { z } from "zod";

export const footSideSchema = z.enum(["left", "right", "unknown"]);
export const assignedFootSchema = z.enum(["left", "right", "unknown", "unassigned"]);
export const calibrationQualitySchema = z.enum(["pass", "warn", "fail"]);

const numericArray16 = z.array(z.number()).length(16);
const vector3 = z.tuple([z.number(), z.number(), z.number()]);

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

export function validateRawFrames(frames: unknown[]) {
  return z.array(rawFrameSchema).parse(frames);
}
