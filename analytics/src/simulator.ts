import type { FootSide, RawFrame, SimulatorSession } from "./types";

export interface SimulatorOptions {
  durationSeconds?: number;
  sampleRateHz?: number;
  foot?: FootSide;
}

const baseOffset = 120;
const heelZones = [0, 1, 2];
const midfootZones = [3, 4, 5, 6, 7];
const forefootZones = [8, 9, 10, 11, 12];
const toeZones = [13, 14, 15];
const medialZones = [0, 3, 6, 8, 13];
const lateralZones = [2, 5, 7, 12, 15];

const zoneAnatomyWeights = [
  0.31, 0.38, 0.31,
  0.12, 0.17, 0.23, 0.19, 0.29,
  0.21, 0.24, 0.23, 0.18, 0.14,
  0.54, 0.29, 0.17,
];

const footPlacementMultipliers: Record<FootSide, number[]> = {
  left: [
    1.02, 1.00, 0.98,
    1.03, 1.00, 0.97, 1.02, 0.99,
    1.04, 1.01, 0.99, 0.98, 0.96,
    1.05, 0.98, 0.95,
  ],
  right: [
    0.98, 1.01, 1.02,
    0.97, 1.00, 1.03, 0.98, 1.04,
    0.97, 1.00, 1.02, 1.03, 1.04,
    0.96, 1.01, 1.03,
  ],
  unknown: new Array(16).fill(1),
};

function phaseMultiplier(zone: number, progress: number): number {
  if (heelZones.includes(zone)) {
    if (zone === 2) return 1 + Math.max(0, 0.22 - progress) * 0.42;
    if (zone === 1) return 1 + Math.sin(Math.PI * Math.min(1, progress / 0.42)) * 0.08;
    return 1 + Math.max(0, progress - 0.18) * 0.06;
  }

  if (midfootZones.includes(zone)) {
    const midstance = Math.sin(Math.PI * Math.min(1, Math.max(0, (progress - 0.12) / 0.62)));
    if (zone === 3) return 0.92 + midstance * 0.05;
    if (zone === 7) return 1.04 + midstance * 0.05;
    return 1 + midstance * 0.03;
  }

  if (forefootZones.includes(zone)) {
    const lateStance = Math.max(0, progress - 0.45);
    if (zone === 8) return 1 + lateStance * 0.16;
    if (zone === 9 || zone === 10) return 1 + Math.sin(Math.PI * progress) * 0.04;
    if (zone === 12) return 1 - lateStance * 0.10;
  }

  if (toeZones.includes(zone)) {
    const toeOff = Math.max(0, progress - 0.62);
    if (zone === 13) return 1 + toeOff * 0.35;
    if (zone === 15) return 1 - toeOff * 0.12;
  }

  return 1;
}

function deterministicStepMultiplier(zone: number, sequence: number): number {
  return 1
    + 0.028 * Math.sin(sequence / 53 + zone * 0.73)
    + 0.016 * Math.cos(sequence / 31 + zone * 1.11);
}

function addRegion(pressure: number[], zones: number[], amount: number, foot: FootSide, sequence: number, progress: number): void {
  const weights = zones.map((zone) => {
    const weight = zoneAnatomyWeights[zone] ?? 1;
    const footPlacement = footPlacementMultipliers[foot][zone] ?? 1;
    return Math.max(0.05, weight * footPlacement * phaseMultiplier(zone, progress) * deterministicStepMultiplier(zone, sequence));
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;

  zones.forEach((zone, index) => {
    pressure[zone] += amount * (weights[index] / totalWeight);
  });
}

function addSideBias(pressure: number[], zones: number[], amount: number): void {
  for (const zone of zones) pressure[zone] += amount;
}

function makeFrame(
  sessionId: string,
  foot: FootSide,
  sequence: number,
  timestampMs: number,
  pressureRaw: number[],
  accelZ: number,
  podId = `SIM-${foot.toUpperCase()}`
): RawFrame {
  return {
    sessionId,
    podId,
    foot,
    sequence,
    timestampMs,
    pressureRaw: pressureRaw.map((value) => Math.max(0, Math.min(4095, Math.round(value)))),
    accel: [0.02 * Math.sin(sequence / 17), 0.03 * Math.cos(sequence / 31), accelZ],
    gyro: [1.2 * Math.sin(sequence / 19), 0.6 * Math.cos(sequence / 23), 0.2 * Math.sin(sequence / 29)],
    flags: 0
  };
}

export function generateSimulatorSession(
  scenario: SimulatorSession["scenario"],
  options: SimulatorOptions = {}
): SimulatorSession {
  const sampleRateHz = options.sampleRateHz ?? 100;
  const durationSeconds = options.durationSeconds ?? 45;
  const foot = options.foot ?? "left";
  const frameCount = Math.floor(sampleRateHz * durationSeconds);
  const sessionId = `sim-${scenario}-${foot}`;
  const cadencePerFoot = scenario === "fatigued_long_run" ? 82 : scenario === "heel_impact_spike" ? 86 : 84;
  const stepPeriodMs = 60000 / cadencePerFoot;
  const contactMs = scenario === "fatigued_long_run" ? 305 : 255;
  const frames: RawFrame[] = [];

  for (let i = 0; i < frameCount; i += 1) {
    const timestampMs = Math.round((i / sampleRateHz) * 1000);
    const phaseMs = timestampMs % stepPeriodMs;
    const inContact = phaseMs < contactMs;
    const progress = inContact ? phaseMs / contactMs : 0;
    const fatigueProgress = timestampMs / (durationSeconds * 1000);
    const pressure = new Array(16).fill(baseOffset + 2 * Math.sin(i / 13));
    let accelZ = 1 + 0.03 * Math.sin(i / 10);

    if (inContact) {
      const loadWave = Math.sin(Math.PI * progress);
      const baseLoad = 1400 * loadWave * (scenario === "fatigued_long_run" ? 1 + fatigueProgress * 0.18 : 1);
      const heelLoad = progress < 0.35 ? baseLoad * (1 - progress * 1.7) : baseLoad * 0.08;
      const midfootLoad = baseLoad * (progress < 0.5 ? progress : 1 - progress) * 0.55;
      const forefootLoad = baseLoad * Math.max(0, progress - 0.25) * 1.2;
      const toeLoad = baseLoad * Math.max(0, progress - 0.62) * 1.7;

      addRegion(pressure, heelZones, heelLoad, foot, i, progress);
      addRegion(pressure, midfootZones, midfootLoad, foot, i, progress);
      addRegion(pressure, forefootZones, forefootLoad, foot, i, progress);
      addRegion(pressure, toeZones, toeLoad, foot, i, progress);
      accelZ += 0.12 * loadWave;

      if (scenario === "forefoot_overload") {
        addRegion(pressure, forefootZones, baseLoad * 0.42, foot, i, progress);
        addRegion(pressure, toeZones, baseLoad * 0.22, foot, i, progress);
      }
      if (scenario === "heel_impact_spike" && progress < 0.18) {
        addRegion(pressure, heelZones, baseLoad * 0.75, foot, i, progress);
        accelZ += 0.65 * (1 - progress / 0.18);
      }
      if (scenario === "medial_lateral_imbalance") {
        addSideBias(pressure, foot === "left" ? medialZones : lateralZones, baseLoad * 0.13);
      }
      if (scenario === "fatigued_long_run" && fatigueProgress > 0.5) {
        addRegion(pressure, forefootZones, baseLoad * fatigueProgress * 0.18, foot, i, progress);
        addSideBias(pressure, lateralZones, baseLoad * fatigueProgress * 0.06);
      }
      if (scenario === "new_old_shoe_comparison") {
        addRegion(pressure, heelZones, baseLoad * 0.24, foot, i, progress);
        accelZ += 0.22 * loadWave;
      }
    }

    frames.push(makeFrame(sessionId, foot, i, timestampMs, pressure, accelZ));
  }

  const labels: Record<SimulatorSession["scenario"], string> = {
    normal_easy_run: "Simulated normal easy run",
    fatigued_long_run: "Simulated fatigued long run",
    forefoot_overload: "Simulated forefoot overload pattern",
    heel_impact_spike: "Simulated heel impact spike pattern",
    medial_lateral_imbalance: "Simulated medial/lateral imbalance pattern",
    new_old_shoe_comparison: "Simulated old-shoe comparison pattern"
  };
  const expectedPatterns: Record<SimulatorSession["scenario"], string[]> = {
    normal_easy_run: ["balanced load", "stable fatigue shift", "moderate Total Training Load"],
    fatigued_long_run: ["higher cumulative load", "larger first-half vs second-half shift"],
    forefoot_overload: ["higher forefoot/metatarsal load", "higher toe-off contribution"],
    heel_impact_spike: ["higher heel load", "higher impact proxy"],
    medial_lateral_imbalance: ["lower medial/lateral balance score"],
    new_old_shoe_comparison: ["higher impact proxy", "higher heel load compared with normal easy run"]
  };

  return {
    id: sessionId,
    label: labels[scenario],
    scenario,
    simulated: true,
    notes: "Generated simulator data for development and validation. Not collected from a human runner.",
    frames,
    expectedPatterns: expectedPatterns[scenario]
  };
}

export function generateAllSimulatorSessions(options: SimulatorOptions = {}): SimulatorSession[] {
  return [
    "normal_easy_run",
    "fatigued_long_run",
    "forefoot_overload",
    "heel_impact_spike",
    "medial_lateral_imbalance",
    "new_old_shoe_comparison"
  ].map((scenario) => generateSimulatorSession(scenario as SimulatorSession["scenario"], options));
}

export function makeSimulatorCalibration(podId = "SIM-LEFT", foot: FootSide = "left") {
  return {
    id: `cal-${podId}`,
    podId,
    foot,
    createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    zoneOffsets: new Array(16).fill(baseOffset),
    zoneGains: new Array(16).fill(1),
    noiseStats: new Array(16).fill(2),
    quality: "pass" as const,
    badChannels: [],
    notes: "Simulator calibration profile."
  };
}
