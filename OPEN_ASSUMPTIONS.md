# OPEN_ASSUMPTIONS.md

These are not blockers for Prompt 1, but Codex must either choose sensible defaults or expose config files.

## Hardware details still unknown

- Exact finished liner stack thickness.
- Exact sensor resistance ranges under no load and loaded conditions.
- Exact copper pad wiring scheme after final assembly.
- Exact SD module model.
- Exact LiPo charger board model.
- Exact button and LED parts.
- Exact pin assignments.
- Final pressure/IMU sample rates after stability testing.

## Defaults Codex should use unless hardware testing proves otherwise

- Build firmware in PlatformIO / Arduino C++.
- Use SPI for MCP3208 and SD card, with separate chip-select pins.
- Use I2C for LSM6DSOX.
- Use one editable `hardware/pin_map.*` file.
- Use one editable `hardware/zone_map.*` file.
- Use 100 Hz target pressure frame rate if stable; allow config down to 50 Hz if logging/power becomes unstable.
- Use 100–200 Hz IMU if stable.
- Use binary `.sslog` files on SD.
- Use internal flash only for settings, pod identity, calibration metadata, and very short diagnostics.
- Do not depend on cloud or API keys to run the app.
- Include demo/simulator mode.
- Treat all injury-related outputs as experimental load indicators, not diagnosis.

## Agent behavior

- Do not ask clarifying questions unless blocked from producing runnable code.
- Document assumptions.
- Prefer robust, testable implementation over fragile polish.
- Run tests after major phases.
- Never fake biomechanics.
- Never make numerical scores with AI.
