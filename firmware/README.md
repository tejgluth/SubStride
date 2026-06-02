# SubStride Pod Firmware

PlatformIO / Arduino firmware foundation for the Seeed XIAO ESP32S3 pod.

## Hardware Targets

- XIAO ESP32S3
- CD74HC4067 pressure mux
- MCP3208 ADC
- LSM6DSOX IMU
- SD card module
- physical button
- status LED
- 3.7 V LiPo

SD logging is primary. ESP32S3 flash is only for small settings and diagnostic metadata.

## Quick Start

```bash
cd firmware
pio run
pio run -t upload
pio device monitor
```

Edit pins in `include/pin_map.h` before wiring. The default map is intentionally conservative and must be verified against the actual build.

## Button

- Short press: start/stop recording
- Long press: service/pairing mode

## Simulator Logging

Set `kSimulatorMode = true` in `include/config.h` to write synthetic frames to SD without sensors connected.

## BLE Services

The pod advertises as `SubStride-Pod-XXXX` and exposes services for device info, control, session listing, file transfer, and debug/status. BLE transfer is chunk-oriented; final app retry/resume behavior can be built on these characteristics.
