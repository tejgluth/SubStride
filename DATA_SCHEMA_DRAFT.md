# DATA_SCHEMA_DRAFT.md

Codex should convert this draft into typed schemas.

## Entities

### UserProfile
- id
- displayName
- createdAt
- optional height
- optional weight
- optional weeklyMileage
- localOnly boolean

### Pod
- id
- serialNumber
- nickname optional
- assignedFoot: left | right | unassigned
- firmwareVersion
- hardwareRevision
- lastSeenAt

### ShoeProfile
- id
- name
- brand optional
- model optional
- size optional
- notes optional
- createdAt

### CalibrationProfile
- id
- podId
- foot
- shoeId optional
- createdAt
- zoneOffsets
- zoneGains
- noiseStats
- quality: pass | warn | fail
- notes

### Session
- id
- userId
- createdAt
- startedAt optional
- endedAt optional
- source: real_pod | simulator | imported
- mode: run | walk | treadmill | test | unknown
- surface
- workoutType
- shoeId
- painScore0To10 optional
- podSessionIds
- syncStatus

### PodSession
- id
- sessionId
- podId
- foot
- logFileName
- startMonotonicMs
- sampleRateEstimate
- packetLossEstimate
- crcStatus
- decodedStatus

### RawFrame
- sessionId
- podId
- foot
- sequence
- timestampMs
- pressureRaw[16]
- accelX/Y/Z
- gyroX/Y/Z
- flags

### CalibratedFrame
- sessionId
- podId
- foot
- timestampMs
- relativeLoad[16]
- totalLoad
- regionLoads
- qualityFlags

### RunMetrics
- sessionId
- foot or both
- cadence
- contactTime
- impactLoad
- medialLateralBalance
- rearMidForeBalance
- toeOffContribution
- fatigueShift
- loadDistribution
- trainingStrain
- categoryScores

### AIInsight
- sessionId
- promptVersion
- model optional
- computedMetricsUsed
- generatedText
- createdAt
