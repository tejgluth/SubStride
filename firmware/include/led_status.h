#pragma once

#include <Arduino.h>

enum class LedMode {
  Idle,
  Recording,
  Sync,
  Service,
  Error
};

class LedStatus {
public:
  void begin();
  void setMode(LedMode mode);
  void tick();

private:
  LedMode _mode = LedMode::Idle;
  uint32_t _lastToggleMs = 0;
  bool _on = false;
};
