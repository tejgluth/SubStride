# BOM_NOTES.md

This file is not a final production BOM. It is a practical beta-build checklist.

## Already selected / assumed

- Seeed XIAO ESP32S3
- CD74HC4067 multiplexer
- MCP3208 ADC
- LSM6DSOX IMU
- 3.7 V LiPo battery
- SD card module
- pressure film/material
- copper electrodes
- PET/Mylar/Kapton/EVA-style liner layers
- 3D-printed lace-mounted pod

## Add for MVP if not already available

- microSD card and SPI microSD module
- momentary tactile or panel-mount push button
- small LED
- LED resistor, likely 220 ohm to 1 kOhm range depending LED/current
- pull-up/pull-down resistor if not using internal pull-up
- wires, strain relief, heat shrink, JST or other battery connector materials

## Battery gauge decision

Do not require a battery gauge for first MVP. If added later, use one of:

1. Basic voltage divider to ADC pin
   - cheap
   - enough for low/medium/high battery estimate
   - needs two resistors and calibration
   - consumes a tiny current unless switched

2. Fuel-gauge module
   - better percentage estimate
   - extra component
   - not needed now

## Lab availability guess

A robotics lab probably has:
- resistors
- simple LEDs
- wires
- heat shrink
- tactile buttons
- breadboard/prototyping supplies

Items less likely to be lying around:
- tiny SD card module
- JST LiPo connectors matching your battery
- very thin flexible wiring/FFC materials
- proper strain-relief materials for shoe movement
- fuel-gauge modules if you decide to add one later
