# SubStride Analytics

Deterministic TypeScript analytics for SubStride V1. This package is the source of truth for:

- typed local data schemas
- binary `.sslog` encode/decode
- calibration transforms and channel quality checks
- gait event detection and step segmentation
- run-level load, gait, and Training Strain metrics
- user-baseline comparison
- conservative explanation templates and OpenAI prompt construction
- simulator sessions for app development without hardware

The package deliberately avoids clinical or medical claims. Values are relative load/gait/strain indicators for beta validation.

```bash
npm install
npm test
npm run generate:sample-data
```
