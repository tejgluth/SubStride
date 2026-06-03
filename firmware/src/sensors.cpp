#include "sensors.h"

#include <Adafruit_LSM6DSOX.h>
#include <SPI.h>
#include <Wire.h>

#include "config.h"
#include "pin_map.h"

static Adafruit_LSM6DSOX lsm6dsox;

bool SensorSuite::begin() {
  pinMode(PIN_ADC_CS, OUTPUT);
  digitalWrite(PIN_ADC_CS, HIGH);
  pinMode(PIN_MUX_S0, OUTPUT);
  pinMode(PIN_MUX_S1, OUTPUT);
  pinMode(PIN_MUX_S2, OUTPUT);
  pinMode(PIN_MUX_S3, OUTPUT);
  if (PIN_MUX_EN >= 0) {
    pinMode(PIN_MUX_EN, OUTPUT);
    digitalWrite(PIN_MUX_EN, LOW);
  }

  SPI.begin(PIN_SPI_SCK, PIN_SPI_MISO, PIN_SPI_MOSI);
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  _imuReady = lsm6dsox.begin_I2C();
  if (_imuReady) {
    lsm6dsox.setAccelRange(LSM6DS_ACCEL_RANGE_16_G);
    lsm6dsox.setGyroRange(LSM6DS_GYRO_RANGE_2000_DPS);
    lsm6dsox.setAccelDataRate(LSM6DS_RATE_104_HZ);
    lsm6dsox.setGyroDataRate(LSM6DS_RATE_104_HZ);
  }
  return _imuReady;
}

void SensorSuite::selectMux(uint8_t channel) {
  digitalWrite(PIN_MUX_S0, channel & 0x01);
  digitalWrite(PIN_MUX_S1, (channel >> 1) & 0x01);
  digitalWrite(PIN_MUX_S2, (channel >> 2) & 0x01);
  digitalWrite(PIN_MUX_S3, (channel >> 3) & 0x01);
  // Allow the mux output + ADC sample cap to settle. Tune kMuxSettleMicros on hardware.
  delayMicroseconds(kMuxSettleMicros);
}

uint16_t SensorSuite::readMcp3208(uint8_t channel) {
  channel &= 0x07;
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
  digitalWrite(PIN_ADC_CS, LOW);
  uint8_t command = 0b00000110 | ((channel & 0x04) >> 2);
  uint8_t high = SPI.transfer(command);
  (void)high;
  uint8_t mid = SPI.transfer((channel & 0x03) << 6);
  uint8_t low = SPI.transfer(0x00);
  digitalWrite(PIN_ADC_CS, HIGH);
  SPI.endTransaction();
  return ((mid & 0x0f) << 8) | low;
}

void SensorSuite::readPressure(uint16_t pressure[16], bool simulatorMode, uint32_t sequence) {
  if (simulatorMode) {
    const float wave = max(0.0f, sinf((sequence % 72) / 72.0f * PI));
    for (uint8_t i = 0; i < 16; ++i) {
      const bool forefoot = i >= 8 && i <= 12;
      const bool toe = i >= 13;
      pressure[i] = 120 + static_cast<uint16_t>(wave * (forefoot ? 900 : toe ? 650 : 500));
    }
    return;
  }

  for (uint8_t muxChannel = 0; muxChannel < 16; ++muxChannel) {
    selectMux(muxChannel);
    // The current hardware path reads one mux output through MCP3208 channel 0.
    // If the board is revised to spread zones across ADC channels, update this mapping only.
    // Discard the first conversion(s) after a channel switch so the previous channel's charge
    // does not bleed into this reading (crosstalk). Tune kMuxDiscardSamples on hardware.
    for (uint8_t discard = 0; discard < kMuxDiscardSamples; ++discard) {
      (void)readMcp3208(0);
    }
    pressure[muxChannel] = readMcp3208(0);
  }
}

void SensorSuite::readImu(float accel[3], float gyro[3], bool simulatorMode, uint32_t sequence) {
  if (simulatorMode || !_imuReady) {
    accel[0] = 0.02f * sinf(sequence * 0.1f);
    accel[1] = 0.01f * cosf(sequence * 0.07f);
    accel[2] = 1.0f + 0.12f * max(0.0f, sinf((sequence % 72) / 72.0f * PI));
    gyro[0] = 0.5f * sinf(sequence * 0.06f);
    gyro[1] = 0.3f * cosf(sequence * 0.08f);
    gyro[2] = 0.1f * sinf(sequence * 0.05f);
    return;
  }

  sensors_event_t accelEvent;
  sensors_event_t gyroEvent;
  sensors_event_t tempEvent;
  lsm6dsox.getEvent(&accelEvent, &gyroEvent, &tempEvent);
  accel[0] = accelEvent.acceleration.x / 9.80665f;
  accel[1] = accelEvent.acceleration.y / 9.80665f;
  accel[2] = accelEvent.acceleration.z / 9.80665f;
  gyro[0] = gyroEvent.gyro.x * 57.2957795f;
  gyro[1] = gyroEvent.gyro.y * 57.2957795f;
  gyro[2] = gyroEvent.gyro.z * 57.2957795f;
}

bool SensorSuite::readFrame(PressureImuFrame& frame, bool simulatorMode) {
  frame.timestampMs = millis();
  readPressure(frame.pressure, simulatorMode, frame.sequence);
  readImu(frame.accel, frame.gyro, simulatorMode, frame.sequence);
  frame.flags = simulatorMode ? 0x0001 : 0x0000;
  return true;
}
