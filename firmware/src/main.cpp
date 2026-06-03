#include <Arduino.h>
#include <Preferences.h>
#include <esp_sleep.h>

#include "ble_services.h"
#include "config.h"
#include "led_status.h"
#include "pin_map.h"
#include "sensors.h"
#include "sslog_writer.h"

enum class PodState {
  Idle,
  Recording,
  Service,
  Error
};

static Preferences preferences;
static SensorSuite sensors;
static SslogWriter writer;
static BleServices ble;
static LedStatus led;

static PodState state = PodState::Idle;
static uint32_t lastActivityMs = 0;
static uint32_t lastFrameMs = 0;
static uint32_t sequenceNumber = 0;
static bool buttonWasDown = false;
static uint32_t buttonDownAtMs = 0;
static char podSerial[24] = "SS-POD-0001";
static char footSide[8] = "unknown";
static uint32_t bootCount = 0;
// Wall-clock reconstruction: unixMs ≈ millis() + timeOffsetUnixMs once the phone has sent "time:".
static int64_t timeOffsetUnixMs = 0;
static bool timeSynced = false;

static void loadSettings() {
  preferences.begin("substride", false);
  String storedSerial = preferences.getString("serial", kDefaultPodSerial);
  String storedFoot = preferences.getString("foot", kDefaultFootSide);
  strlcpy(podSerial, storedSerial.c_str(), sizeof(podSerial));
  strlcpy(footSide, storedFoot.c_str(), sizeof(footSide));
  // Monotonic boot counter persisted in NVS. millis() resets to 0 after every deep-sleep wake,
  // so without this two sessions started in different boot cycles could share an ID. The boot
  // number disambiguates them.
  bootCount = preferences.getUInt("boot", 0) + 1;
  preferences.putUInt("boot", bootCount);
}

static void saveFoot(const char* foot) {
  strlcpy(footSide, foot, sizeof(footSide));
  preferences.putString("foot", footSide);
}

static void refreshSessionList() {
  String sessionsJson;
  if (writer.listSessionManifests(sessionsJson)) {
    ble.updateSessionList(sessionsJson.c_str());
  }
}

static bool provideLogChunk(const char* sessionId, uint32_t offset, uint16_t length, uint8_t* out, size_t& outLength, uint32_t& totalSize) {
  return writer.readLogChunk(sessionId, offset, length, out, outLength, totalSize);
}

static String statusJson(const char* status) {
  return String("{\"status\":\"") + status + "\",\"podId\":\"" + podSerial + "\",\"foot\":\"" + footSide + "\",\"fw\":\"" + kFirmwareVersion + "\"}";
}

static void enterState(PodState next) {
  state = next;
  lastActivityMs = millis();
  if (next == PodState::Idle) {
    led.setMode(LedMode::Idle);
    ble.updateStatus(statusJson("idle").c_str());
  } else if (next == PodState::Recording) {
    led.setMode(LedMode::Recording);
    ble.updateStatus(statusJson("recording").c_str());
  } else if (next == PodState::Service) {
    led.setMode(LedMode::Service);
    ble.setServiceMode(true);
    ble.updateStatus(statusJson("service").c_str());
  } else {
    led.setMode(LedMode::Error);
    ble.updateStatus(statusJson("error").c_str());
  }
}

static void makeSessionMetadata(SessionMetadata& metadata) {
  memset(&metadata, 0, sizeof(metadata));
  strlcpy(metadata.podId, podSerial, sizeof(metadata.podId));
  // Session ID = serial-bootCount-millis. The boot counter prevents collisions across deep-sleep
  // reboots (when millis() restarts at 0). Two different pods never collide because the serial differs.
  snprintf(metadata.sessionId, sizeof(metadata.sessionId), "%s-%lu-%lu", podSerial,
           static_cast<unsigned long>(bootCount), static_cast<unsigned long>(millis()));
  strlcpy(metadata.foot, footSide, sizeof(metadata.foot));
  strlcpy(metadata.hardwareRevision, kHardwareRevision, sizeof(metadata.hardwareRevision));
  strlcpy(metadata.firmwareVersion, kFirmwareVersion, sizeof(metadata.firmwareVersion));
  strlcpy(metadata.calibrationProfileId, "uncalibrated-lab", sizeof(metadata.calibrationProfileId));
  metadata.pressureHz = kPressureSampleRateHz;
  metadata.imuHz = kImuSampleRateHz;
  // Populated only if the phone sent the time before the run; 0 otherwise and the app reconciles
  // using its own clock + the monotonic frame timestamps.
  metadata.startedAtUnixMs = timeSynced ? static_cast<uint64_t>(static_cast<int64_t>(millis()) + timeOffsetUnixMs) : 0;
  metadata.flags = kSimulatorMode ? SSLOG_FLAG_SIMULATED : 0x00;
}

static void startRecording() {
  SessionMetadata metadata;
  makeSessionMetadata(metadata);
  sequenceNumber = 0;
  lastFrameMs = millis(); // start the fixed-period pacing clock fresh for this session
  if (!writer.startSession(metadata)) {
    Serial.println("Failed to open SD session log");
    enterState(PodState::Error);
    return;
  }
  Serial.printf("Recording %s\n", writer.currentLogPath().c_str());
  enterState(PodState::Recording);
}

static void stopRecording() {
  writer.finishSession();
  Serial.printf("Closed session %s\n", writer.currentLogPath().c_str());
  refreshSessionList();
  enterState(PodState::Idle);
}

static void handleShortPress() {
  if (state == PodState::Recording) stopRecording();
  else if (state == PodState::Idle || state == PodState::Service) startRecording();
}

static void handleLongPress() {
  if (state == PodState::Recording) stopRecording();
  enterState(PodState::Service);
}

static void pollButton() {
  const bool down = digitalRead(PIN_BUTTON) == LOW;
  const uint32_t now = millis();
  if (down && !buttonWasDown) {
    buttonDownAtMs = now;
    buttonWasDown = true;
  } else if (!down && buttonWasDown) {
    const uint32_t heldMs = now - buttonDownAtMs;
    buttonWasDown = false;
    if (heldMs >= kButtonDebounceMs && heldMs < kLongPressMs) handleShortPress();
    else if (heldMs >= kLongPressMs) handleLongPress();
  }
}

static void pollBleCommands() {
  switch (ble.pollCommand()) {
    case PodCommand::StartRecording:
      if (state != PodState::Recording) startRecording();
      break;
    case PodCommand::StopRecording:
      if (state == PodState::Recording) stopRecording();
      break;
    case PodCommand::EnterServiceMode:
      handleLongPress();
      break;
    case PodCommand::SetLeft:
      saveFoot("left");
      ble.updateStatus(statusJson("foot_set").c_str());
      break;
    case PodCommand::SetRight:
      saveFoot("right");
      ble.updateStatus(statusJson("foot_set").c_str());
      break;
    case PodCommand::SetUnknown:
      saveFoot("unknown");
      ble.updateStatus(statusJson("foot_set").c_str());
      break;
    case PodCommand::RefreshSessions:
      refreshSessionList();
      break;
    case PodCommand::SetTimeUnixMs: {
      const uint64_t unixMs = ble.pendingTimeUnixMs();
      if (unixMs > 0) {
        timeOffsetUnixMs = static_cast<int64_t>(unixMs) - static_cast<int64_t>(millis());
        timeSynced = true;
        ble.updateStatus(statusJson("time_set").c_str());
      }
      ble.clearPendingTime();
      break;
    }
    case PodCommand::None:
      break;
  }
}

static void maybeRecordFrame() {
  if (state != PodState::Recording) return;
  const uint32_t now = millis();
  const uint32_t framePeriodMs = 1000 / kPressureSampleRateHz;
  if (now - lastFrameMs < framePeriodMs) return;
  // Advance by a FIXED period (not `= now`) so scheduling jitter and occasional SD-flush stalls do
  // not slowly drag the effective sample rate below target. If we fell far behind, resync to avoid
  // a burst of catch-up frames. The true per-frame millis() is still recorded for the app.
  lastFrameMs += framePeriodMs;
  if (now - lastFrameMs > framePeriodMs * 4) lastFrameMs = now;

  PressureImuFrame frame{};
  frame.sequence = sequenceNumber++;
  if (sensors.readFrame(frame, kSimulatorMode)) {
    if (!writer.appendFrame(frame)) {
      Serial.println("SD frame write failed");
      enterState(PodState::Error);
    }
  }
}

static void maybeSleep() {
  if (state != PodState::Idle) return;
  if (millis() - lastActivityMs < kIdleSleepAfterMs) return;
  Serial.println("Entering deep sleep after idle timeout");
  esp_sleep_enable_ext0_wakeup(static_cast<gpio_num_t>(PIN_BUTTON), 0);
  delay(50);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("SubStride pod boot");
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  led.begin();
  loadSettings();
  const bool sensorsReady = sensors.begin();
  const bool sdReady = writer.begin();
  ble.begin(podSerial);
  ble.setFileChunkProvider(provideLogChunk);
  Serial.printf("Settings pod=%s foot=%s fw=%s hw=%s simulator=%s\n", podSerial, footSide, kFirmwareVersion, kHardwareRevision, kSimulatorMode ? "true" : "false");
  Serial.printf("Sensors=%s SD=%s\n", sensorsReady ? "ok" : "warn", sdReady ? "ok" : "fail");
  enterState(sdReady ? PodState::Idle : PodState::Error);
  refreshSessionList();
}

void loop() {
  pollButton();
  pollBleCommands();
  maybeRecordFrame();
  led.tick();
  maybeSleep();
}
