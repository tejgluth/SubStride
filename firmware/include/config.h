#pragma once

#include <Arduino.h>

static constexpr uint16_t kPressureSampleRateHz = 100;
static constexpr uint16_t kImuSampleRateHz = 100;
static constexpr uint32_t kIdleSleepAfterMs = 10UL * 60UL * 1000UL;
static constexpr uint32_t kLongPressMs = 1800;
static constexpr uint32_t kButtonDebounceMs = 40;
static constexpr uint32_t kSessionFlushEveryFrames = 100;
static constexpr bool kSimulatorMode = false;

static constexpr const char* kFirmwareVersion = SUBSTRIDE_FW_VERSION;
static constexpr const char* kHardwareRevision = SUBSTRIDE_HW_REVISION;
static constexpr const char* kDefaultPodSerial = "SS-POD-0001";
static constexpr const char* kDefaultFootSide = "unknown";
