import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyCalibration, computeRunMetrics, encodeSslog, generateAllSimulatorSessions, makeSimulatorCalibration } from "../analytics/src/index";

const outputDir = join(process.cwd(), "sample-data");
mkdirSync(outputDir, { recursive: true });

const sessions = generateAllSimulatorSessions({ durationSeconds: 45, sampleRateHz: 100 });
for (const session of sessions) {
  const calibration = makeSimulatorCalibration(session.frames[0].podId, session.frames[0].foot);
  const metrics = computeRunMetrics(applyCalibration(session.frames, calibration), { calibrationQuality: "pass", shoeKnown: true });
  const baseName = session.scenario;
  writeFileSync(
    join(outputDir, `${baseName}.json`),
    JSON.stringify(
      {
        ...session,
        frames: session.frames.slice(0, 500),
        frameCount: session.frames.length,
        truncatedForRepository: true,
        calibration,
        metrics
      },
      null,
      2
    )
  );
  const binary = encodeSslog({
    podId: session.frames[0].podId,
    foot: session.frames[0].foot,
    sessionId: session.id,
    hardwareRevision: "sim-hw-v1",
    firmwareVersion: "sim-fw-0.1.0",
    calibrationProfileId: calibration.id,
    pressureSampleRateHz: 100,
    imuSampleRateHz: 100,
    startedAtUnixMs: Date.UTC(2026, 0, 1),
    flags: 1,
    frames: session.frames
  });
  writeFileSync(join(outputDir, `${baseName}.sslog`), binary);
}

writeFileSync(
  join(outputDir, "README.md"),
  [
    "# Sample Data",
    "",
    "These sessions are generated simulator data for development and validation. They were not collected from a human runner.",
    "",
    "Each scenario has a compact JSON preview plus a full binary `.sslog` file using the production decoder contract.",
    "",
    "- `normal_easy_run`",
    "- `fatigued_long_run`",
    "- `forefoot_overload`",
    "- `heel_impact_spike`",
    "- `medial_lateral_imbalance`",
    "- `new_old_shoe_comparison`",
    ""
  ].join("\n")
);

console.log(`Generated ${sessions.length} simulator sessions in ${outputDir}`);
