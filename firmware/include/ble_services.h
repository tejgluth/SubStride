#pragma once

#include <Arduino.h>

enum class PodCommand : uint8_t {
  None,
  StartRecording,
  StopRecording,
  EnterServiceMode,
  SetLeft,
  SetRight,
  SetUnknown,
  RefreshSessions,
  SetTimeUnixMs
};

using FileChunkProvider = bool (*)(const char* sessionId, uint32_t offset, uint16_t length, uint8_t* out, size_t& outLength, uint32_t& totalSize);

class BleServices {
public:
  void begin(const char* podSerial);
  void setFileChunkProvider(FileChunkProvider provider) { _fileChunkProvider = provider; }
  void updateStatus(const char* statusJson);
  void updateSessionList(const char* sessionListJson);
  PodCommand pollCommand();
  // Wall-clock time (ms since unix epoch) most recently received via the "time:<ms>" command.
  // 0 means no time has been received this connection.
  uint64_t pendingTimeUnixMs() const { return _pendingTimeUnixMs; }
  void clearPendingTime() { _pendingTimeUnixMs = 0; }
  bool inServiceMode() const { return _serviceMode; }
  void setServiceMode(bool serviceMode) { _serviceMode = serviceMode; }

private:
  PodCommand _pendingCommand = PodCommand::None;
  uint64_t _pendingTimeUnixMs = 0;
  bool _serviceMode = false;
  FileChunkProvider _fileChunkProvider = nullptr;
  friend class ControlCallbacks;
  friend class FileRequestCallbacks;
};
