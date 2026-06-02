# SubStride V1 Validation Results Template

Use this after each hardware build or firmware change. This is for mechanical plausibility and repeatability, not clinical validation.

## Build

- date:
- pod serial:
- foot:
- firmware version:
- hardware revision:
- liner revision:
- shoe:

## Recording Health

- actual pressure sample rate:
- actual IMU sample rate:
- sample-rate jitter:
- frame loss estimate:
- SD write errors:
- BLE sync failures:
- CRC failures:

## Calibration

- quality: pass / warn / fail
- stuck high channels:
- stuck low channels:
- saturated channels:
- noisy channels:
- no dynamic response channels:
- notes:

## Tests

| Test | Pass/Warn/Fail | Notes |
| --- | --- | --- |
| no-load baseline |  |  |
| known-weight zone test |  |  |
| standing balance |  |  |
| walking 20-50 steps |  |  |
| treadmill run |  |  |
| outdoor run |  |  |
| remove/reinsert |  |  |
| different shoe |  |  |

## Reference Comparisons

- Garmin cadence:
- SubStride cadence:
- video contact-time estimate:
- SubStride contact-time estimate:
- observed heel-to-toe progression:

## Decision

- usable for beta scoring: yes / no
- usable for debug viewing only: yes / no
- next hardware/software changes:
