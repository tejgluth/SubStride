import { BleManager, Device, State } from 'react-native-ble-plx';
import type { AssignedFoot } from '@substride/analytics';

export type PodScanResult = {
  id: string;
  name: string;
  rssi?: number;
  assignedFoot: AssignedFoot;
  firmwareVersion?: string;
  hardwareRevision?: string;
  serialNumber?: string;
  transport: 'ble' | 'simulator';
};

export type PodStatus = {
  status: 'boot' | 'idle' | 'recording' | 'service' | 'error' | 'foot_set' | string;
  podId: string;
  foot: AssignedFoot;
  fw?: string;
};

export type PodSessionManifest = {
  sessionId: string;
  podId: string;
  foot: AssignedFoot;
  status: 'recording' | 'closed' | string;
  frameCount: number;
  pressureHz: number;
  imuHz: number;
  logFile: string;
  firmwareVersion?: string;
  hardwareRevision?: string;
};

export type PodCommandResult = {
  podId: string;
  command: string;
  accepted: boolean;
  status?: PodStatus;
};

export const SUBSTRIDE_BLE_UUIDS = {
  deviceInfoService: '9b74a100-7c4b-4f15-9d7c-000000000001',
  firmwareVersion: '9b74a101-7c4b-4f15-9d7c-000000000101',
  hardwareRevision: '9b74a102-7c4b-4f15-9d7c-000000000102',
  serialNumber: '9b74a103-7c4b-4f15-9d7c-000000000103',

  controlService: '9b74a200-7c4b-4f15-9d7c-000000000002',
  command: '9b74a201-7c4b-4f15-9d7c-000000000201',
  status: '9b74a202-7c4b-4f15-9d7c-000000000202',

  sessionService: '9b74a300-7c4b-4f15-9d7c-000000000003',
  sessionList: '9b74a301-7c4b-4f15-9d7c-000000000301',

  fileService: '9b74a400-7c4b-4f15-9d7c-000000000004',
  fileRequest: '9b74a401-7c4b-4f15-9d7c-000000000401',
  fileData: '9b74a402-7c4b-4f15-9d7c-000000000402',
} as const;

const SIM_PODS: PodScanResult[] = [
  {
    id: 'SIM-LEFT',
    name: 'SubStride-Pod-0001',
    rssi: -48,
    assignedFoot: 'left',
    firmwareVersion: 'sim-0.1.0',
    hardwareRevision: 'sim-v0',
    serialNumber: 'SIM-LEFT',
    transport: 'simulator',
  },
  {
    id: 'SIM-RIGHT',
    name: 'SubStride-Pod-0002',
    rssi: -51,
    assignedFoot: 'right',
    firmwareVersion: 'sim-0.1.0',
    hardwareRevision: 'sim-v0',
    serialNumber: 'SIM-RIGHT',
    transport: 'simulator',
  },
];

class PodBleService {
  private manager?: BleManager;
  private connected = new Map<string, Device>();

  async scanForPods(options: { timeoutMs?: number; simulatorFallback?: boolean } = {}): Promise<PodScanResult[]> {
    const timeoutMs = options.timeoutMs ?? 4500;
    const simulatorFallback = options.simulatorFallback ?? true;

    try {
      const manager = this.getManager();
      await this.waitForPoweredOn(manager);
      const found = new Map<string, PodScanResult>();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          manager.stopDeviceScan();
          resolve();
        }, timeoutMs);

        manager.startDeviceScan([SUBSTRIDE_BLE_UUIDS.deviceInfoService, SUBSTRIDE_BLE_UUIDS.controlService], { allowDuplicates: false }, (error, device) => {
          if (error) {
            clearTimeout(timeout);
            manager.stopDeviceScan();
            reject(error);
            return;
          }
          if (!device || !isSubStrideDevice(device)) return;
          found.set(device.id, {
            id: device.id,
            name: device.name ?? device.localName ?? 'SubStride pod',
            rssi: device.rssi ?? undefined,
            assignedFoot: inferFoot(device.name ?? device.localName),
            transport: 'ble',
          });
        });
      });

      const results = [...found.values()];
      return results.length > 0 || !simulatorFallback ? results : SIM_PODS;
    } catch {
      return simulatorFallback ? SIM_PODS : [];
    }
  }

  async connectToPod(podId: string): Promise<PodScanResult> {
    if (podId.startsWith('SIM-')) {
      return SIM_PODS.find((pod) => pod.id === podId) ?? SIM_PODS[0];
    }

    const manager = this.getManager();
    await this.waitForPoweredOn(manager);
    const device = await manager.connectToDevice(podId, { timeout: 10000 });
    const connectedDevice = await device.discoverAllServicesAndCharacteristics();
    this.connected.set(podId, connectedDevice);

    const [firmwareVersion, hardwareRevision, serialNumber, status] = await Promise.all([
      this.readAscii(connectedDevice, SUBSTRIDE_BLE_UUIDS.deviceInfoService, SUBSTRIDE_BLE_UUIDS.firmwareVersion),
      this.readAscii(connectedDevice, SUBSTRIDE_BLE_UUIDS.deviceInfoService, SUBSTRIDE_BLE_UUIDS.hardwareRevision),
      this.readAscii(connectedDevice, SUBSTRIDE_BLE_UUIDS.deviceInfoService, SUBSTRIDE_BLE_UUIDS.serialNumber),
      this.readStatus(connectedDevice),
    ]);

    return {
      id: connectedDevice.id,
      name: connectedDevice.name ?? connectedDevice.localName ?? `SubStride-Pod-${serialNumber}`,
      rssi: connectedDevice.rssi ?? undefined,
      assignedFoot: status?.foot ?? 'unassigned',
      firmwareVersion,
      hardwareRevision,
      serialNumber,
      transport: 'ble',
    };
  }

  async assignFoot(podId: string, foot: 'left' | 'right' | 'unknown'): Promise<PodCommandResult> {
    return this.writeCommand(podId, `foot:${foot}`);
  }

  async syncTime(podId: string, unixMs: number = Date.now()): Promise<PodCommandResult> {
    return this.writeCommand(podId, `time:${Math.max(0, Math.round(unixMs))}`);
  }

  async startRecording(podId: string): Promise<PodCommandResult> {
    await this.syncTime(podId);
    return this.writeCommand(podId, 'start');
  }

  async stopRecording(podId: string): Promise<PodCommandResult> {
    return this.writeCommand(podId, 'stop');
  }

  async listSessions(podId: string): Promise<PodSessionManifest[]> {
    if (podId.startsWith('SIM-')) {
      return [{ podId, sessionId: `sim-session-${podId}`, foot: podId.includes('LEFT') ? 'left' : 'right', status: 'closed', frameCount: 4500, pressureHz: 100, imuHz: 100, logFile: `/sessions/sim-session-${podId}.sslog` }];
    }

    const device = this.connected.get(podId) ?? await this.connectDeviceById(podId);
    await this.writeAscii(device, SUBSTRIDE_BLE_UUIDS.controlService, SUBSTRIDE_BLE_UUIDS.command, 'sessions');
    await delay(150);
    const raw = await this.readAscii(device, SUBSTRIDE_BLE_UUIDS.sessionService, SUBSTRIDE_BLE_UUIDS.sessionList);
    const parsed = JSON.parse(raw || '[]') as PodSessionManifest[];
    return parsed.map((session) => ({
      ...session,
      foot: normalizeFoot(session.foot),
      frameCount: Number(session.frameCount) || 0,
      pressureHz: Number(session.pressureHz) || 0,
      imuHz: Number(session.imuHz) || 0,
    }));
  }

  async downloadSessionLog(
    podId: string,
    sessionId: string,
    onProgress?: (progress: { receivedBytes: number; totalBytes: number }) => void
  ): Promise<Uint8Array> {
    if (podId.startsWith('SIM-')) return new Uint8Array();

    const device = this.connected.get(podId) ?? await this.connectDeviceById(podId);
    const chunks: Uint8Array[] = [];
    let offset = 0;
    let totalSize = Number.POSITIVE_INFINITY;

    while (offset < totalSize) {
      const response = await this.requestChunk(device, sessionId, offset, 480);
      totalSize = response.totalSize;
      if (response.payload.length === 0) break;
      chunks.push(response.payload);
      offset += response.payload.length;
      onProgress?.({ receivedBytes: offset, totalBytes: totalSize });
    }

    return concatBytes(chunks, Number.isFinite(totalSize) ? totalSize : offset);
  }

  async disconnect(podId: string): Promise<void> {
    const device = this.connected.get(podId);
    if (!device) return;
    await device.cancelConnection();
    this.connected.delete(podId);
  }

  private async writeCommand(podId: string, command: string): Promise<PodCommandResult> {
    if (podId.startsWith('SIM-')) {
      return {
        podId,
        command,
        accepted: true,
        status: {
          podId,
          status: command === 'start' ? 'recording' : command === 'stop' ? 'idle' : command.startsWith('time:') ? 'time_set' : 'foot_set',
          foot: podId.includes('LEFT') ? 'left' : 'right',
        },
      };
    }

    const device = this.connected.get(podId) ?? await this.connectDeviceById(podId);
    await this.writeAscii(device, SUBSTRIDE_BLE_UUIDS.controlService, SUBSTRIDE_BLE_UUIDS.command, command);
    await delay(120);
    return { podId, command, accepted: true, status: await this.readStatus(device) };
  }

  private async requestChunk(device: Device, sessionId: string, offset: number, length: number): Promise<{ offset: number; totalSize: number; payload: Uint8Array }> {
    await this.writeAscii(device, SUBSTRIDE_BLE_UUIDS.fileService, SUBSTRIDE_BLE_UUIDS.fileRequest, `chunk:${sessionId}:${offset}:${length}`);
    await delay(80);
    const characteristic = await device.readCharacteristicForService(SUBSTRIDE_BLE_UUIDS.fileService, SUBSTRIDE_BLE_UUIDS.fileData);
    const bytes = base64ToBytes(characteristic.value ?? '');
    const ascii = bytesToAscii(bytes);
    if (ascii.startsWith('ERR:')) throw new Error(ascii);
    if (bytes.length < 12) throw new Error('Invalid SubStride file chunk response');
    const responseOffset = readU32(bytes, 0);
    const totalSize = readU32(bytes, 4);
    const payloadLength = readU32(bytes, 8);
    return {
      offset: responseOffset,
      totalSize,
      payload: bytes.slice(12, 12 + payloadLength),
    };
  }

  private async connectDeviceById(podId: string): Promise<Device> {
    const connected = this.connected.get(podId);
    if (connected) return connected;
    const manager = this.getManager();
    const device = await manager.connectToDevice(podId, { timeout: 10000 });
    const discovered = await device.discoverAllServicesAndCharacteristics();
    this.connected.set(podId, discovered);
    return discovered;
  }

  private getManager(): BleManager {
    this.manager ??= new BleManager();
    return this.manager;
  }

  private async waitForPoweredOn(manager: BleManager): Promise<void> {
    const state = await manager.state();
    if (state === State.PoweredOn) return;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscription.remove();
        reject(new Error('Bluetooth is not powered on'));
      }, 5000);
      const subscription = manager.onStateChange((nextState) => {
        if (nextState === State.PoweredOn) {
          clearTimeout(timeout);
          subscription.remove();
          resolve();
        }
      }, true);
    });
  }

  private async readStatus(device: Device): Promise<PodStatus | undefined> {
    const raw = await this.readAscii(device, SUBSTRIDE_BLE_UUIDS.controlService, SUBSTRIDE_BLE_UUIDS.status);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as PodStatus;
    return { ...parsed, foot: normalizeFoot(parsed.foot) };
  }

  private async readAscii(device: Device, serviceUuid: string, characteristicUuid: string): Promise<string> {
    const characteristic = await device.readCharacteristicForService(serviceUuid, characteristicUuid);
    return base64ToAscii(characteristic.value ?? '');
  }

  private async writeAscii(device: Device, serviceUuid: string, characteristicUuid: string, value: string): Promise<void> {
    await device.writeCharacteristicWithResponseForService(serviceUuid, characteristicUuid, asciiToBase64(value));
  }
}

export const podBleService = new PodBleService();

function isSubStrideDevice(device: Device): boolean {
  const name = device.name ?? device.localName ?? '';
  return name.startsWith('SubStride-Pod-') || (device.serviceUUIDs ?? []).some((uuid) => uuid.toLowerCase() === SUBSTRIDE_BLE_UUIDS.deviceInfoService);
}

function inferFoot(name?: string | null): AssignedFoot {
  const lower = (name ?? '').toLowerCase();
  if (lower.includes('left')) return 'left';
  if (lower.includes('right')) return 'right';
  return 'unassigned';
}

function normalizeFoot(foot?: string): AssignedFoot {
  if (foot === 'left' || foot === 'right' || foot === 'unknown') return foot;
  return 'unassigned';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function asciiToBase64(value: string): string {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytesToBase64(bytes);
}

export function base64ToAscii(value: string): string {
  return bytesToAscii(base64ToBytes(value));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triplet = (a << 16) | (b << 8) | c;
    output += alphabet[(triplet >> 18) & 63];
    output += alphabet[(triplet >> 12) & 63];
    output += i + 1 < bytes.length ? alphabet[(triplet >> 6) & 63] : '=';
    output += i + 2 < bytes.length ? alphabet[triplet & 63] : '=';
  }
  return output;
}

export function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, '');
  const output: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = alphabet.indexOf(clean[i]);
    const b = alphabet.indexOf(clean[i + 1]);
    const c = clean[i + 2] === '=' ? -1 : alphabet.indexOf(clean[i + 2]);
    const d = clean[i + 3] === '=' ? -1 : alphabet.indexOf(clean[i + 3]);
    const triplet = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
    output.push((triplet >> 16) & 0xff);
    if (c >= 0) output.push((triplet >> 8) & 0xff);
    if (d >= 0) output.push(triplet & 0xff);
  }
  return new Uint8Array(output);
}

function bytesToAscii(bytes: Uint8Array): string {
  let output = '';
  bytes.forEach((byte) => { output += String.fromCharCode(byte); });
  return output;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function concatBytes(chunks: Uint8Array[], expectedLength: number): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(Math.min(length, expectedLength));
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk.slice(0, output.length - offset), offset);
    offset += chunk.length;
  });
  return output;
}
