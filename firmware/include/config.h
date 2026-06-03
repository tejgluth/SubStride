#pragma once

#include <Arduino.h>

static constexpr uint16_t kPressureSampleRateHz = 100;
static constexpr uint16_t kImuSampleRateHz = 100;
static constexpr uint32_t kIdleSleepAfterMs = 10UL * 60UL * 1000UL;
static constexpr uint32_t kLongPressMs = 1800;
static constexpr uint32_t kButtonDebounceMs = 40;
static constexpr uint32_t kSessionFlushEveryFrames = 100;
static constexpr bool kSimulatorMode = false;

// --- ADC / mux signal-integrity tuning (MUST be measured on real hardware) ---
// High-impedance pressure film through the CD74HC4067 (Ron ~70 ohm) into the MCP3208
// sample-and-hold needs time to settle after switching channels. 3 us is almost certainly
// too short and will cause channel-to-channel ghosting. Increase kMuxSettleMicros and/or
// kMuxDiscardSamples until the per-pad poke test shows no crosstalk (HARDWARE_BRINGUP_CHECKLIST B).
static constexpr uint32_t kMuxSettleMicros = 25;     // settle after selecting a mux channel
static constexpr uint8_t kMuxDiscardSamples = 1;     // throw away this many conversions before keeping one

static constexpr const char* kFirmwareVersion = SUBSTRIDE_FW_VERSION;
static constexpr const char* kHardwareRevision = SUBSTRIDE_HW_REVISION;
static constexpr const char* kDefaultPodSerial = "SS-POD-0001";
static constexpr const char* kDefaultFootSide = "unknown";
