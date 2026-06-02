#include "sslog_writer.h"

#include <ArduinoJson.h>
#include <SPI.h>

#include "crc32.h"
#include "pin_map.h"

static void writeFixed(uint8_t* buffer, size_t offset, size_t length, const char* value) {
  memset(buffer + offset, 0, length);
  strncpy(reinterpret_cast<char*>(buffer + offset), value, length);
}

static uint8_t footByte(const char* foot) {
  if (strcmp(foot, "left") == 0) return 1;
  if (strcmp(foot, "right") == 0) return 2;
  return 0;
}

static void setU16(uint8_t* buffer, size_t offset, uint16_t value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
}

static void setU32(uint8_t* buffer, size_t offset, uint32_t value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = (value >> 16) & 0xff;
  buffer[offset + 3] = (value >> 24) & 0xff;
}

static void setI16(uint8_t* buffer, size_t offset, int16_t value) {
  setU16(buffer, offset, static_cast<uint16_t>(value));
}

static void setF64(uint8_t* buffer, size_t offset, double value) {
  memcpy(buffer + offset, &value, sizeof(double));
}

bool SslogWriter::begin() {
  pinMode(PIN_SD_CS, OUTPUT);
  return SD.begin(PIN_SD_CS, SPI, 10000000);
}

bool SslogWriter::startSession(const SessionMetadata& metadata) {
  if (_open) finishSession();
  _metadata = metadata;
  if (!SD.exists("/sessions")) SD.mkdir("/sessions");
  _logPath = String("/sessions/") + metadata.sessionId + ".sslog";
  _manifestPath = String("/sessions/") + metadata.sessionId + ".json";
  _file = SD.open(_logPath, FILE_WRITE);
  if (!_file) return false;
  _frameCount = 0;
  _open = true;
  writeHeader(0);
  writeManifest("recording");
  return true;
}

void SslogWriter::writeHeader(uint32_t frameCount) {
  uint8_t header[SSLOG_HEADER_LENGTH] = {0};
  writeFixed(header, 0, 8, "SSLOG1");
  setU16(header, 8, SSLOG_VERSION);
  setU16(header, 10, SSLOG_HEADER_LENGTH);
  setU16(header, 12, SSLOG_FRAME_LENGTH);
  setU32(header, 14, frameCount);
  setF64(header, 18, static_cast<double>(_metadata.startedAtUnixMs));
  writeFixed(header, 26, 24, _metadata.podId);
  writeFixed(header, 50, 40, _metadata.sessionId);
  header[90] = footByte(_metadata.foot);
  setU16(header, 91, _metadata.pressureHz);
  setU16(header, 93, _metadata.imuHz);
  writeFixed(header, 95, 16, _metadata.hardwareRevision);
  writeFixed(header, 111, 16, _metadata.firmwareVersion);
  writeFixed(header, 127, 32, _metadata.calibrationProfileId);
  header[159] = _metadata.flags;
  setU32(header, 160, crc32_bytes(header, 160));
  _file.seek(0);
  _file.write(header, sizeof(header));
}

void SslogWriter::updateHeaderFrameCount() {
  writeHeader(_frameCount);
  _file.seek(_file.size());
}

bool SslogWriter::appendFrame(const PressureImuFrame& frame) {
  if (!_open) return false;
  uint8_t bytes[SSLOG_FRAME_LENGTH] = {0};
  setU32(bytes, 0, frame.sequence);
  setU32(bytes, 4, frame.timestampMs);
  for (uint8_t i = 0; i < 16; ++i) {
    setU16(bytes, 8 + i * 2, frame.pressure[i]);
  }
  setI16(bytes, 40, static_cast<int16_t>(constrain(frame.accel[0] * 1000.0f, -32768.0f, 32767.0f)));
  setI16(bytes, 42, static_cast<int16_t>(constrain(frame.accel[1] * 1000.0f, -32768.0f, 32767.0f)));
  setI16(bytes, 44, static_cast<int16_t>(constrain(frame.accel[2] * 1000.0f, -32768.0f, 32767.0f)));
  setI16(bytes, 46, static_cast<int16_t>(constrain(frame.gyro[0] * 10.0f, -32768.0f, 32767.0f)));
  setI16(bytes, 48, static_cast<int16_t>(constrain(frame.gyro[1] * 10.0f, -32768.0f, 32767.0f)));
  setI16(bytes, 50, static_cast<int16_t>(constrain(frame.gyro[2] * 10.0f, -32768.0f, 32767.0f)));
  setU16(bytes, 52, frame.flags);
  setU32(bytes, 54, crc32_bytes(bytes, 54));
  const size_t written = _file.write(bytes, sizeof(bytes));
  if (written == sizeof(bytes)) {
    _frameCount++;
    if (_frameCount % 100 == 0) _file.flush();
    return true;
  }
  return false;
}

void SslogWriter::writeManifest(const char* status) {
  JsonDocument doc;
  doc["sessionId"] = _metadata.sessionId;
  doc["podId"] = _metadata.podId;
  doc["foot"] = _metadata.foot;
  doc["hardwareRevision"] = _metadata.hardwareRevision;
  doc["firmwareVersion"] = _metadata.firmwareVersion;
  doc["calibrationProfileId"] = _metadata.calibrationProfileId;
  doc["pressureHz"] = _metadata.pressureHz;
  doc["imuHz"] = _metadata.imuHz;
  doc["frameCount"] = _frameCount;
  doc["logFile"] = _logPath;
  doc["status"] = status;
  if (SD.exists(_manifestPath)) SD.remove(_manifestPath);
  File manifest = SD.open(_manifestPath, FILE_WRITE);
  if (manifest) {
    serializeJsonPretty(doc, manifest);
    manifest.close();
  }
}

bool SslogWriter::finishSession() {
  if (!_open) return true;
  updateHeaderFrameCount();
  _file.flush();
  _file.close();
  writeManifest("closed");
  _open = false;
  return true;
}

bool SslogWriter::listSessionManifests(String& outJson) {
  JsonDocument doc;
  JsonArray sessions = doc.to<JsonArray>();

  if (!SD.exists("/sessions")) {
    outJson = "[]";
    return true;
  }

  File dir = SD.open("/sessions");
  if (!dir || !dir.isDirectory()) return false;

  File entry = dir.openNextFile();
  while (entry) {
    const String name = entry.name();
    if (!entry.isDirectory() && name.endsWith(".json")) {
      JsonDocument manifest;
      if (deserializeJson(manifest, entry) == DeserializationError::Ok) {
        JsonObject item = sessions.add<JsonObject>();
        item["sessionId"] = manifest["sessionId"] | "";
        item["podId"] = manifest["podId"] | "";
        item["foot"] = manifest["foot"] | "unknown";
        item["status"] = manifest["status"] | "unknown";
        item["frameCount"] = manifest["frameCount"] | 0;
        item["pressureHz"] = manifest["pressureHz"] | 0;
        item["imuHz"] = manifest["imuHz"] | 0;
        item["logFile"] = manifest["logFile"] | "";
        item["firmwareVersion"] = manifest["firmwareVersion"] | "";
        item["hardwareRevision"] = manifest["hardwareRevision"] | "";
      }
    }
    entry.close();
    entry = dir.openNextFile();
  }
  dir.close();

  outJson = "";
  serializeJson(doc, outJson);
  return true;
}

bool SslogWriter::readLogChunk(const char* sessionId, uint32_t offset, uint16_t requestedLength, uint8_t* out, size_t& outLength, uint32_t& totalSize) {
  outLength = 0;
  totalSize = 0;
  if (!sessionId || strlen(sessionId) == 0 || strchr(sessionId, '/') || strchr(sessionId, '\\')) return false;

  const String path = String("/sessions/") + sessionId + ".sslog";
  File file = SD.open(path, FILE_READ);
  if (!file) return false;

  totalSize = file.size();
  if (offset >= totalSize) {
    file.close();
    return true;
  }

  const uint16_t length = requestedLength > 512 ? 512 : requestedLength;
  const uint32_t remaining = totalSize - offset;
  const uint16_t readLength = remaining < length ? static_cast<uint16_t>(remaining) : length;
  file.seek(offset);
  outLength = file.read(out, readLength);
  file.close();
  return true;
}
