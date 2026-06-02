#include "led_status.h"

#include "pin_map.h"

void LedStatus::begin() {
  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_STATUS_LED, LOW);
}

void LedStatus::setMode(LedMode mode) {
  _mode = mode;
}

void LedStatus::tick() {
  const uint32_t now = millis();
  uint32_t interval = 1200;
  if (_mode == LedMode::Recording) interval = 180;
  if (_mode == LedMode::Sync) interval = 80;
  if (_mode == LedMode::Service) interval = 450;
  if (_mode == LedMode::Error) interval = 80;
  if (now - _lastToggleMs >= interval) {
    _lastToggleMs = now;
    _on = !_on;
    digitalWrite(PIN_STATUS_LED, _on ? HIGH : LOW);
  }
}
