#pragma once

#include <Arduino.h>
#include <FS.h>
#include <SD.h>
#include "sslog_format.h"

class SslogWriter {
public:
  bool begin();
  bool startSession(const SessionMetadata& metadata);
  bool appendFrame(const PressureImuFrame& frame);
  bool finishSession();
  bool listSessionManifests(String& outJson);
  bool readLogChunk(const char* sessionId, uint32_t offset, uint16_t requestedLength, uint8_t* out, size_t& outLength, uint32_t& totalSize);
  bool isOpen() const { return _open; }
  const String& currentLogPath() const { return _logPath; }
  const String& currentManifestPath() const { return _manifestPath; }

private:
  File _file;
  SessionMetadata _metadata{};
  String _logPath;
  String _manifestPath;
  uint32_t _frameCount = 0;
  bool _open = false;

  void writeHeader(uint32_t frameCount);
  void updateHeaderFrameCount();
  void writeManifest(const char* status);
};
