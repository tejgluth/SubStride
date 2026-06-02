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

function addRegion(pressure: number[], zones: number[], amount: number): void {
  const each = amount / zones.length;
  for (const zone of zones) pressure[zone] += each;
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

      addRegion(pressure, heelZones, heelLoad);
      addRegion(pressure, midfootZones, midfootLoad);
      addRegion(pressure, forefootZones, forefootLoad);
      addRegion(pressure, toeZones, toeLoad);
      accelZ += 0.12 * loadWave;

      if (scenario === "forefoot_overload") {
        addRegion(pressure, forefootZones, baseLoad * 0.42);
        addRegion(pressure, toeZones, baseLoad * 0.22);
      }
      if (scenario === "heel_impact_spike" && progress < 0.18) {
        addRegion(pressure, heelZones, baseLoad * 0.75);
        accelZ += 0.65 * (1 - progress / 0.18);
      }
      if (scenario === "medial_lateral_imbalance") {
        addSideBias(pressure, foot === "left" ? medialZones : lateralZones, baseLoad * 0.13);
      }
      if (scenario === "fatigued_long_run" && fatigueProgress > 0.5) {
        addRegion(pressure, forefootZones, baseLoad * fatigueProgress * 0.18);
        addSideBias(pressure, lateralZones, baseLoad * fatigueProgress * 0.06);
      }
      if (scenario === "new_old_shoe_comparison") {
        addRegion(pressure, heelZones, baseLoad * 0.24);
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
    normal_easy_run: ["balanced load", "stable fatigue shift", "moderate Training Strain"],
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
