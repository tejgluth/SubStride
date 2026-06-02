import type { BadChannelFinding, CalibratedFrame, CalibrationProfile, CalibrationQuality, RawFrame, RegionLoads, ZoneStats } from "./types";
import { reorderChannelsByZone, zoneMap } from "./zoneMap";

export interface CalibrationBuildInput {
  id: string;
  podId: string;
  foot: "left" | "right" | "unknown";
  shoeId?: string;
  noLoadFrames: RawFrame[];
  dynamicFrames: RawFrame[];
  notes?: string;
}

export interface CalibrationApplyOptions {
  maxReasonableLoad?: number;
  channelMap?: typeof zoneMap;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

export function summarizeZones(noLoadFrames: RawFrame[], dynamicFrames: RawFrame[]): ZoneStats[] {
  return zoneMap.map((_, zoneIndex) => {
    const noLoad = noLoadFrames.map((frame) => frame.pressureRaw[zoneIndex] ?? 0);
    const dynamic = dynamicFrames.map((frame) => frame.pressureRaw[zoneIndex] ?? 0);
    const all = [...noLoad, ...dynamic];
    const min = all.length ? Math.min(...all) : 0;
    const max = all.length ? Math.max(...all) : 0;
    const offset = mean(noLoad);
    const dynamicRange = percentile(dynamic, 0.95) - offset;
    const gain = dynamicRange > 1 ? 1000 / dynamicRange : 1;
    const noise = stdDev(noLoad);
    const flags: string[] = [];
    if (max >= 4090) flags.push("saturated");
    if (max < 20) flags.push("stuck_low");
    if (min > 3900) flags.push("stuck_high");
    if (noise > 30) flags.push("too_noisy");
    if (dynamicRange < 25) flags.push("no_dynamic_response");
    return { offset, gain, noise, min, max, dynamicRange, flags };
  });
}

export function detectBadChannels(noLoadFrames: RawFrame[], dynamicFrames: RawFrame[]): BadChannelFinding[] {
  return summarizeZones(noLoadFrames, dynamicFrames)
    .map((stats, zoneIndex) => {
      const codes = [...stats.flags];
      const severity: CalibrationQuality = codes.includes("stuck_high") || codes.includes("stuck_low") || codes.includes("saturated")
        ? "fail"
        : codes.length > 0
          ? "warn"
          : "pass";
      return { zoneIndex, codes, severity };
    })
    .filter((finding) => finding.codes.length > 0);
}

export function buildCalibrationProfile(input: CalibrationBuildInput): CalibrationProfile {
  const stats = summarizeZones(input.noLoadFrames, input.dynamicFrames);
  const badChannels = detectBadChannels(input.noLoadFrames, input.dynamicFrames);
  const failCount = badChannels.filter((finding) => finding.severity === "fail").length;
  const warnCount = badChannels.length - failCount;
  const quality: CalibrationQuality = failCount > 0 || badChannels.length > 2 ? "fail" : warnCount > 0 ? "warn" : "pass";

  return {
    id: input.id,
    podId: input.podId,
    foot: input.foot,
    shoeId: input.shoeId,
    createdAt: new Date().toISOString(),
    zoneOffsets: stats.map((item) => item.offset),
    zoneGains: stats.map((item) => item.gain),
    noiseStats: stats.map((item) => item.noise),
    quality,
    badChannels,
    notes: input.notes
  };
}

export function computeRegionLoads(relativeLoad: number[]): RegionLoads {
  const regionLoads: RegionLoads = {
    heel: 0,
    midfoot: 0,
    forefoot: 0,
    toe: 0,
    medial: 0,
    center: 0,
    lateral: 0
  };

  zoneMap.forEach((zone, index) => {
    const value = relativeLoad[index] ?? 0;
    regionLoads[zone.region] += value;
    regionLoads[zone.side] += value;
  });
  return regionLoads;
}

export function applyCalibration(
  frames: RawFrame[],
  profile: CalibrationProfile,
  options: CalibrationApplyOptions = {}
): CalibratedFrame[] {
  const maxReasonableLoad = options.maxReasonableLoad ?? 2500;
  const channelMap = options.channelMap ?? zoneMap;

  return frames.map((frame) => {
    const pressureByZone = reorderChannelsByZone(frame.pressureRaw, channelMap);
    const qualityFlags = profile.quality === "fail" ? ["calibration_failed"] : profile.quality === "warn" ? ["calibration_warning"] : [];
    const relativeLoad = pressureByZone.map((raw, index) => {
      const offset = profile.zoneOffsets[index] ?? 0;
      const gain = profile.zoneGains[index] ?? 1;
      const value = Math.max(0, (raw - offset) * gain);
      if (value > maxReasonableLoad) qualityFlags.push(`zone_${index}_high_load`);
      return value;
    });
    const totalLoad = relativeLoad.reduce((sum, value) => sum + value, 0);
    return {
      sessionId: frame.sessionId,
      podId: frame.podId,
      foot: frame.foot,
      sequence: frame.sequence,
      timestampMs: frame.timestampMs,
      relativeLoad,
      totalLoad,
      regionLoads: computeRegionLoads(relativeLoad),
      qualityFlags: [...new Set(qualityFlags)],
      accel: frame.accel,
      gyro: frame.gyro
    };
  });
}
