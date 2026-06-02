# Hardware Notes

SubStride V1 uses one complete lace-mounted pod per foot. Left and right pods are hardware-identical and assigned in software.

Required pod components:

- Seeed XIAO ESP32S3
- CD74HC4067 mux
- MCP3208 ADC
- LSM6DSOX IMU
- SD card module
- physical button
- status LED
- 3.7 V LiPo

No battery gauge is required in MVP. If battery voltage is added later, use the documented future ADC hook in `firmware/include/pin_map.h`.

Cable routing remains locked:

- right foot exits front-right/tongue side
- left foot exits front-left/tongue side

The liner is over-insole only. Do not add under-insole software modes for V1.
