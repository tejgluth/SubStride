#pragma once

#include <Arduino.h>
#include "sslog_format.h"

class SensorSuite {
public:
  bool begin();
  bool readFrame(PressureImuFrame& frame, bool simulatorMode);
  bool healthy() const { return _imuReady; }

private:
  bool _imuReady = false;
  uint16_t readMcp3208(uint8_t channel);
  void selectMux(uint8_t channel);
  void readPressure(uint16_t pressure[16], bool simulatorMode, uint32_t sequence);
  void readImu(float accel[3], float gyro[3], bool simulatorMode, uint32_t sequence);
};
