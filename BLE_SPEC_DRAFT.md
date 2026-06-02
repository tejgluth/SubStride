# BLE_SPEC_DRAFT.md

## Core design

The pod is a BLE peripheral. The phone is the central. The phone app scans for SubStride pods, lets the user assign left/right, and syncs session logs after a run.

## MVP reality

The pod records standalone during the run. BLE is mainly for:
- pairing/registration
- device info
- time sync when possible
- command/control
- session manifest
- post-run log transfer
- optional debug/status

## Device naming

Format:
- `SubStride-Pod-0001`
- `SubStride-Pod-0002`

Each pod must also expose a stable unique device ID.

## Suggested services

1. Device Info Service
   - firmware version
   - hardware revision
   - pod unique ID
   - left/right assignment
   - storage status

2. Control Service
   - start recording
   - stop recording
   - erase synced session
   - enter service mode
   - set pod time
   - set left/right assignment

3. Session Service
   - list sessions
   - session manifest
   - session metadata
   - session transfer status

4. File Transfer Service
   - request chunk
   - receive binary chunk
   - chunk index
   - chunk CRC
   - retry missing chunk

5. Optional Debug Service
   - short raw frame preview
   - sensor health
   - calibration status

## Implemented V0 UUIDs

The current ESP32 firmware and React Native app use these UUIDs:

- Device Info Service: `9b74a100-7c4b-4f15-9d7c-000000000001`
  - Firmware version: `9b74a101-7c4b-4f15-9d7c-000000000101`
  - Hardware revision: `9b74a102-7c4b-4f15-9d7c-000000000102`
  - Pod serial: `9b74a103-7c4b-4f15-9d7c-000000000103`
- Control Service: `9b74a200-7c4b-4f15-9d7c-000000000002`
  - Command write: `9b74a201-7c4b-4f15-9d7c-000000000201`
  - Status read/notify: `9b74a202-7c4b-4f15-9d7c-000000000202`
- Session Service: `9b74a300-7c4b-4f15-9d7c-000000000003`
  - Session list read/notify: `9b74a301-7c4b-4f15-9d7c-000000000301`
- File Service: `9b74a400-7c4b-4f15-9d7c-000000000004`
  - File request write: `9b74a401-7c4b-4f15-9d7c-000000000401`
  - File data read/notify: `9b74a402-7c4b-4f15-9d7c-000000000402`

## Implemented V0 commands

Commands are UTF-8 strings written to the Control Service command characteristic:

- `start`: start standalone recording
- `stop`: stop recording and close the `.sslog`
- `service`: enter service mode
- `foot:left`, `foot:right`, `foot:unknown`: persist foot assignment
- `sessions`: refresh the session list characteristic

Status is JSON:

```json
{"status":"idle","podId":"SS-POD-0001","foot":"left","fw":"0.1.0"}
```

## Implemented V0 log transfer

The phone writes a UTF-8 request to the File Service request characteristic:

```text
chunk:<sessionId>:<offset>:<length>
```

The ESP32 responds on the File Service data characteristic with binary bytes:

- bytes 0-3: little-endian response offset
- bytes 4-7: little-endian total file size
- bytes 8-11: little-endian payload length
- bytes 12+: raw `.sslog` payload bytes

Chunk payloads are capped at 512 bytes in firmware. The React Native app currently requests 480-byte payloads to stay below common BLE payload limits.

## Transfer format

- Use binary chunks, not JSON, for run logs.
- Use CRC/checksum per file or per chunk.
- Include session-level hash/checksum if practical.
- After sync, convert binary into app-readable decoded session data.

## Time sync

- When phone is connected before a run, sync pod time from phone.
- If the user starts from the pod button without phone, use monotonic timestamps and reconcile during sync.
- For two pods, the app should warn if session clocks cannot be aligned confidently.
