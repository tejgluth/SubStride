import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { applyCalibration, computeRunMetrics, decodeSslog, makeSimulatorCalibration } from "../analytics/src/index";

const sampleDir = join(process.cwd(), "sample-data");
const files = readdirSync(sampleDir).filter((file) => file.endsWith(".sslog"));

if (files.length === 0) {
  throw new Error("No .sslog files found. Run npm run generate:sample-data first.");
}

for (const file of files) {
  const decoded = decodeSslog(readFileSync(join(sampleDir, file)));
  const calibration = makeSimulatorCalibration(decoded.header.podId, decoded.header.foot);
  const metrics = computeRunMetrics(applyCalibration(decoded.frames, calibration), { calibrationQuality: "pass", shoeKnown: true });
  if (metrics.trainingStrain.value < 0 || metrics.trainingStrain.value > 100) {
    throw new Error(`${file} Training Strain out of bounds: ${metrics.trainingStrain.value}`);
  }
  console.log(`${file}: ${decoded.frames.length} frames, Training Strain ${metrics.trainingStrain.value}`);
}
