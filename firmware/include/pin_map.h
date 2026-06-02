#pragma once

#include <Arduino.h>

// Verify against the physical pod before applying power. Keep all pin values centralized here.
static constexpr int PIN_SPI_SCK = D8;
static constexpr int PIN_SPI_MISO = D9;
static constexpr int PIN_SPI_MOSI = D10;

static constexpr int PIN_ADC_CS = D7;      // MCP3208 chip select
static constexpr int PIN_SD_CS = D2;       // SD module chip select

static constexpr int PIN_MUX_S0 = D3;      // CD74HC4067 address select
static constexpr int PIN_MUX_S1 = D4;
static constexpr int PIN_MUX_S2 = D5;
static constexpr int PIN_MUX_S3 = D6;
static constexpr int PIN_MUX_EN = -1;      // set to a GPIO if EN is wired

static constexpr int PIN_I2C_SDA = SDA;    // LSM6DSOX
static constexpr int PIN_I2C_SCL = SCL;

static constexpr int PIN_BUTTON = D1;
static constexpr int PIN_STATUS_LED = LED_BUILTIN;
static constexpr int PIN_BATTERY_ADC_FUTURE = -1; // future voltage-divider hook; not required in MVP
