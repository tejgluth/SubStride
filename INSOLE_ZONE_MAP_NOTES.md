# INSOLE_ZONE_MAP_NOTES.md

## Uploaded asset

The uploaded SVG has been copied into:

- `docs/assets/SubStrideInsolev0.svg`

A rendered preview has also been added when available:

- `docs/assets/SubStrideInsolev0_preview.png`

## Interpretation

The visual design contains left and right insole outlines with repeated separated pressure pad regions. SubStride V1 should treat these as independent 16-zone pad layouts per foot.

## Required implementation

Codex must create a zone map config that can be edited without changing analytics code.

Each zone should have:

- stable zone ID
- display name
- biomechanical/technical name
- anatomical region group
- side group: medial, center, lateral
- longitudinal group: heel, midfoot, forefoot, toe
- default channel index
- polygon/SVG reference if feasible
- left/right mirroring support

## Important

Do not hardcode channel order into analytics logic. Hardware channel order may change during assembly.
