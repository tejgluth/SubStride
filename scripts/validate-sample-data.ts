import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  applyCalibration,
  computeRunMetrics,
  decodeSslog,
  makeSimulatorCalibration,
  validateDecodedSession,
  type RunMetrics,
} from "../analytics/src/index";

const sampleDir = join(process.cwd(), "sample-data");
const files = readdirSync(sampleDir).filter((file) => file.endsWith(".sslog"));

if (files.length === 0) {
  throw new Error("No .sslog files found. Run npm run generate:sample-data first.");
}

const metricsByScenario: Record<string, RunMetrics> = {};

for (const file of files) {
  // Exercise the real integrity gate: partial-tolerant decode + structural validation.
  const decoded = decodeSslog(readFileSync(join(sampleDir, file)), { allowPartial: true });
  const validation = validateDecodedSession(decoded);
  if (!validation.ok) {
    throw new Error(`${file} failed decoded-session validation: ${validation.issues.join(", ")}`);
  }
  const calibration = makeSimulatorCalibration(decoded.header.podId, decoded.header.foot);
  const metrics = computeRunMetrics(applyCalibration(decoded.frames, calibration), { calibrationQuality: "pass" });
  if (metrics.totalTrainingLoad.value.score0To100 < 0 || metrics.totalTrainingLoad.value.score0To100 > 100) {
    throw new Error(`${file} Total Training Load out of bounds: ${metrics.totalTrainingLoad.value.score0To100}`);
  }
  metricsByScenario[file.replace(".sslog", "")] = metrics;
  console.log(
    `${file}: ${decoded.frames.length} frames, sampleRate≈${validation.measuredSampleRateHz}Hz, ` +
    `Total Training Load ${metrics.totalTrainingLoad.value.score0To100} (confidence ${metrics.confidence.level})`
  );
}

// --- Golden directional expectations (fail loudly on obviously-wrong directionality) ---
const normal = metricsByScenario.normal_easy_run;
const checks: Array<[string, boolean]> = [
  ["heel_impact has higher impact proxy than normal", metricsByScenario.heel_impact_spike.impactLoad.value > normal.impactLoad.value],
  ["forefoot_overload has higher forefoot category than normal", metricsByScenario.forefoot_overload.categoryScores.forefootMetatarsalLoad.value > normal.categoryScores.forefootMetatarsalLoad.value],
  ["medial_lateral_imbalance has lower balance than normal", metricsByScenario.medial_lateral_imbalance.medialLateralBalance.value < normal.medialLateralBalance.value],
  ["fatigued_long_run has higher Total Training Load than normal", metricsByScenario.fatigued_long_run.totalTrainingLoad.value.score0To100 > normal.totalTrainingLoad.value.score0To100],
];

const failures = checks.filter(([, pass]) => !pass).map(([name]) => name);
if (failures.length > 0) {
  throw new Error(`Golden directionality checks FAILED:\n - ${failures.join("\n - ")}`);
}
console.log(`\nAll ${checks.length} golden directionality checks passed.`);
