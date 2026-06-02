# Analytics Implementation

The deterministic analytics engine lives in `analytics/src`.

Pipeline:

1. Decode `.sslog` binary data and verify CRC.
2. Reorder channels through the editable zone map.
3. Apply calibration offsets/gains.
4. Flag bad calibration/channel quality.
5. Detect foot strike, midstance, and toe-off from relative load thresholds.
6. Segment stance windows.
7. Compute per-step and run-level metrics.
8. Compare to the user's own baseline when enough clean runs exist.
9. Compute Training Strain and category scores in deterministic code.
10. Build conservative deterministic and OpenAI-ready explanations.

Implemented indicators:

- cadence
- contact time estimate
- foot-strike/midstance/toe-off events
- total relative load
- peak load
- cumulative load / impulse-like proxy
- load-rate proxy
- medial/lateral load balance
- heel/midfoot/forefoot/toe distribution
- forefoot/metatarsal load
- heel load
- arch/midfoot load
- toe-off contribution
- pressure + IMU impact proxy
- fatigue shift, first half vs second half
- shoe load score
- Training Strain 0-100

Limitations:

- relative load units are not calibrated Newtons or kPa
- gait events are beta estimates from pressure thresholds
- no clinical validation is claimed
- comparisons should primarily use the runner's own baseline
