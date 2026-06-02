import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CalibrationProfile, Pod, Session, ShoeProfile, UserProfile } from "@substride/analytics";
import type { BetaPod, BetaSessionContext, BetaSessionRecord } from "../domain/betaAppModel";

type LocalKeys = "profile" | "pods" | "shoes" | "calibrations" | "sessions" | "sessionHistory" | "sessionContext";

const prefix = "substride.local.";

export const localStore = {
  async getProfile(): Promise<UserProfile | undefined> {
    return read<UserProfile>("profile");
  },
  async saveProfile(profile: UserProfile): Promise<void> {
    return write("profile", profile);
  },
  async listPods(): Promise<BetaPod[]> {
    return read<BetaPod[]>("pods").then((value) => value ?? []);
  },
  async savePods(pods: BetaPod[] | Pod[]): Promise<void> {
    return write("pods", pods);
  },
  async listShoes(): Promise<ShoeProfile[]> {
    return read<ShoeProfile[]>("shoes").then((value) => value ?? []);
  },
  async saveShoes(shoes: ShoeProfile[]): Promise<void> {
    return write("shoes", shoes);
  },
  async listCalibrations(): Promise<CalibrationProfile[]> {
    return read<CalibrationProfile[]>("calibrations").then((value) => value ?? []);
  },
  async saveCalibrations(calibrations: CalibrationProfile[]): Promise<void> {
    return write("calibrations", calibrations);
  },
  async listSessions(): Promise<Session[]> {
    return read<Session[]>("sessions").then((value) => value ?? []);
  },
  async saveSessions(sessions: Session[]): Promise<void> {
    return write("sessions", sessions);
  },
  async listSessionHistory(): Promise<BetaSessionRecord[]> {
    return read<BetaSessionRecord[]>("sessionHistory").then((value) => value ?? []);
  },
  async saveSessionHistory(sessionHistory: BetaSessionRecord[]): Promise<void> {
    return write("sessionHistory", sessionHistory);
  },
  async getSessionContext(): Promise<BetaSessionContext | undefined> {
    return read<BetaSessionContext>("sessionContext");
  },
  async saveSessionContext(sessionContext: BetaSessionContext): Promise<void> {
    return write("sessionContext", sessionContext);
  },
  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove([
      prefix + "profile",
      prefix + "pods",
      prefix + "shoes",
      prefix + "calibrations",
      prefix + "sessions",
      prefix + "sessionHistory",
      prefix + "sessionContext",
    ]);
  }
};

async function read<T>(key: LocalKeys): Promise<T | undefined> {
  const value = await AsyncStorage.getItem(prefix + key);
  return value ? (JSON.parse(value) as T) : undefined;
}

async function write<T>(key: LocalKeys, value: T): Promise<void> {
  await AsyncStorage.setItem(prefix + key, JSON.stringify(value));
}
