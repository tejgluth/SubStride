# HARDWARE_SPEC.md

## Overview

SubStride V1 uses two independent lace-mounted pods, one per foot. Each pod records one foot's over-insole sensor data during a run and syncs the session to the mobile app afterward.

## Foot sensor

- Placement: over-insole only.
- 16 independent physical pads.
- Pads are anatomically inspired, based on the uploaded SVG.
- Pressure material: pressure film/Velostat/Linqstat-style material with copper electrodes.
- Calibration and analytics should use relative load units, not absolute Newtons/kPa in MVP.

## Included in this scaffold

- `docs/assets/SubStrideInsolev0.svg`
- `docs/assets/SubStrideInsolev0_preview.png` if available

## Pod components

- Seeed XIAO ESP32S3
- CD74HC4067 multiplexer
- MCP3208 ADC
- LSM6DSOX IMU
- 3.7 V LiPo battery, approximately 400 mAh target
- SD card module
- One physical momentary button
- One status LED with resistor
- No extra battery gauge in MVP

## Battery reading decision

Do not implement battery percentage as a required MVP feature. The XIAO ESP32S3 can be battery-powered and charged, but the battery pin is not automatically exposed to software as a readable battery level. A voltage divider to an ADC pin would be needed for basic battery-voltage monitoring. Leave a documented future hook for this, but do not require it for first beta hardware.

## Storage decision

Use SD card as primary. ESP32S3 internal flash is too small for reliable multi-run high-frequency raw logs after firmware/filesystem overhead. Use flash only for:
- pod ID
- left/right assignment
- hardware revision
- firmware version
- calibration metadata
- pending small session manifest
- short diagnostic capture

## Button behavior

- Short press when idle: start recording.
- Short press when recording: stop recording.
- Long press: enter service/pairing/reset mode.
- LED should show idle, recording, sync, error, and low-storage/error patterns.

## Cable routing

- Right foot: front-right/tongue-side exit.
- Left foot: front-left/tongue-side exit.
- The pod clips to the laces.

## Pin map

Codex must create an editable pin map. It should not scatter pin values throughout firmware.

Required pin categories:
- MCP3208 SPI: SCK, MISO, MOSI, CS
- SD SPI: SCK, MISO, MOSI, CS
- CD74HC4067 select pins: S0, S1, S2, S3
- MUX enable pin if used
- IMU I2C: SDA, SCL
- button input
- status LED
- optional future battery ADC pin
