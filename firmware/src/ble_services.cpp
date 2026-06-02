#include "ble_services.h"

#include <NimBLEDevice.h>

#include "config.h"

static constexpr const char* UUID_DEVICE_INFO_SERVICE = "9b74a100-7c4b-4f15-9d7c-000000000001";
static constexpr const char* UUID_CONTROL_SERVICE = "9b74a200-7c4b-4f15-9d7c-000000000002";
static constexpr const char* UUID_SESSION_SERVICE = "9b74a300-7c4b-4f15-9d7c-000000000003";
static constexpr const char* UUID_FILE_SERVICE = "9b74a400-7c4b-4f15-9d7c-000000000004";
static constexpr const char* UUID_DEBUG_SERVICE = "9b74a500-7c4b-4f15-9d7c-000000000005";

static NimBLECharacteristic* statusCharacteristic = nullptr;
static NimBLECharacteristic* sessionListCharacteristic = nullptr;
static NimBLECharacteristic* fileDataCharacteristic = nullptr;
static BleServices* activeBle = nullptr;

static void setU32(uint8_t* buffer, size_t offset, uint32_t value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = (value >> 16) & 0xff;
  buffer[offset + 3] = (value >> 24) & 0xff;
}

class ControlCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* characteristic) override {
    if (!activeBle) return;
    std::string value = characteristic->getValue();
    if (value == "start") activeBle->_pendingCommand = PodCommand::StartRecording;
    else if (value == "stop") activeBle->_pendingCommand = PodCommand::StopRecording;
    else if (value == "service") activeBle->_pendingCommand = PodCommand::EnterServiceMode;
    else if (value == "foot:left") activeBle->_pendingCommand = PodCommand::SetLeft;
    else if (value == "foot:right") activeBle->_pendingCommand = PodCommand::SetRight;
    else if (value == "foot:unknown") activeBle->_pendingCommand = PodCommand::SetUnknown;
    else if (value == "sessions") activeBle->_pendingCommand = PodCommand::RefreshSessions;
  }
};

class FileRequestCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* characteristic) override {
    if (!activeBle || !activeBle->_fileChunkProvider || !fileDataCharacteristic) return;
    std::string value = characteristic->getValue();
    if (value.rfind("chunk:", 0) != 0) {
      fileDataCharacteristic->setValue("ERR:bad-request");
      fileDataCharacteristic->notify();
      return;
    }

    const String request = String(value.c_str());
    const int first = request.indexOf(':');
    const int second = request.indexOf(':', first + 1);
    const int third = request.indexOf(':', second + 1);
    if (first < 0 || second < 0 || third < 0) {
      fileDataCharacteristic->setValue("ERR:bad-request");
      fileDataCharacteristic->notify();
      return;
    }

    const String sessionId = request.substring(first + 1, second);
    const uint32_t offset = strtoul(request.substring(second + 1, third).c_str(), nullptr, 10);
    const uint32_t requestedLength = strtoul(request.substring(third + 1).c_str(), nullptr, 10);
    const uint16_t length = requestedLength > 512 ? 512 : static_cast<uint16_t>(requestedLength);
    uint8_t payload[512] = {0};
    size_t payloadLength = 0;
    uint32_t totalSize = 0;

    if (!activeBle->_fileChunkProvider(sessionId.c_str(), offset, length, payload, payloadLength, totalSize)) {
      fileDataCharacteristic->setValue("ERR:not-found");
      fileDataCharacteristic->notify();
      return;
    }

    uint8_t response[524] = {0};
    setU32(response, 0, offset);
    setU32(response, 4, totalSize);
    setU32(response, 8, static_cast<uint32_t>(payloadLength));
    memcpy(response + 12, payload, payloadLength);
    fileDataCharacteristic->setValue(response, payloadLength + 12);
    fileDataCharacteristic->notify();
  }
};

void BleServices::begin(const char* podSerial) {
  activeBle = this;
  String deviceName = String("SubStride-Pod-") + podSerial;
  NimBLEDevice::init(deviceName.c_str());
  NimBLEServer* server = NimBLEDevice::createServer();

  NimBLEService* infoService = server->createService(UUID_DEVICE_INFO_SERVICE);
  infoService->createCharacteristic("9b74a101-7c4b-4f15-9d7c-000000000101", NIMBLE_PROPERTY::READ)->setValue(kFirmwareVersion);
  infoService->createCharacteristic("9b74a102-7c4b-4f15-9d7c-000000000102", NIMBLE_PROPERTY::READ)->setValue(kHardwareRevision);
  infoService->createCharacteristic("9b74a103-7c4b-4f15-9d7c-000000000103", NIMBLE_PROPERTY::READ)->setValue(podSerial);
  infoService->start();

  NimBLEService* controlService = server->createService(UUID_CONTROL_SERVICE);
  NimBLECharacteristic* command = controlService->createCharacteristic("9b74a201-7c4b-4f15-9d7c-000000000201", NIMBLE_PROPERTY::WRITE);
  command->setCallbacks(new ControlCallbacks());
  statusCharacteristic = controlService->createCharacteristic("9b74a202-7c4b-4f15-9d7c-000000000202", NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  statusCharacteristic->setValue("{\"status\":\"boot\"}");
  controlService->start();

  NimBLEService* sessionService = server->createService(UUID_SESSION_SERVICE);
  sessionListCharacteristic = sessionService->createCharacteristic("9b74a301-7c4b-4f15-9d7c-000000000301", NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  sessionListCharacteristic->setValue("[]");
  sessionService->start();

  NimBLEService* fileService = server->createService(UUID_FILE_SERVICE);
  NimBLECharacteristic* fileRequest = fileService->createCharacteristic("9b74a401-7c4b-4f15-9d7c-000000000401", NIMBLE_PROPERTY::WRITE);
  fileRequest->setCallbacks(new FileRequestCallbacks());
  fileDataCharacteristic = fileService->createCharacteristic("9b74a402-7c4b-4f15-9d7c-000000000402", NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  fileDataCharacteristic->setValue("");
  fileService->start();

  NimBLEService* debugService = server->createService(UUID_DEBUG_SERVICE);
  debugService->createCharacteristic("9b74a501-7c4b-4f15-9d7c-000000000501", NIMBLE_PROPERTY::READ)->setValue("debug-ready");
  debugService->start();

  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
  advertising->addServiceUUID(UUID_DEVICE_INFO_SERVICE);
  advertising->addServiceUUID(UUID_CONTROL_SERVICE);
  advertising->setScanResponse(true);
  advertising->start();
}

void BleServices::updateStatus(const char* statusJson) {
  if (!statusCharacteristic) return;
  statusCharacteristic->setValue(statusJson);
  statusCharacteristic->notify();
}

void BleServices::updateSessionList(const char* sessionListJson) {
  if (!sessionListCharacteristic) return;
  sessionListCharacteristic->setValue(sessionListJson);
  sessionListCharacteristic->notify();
}

PodCommand BleServices::pollCommand() {
  PodCommand command = _pendingCommand;
  _pendingCommand = PodCommand::None;
  return command;
}
