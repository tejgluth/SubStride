#pragma once

#include <Arduino.h>

static constexpr uint16_t SSLOG_VERSION = 1;
static constexpr uint16_t SSLOG_HEADER_LENGTH = 164;
static constexpr uint16_t SSLOG_FRAME_LENGTH = 58;

// Header flag bits (byte 159). Bit 0 = simulated capture, bit 1 = file closed cleanly.
// A reader that sees a file without the clean-close bit should treat the trailing data as a
// possible partial/torn run and decode defensively (count frames from file size).
static constexpr uint8_t SSLOG_FLAG_SIMULATED = 0x01;
static constexpr uint8_t SSLOG_FLAG_CLEAN_CLOSE = 0x02;

struct PressureImuFrame {
  uint32_t sequence;
  uint32_t timestampMs;
  uint16_t pressure[16];
  float accel[3];
  float gyro[3];
  uint16_t flags;
};

struct SessionMetadata {
  char podId[24];
  char sessionId[40];
  char foot[8];
  char hardwareRevision[16];
  char firmwareVersion[16];
  char calibrationProfileId[32];
  uint16_t pressureHz;
  uint16_t imuHz;
  uint64_t startedAtUnixMs;
  uint8_t flags;
};
