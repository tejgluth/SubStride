import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { RunSummaryScreen } from './src/screens/RunSummaryScreen';
import { HeatmapScreen } from './src/screens/HeatmapScreen';
import { InsightsScreen } from './src/screens/InsightsScreen';
import { TrendsScreen } from './src/screens/TrendsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SessionsScreen } from './src/screens/SessionsScreen';
import { ValidationScreen } from './src/screens/ValidationScreen';
import { PairingScreen } from './src/screens/PairingScreen';
import { PostRunScreen } from './src/screens/PostRunScreen';

import type { AppTab } from './src/navigation/types';
import { colors, radius } from './src/theme';
import {
  addShoeProfile,
  buildRunComputation,
  createDefaultBetaAppState,
  setPodConnection,
  type BetaAppState,
  type BetaSessionContext,
} from './src/domain/betaAppModel';
import { localStore } from './src/storage/localStore';
import { podBleService } from './src/services/podBleService';

type RunPhase = 'pre_run' | 'recording' | 'post_run';

// Main tabs always visible
const MAIN_TABS: { id: AppTab; label: string; icon: string }[] = [
  { id: 'home', label: 'Run', icon: '⚡' },
  { id: 'heatmap', label: 'Map', icon: '🗺' },
  { id: 'insights', label: 'Insights', icon: '💡' },
  { id: 'trends', label: 'Trends', icon: '📈' },
  { id: 'connect', label: 'Connect', icon: '🔗' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

// Extra tabs shown only in developer mode
const DEV_TABS: { id: AppTab; label: string; icon: string }[] = [
  { id: 'sessions', label: 'Scen.', icon: '🔬' },
  { id: 'debug', label: 'Debug', icon: '🛠' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [scenario, setScenario] = useState<string>('normal_easy_run');
  const [devMode, setDevMode] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [appState, setAppState] = useState<BetaAppState>(() => createDefaultBetaAppState());
  const [hydrated, setHydrated] = useState(false);
  const [runPhase, setRunPhase] = useState<RunPhase>('pre_run');

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const defaults = createDefaultBetaAppState();
      const [profile, shoes, pods, sessionHistory, sessionContext] = await Promise.all([
        localStore.getProfile(),
        localStore.listShoes(),
        localStore.listPods(),
        localStore.listSessionHistory(),
        localStore.getSessionContext(),
      ]);
      if (cancelled) return;
      const nextShoes = shoes.length > 0 ? shoes : defaults.shoes;
      setAppState({
        profile: profile ?? defaults.profile,
        shoes: nextShoes,
        pods: pods.length > 0 ? pods : defaults.pods,
        sessionContext: sessionContext ?? {
          ...defaults.sessionContext,
          shoeId: nextShoes[0]?.id,
        },
        sessionHistory,
      });
      setHydrated(true);
    }
    hydrate().catch(() => setHydrated(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStore.saveProfile(appState.profile).catch(() => undefined);
    localStore.saveShoes(appState.shoes).catch(() => undefined);
    localStore.savePods(appState.pods).catch(() => undefined);
    localStore.saveSessionHistory(appState.sessionHistory).catch(() => undefined);
    localStore.saveSessionContext(appState.sessionContext).catch(() => undefined);
  }, [appState, hydrated]);

  const computed = useMemo(() => {
    return buildRunComputation(appState, scenario as any, { durationSeconds: 45 });
  }, [appState, scenario]);

  const updateSessionContext = (patch: Partial<BetaSessionContext>) => {
    setAppState((current) => ({
      ...current,
      sessionContext: { ...current.sessionContext, ...patch },
    }));
  };

  const addShoe = () => {
    setAppState((current) => {
      const shoe = addShoeProfile(current.shoes);
      return {
        ...current,
        shoes: [...current.shoes, shoe],
        sessionContext: { ...current.sessionContext, shoeId: shoe.id },
      };
    });
  };

  const updatePodConnection = (podId: string, connection: 'connected' | 'available' | 'disconnected') => {
    setAppState((current) => ({ ...current, pods: setPodConnection(current.pods, podId, connection) }));
  };

  const renameShoe = (shoeId: string, name: string) => {
    setAppState((current) => ({
      ...current,
      shoes: current.shoes.map((shoe) => (shoe.id === shoeId ? { ...shoe, name } : shoe)),
    }));
  };

  const startRun = async () => {
    setRunPhase('recording');
    await Promise.allSettled(computed.connectedPods.map((pod) => podBleService.startRecording(pod.id)));
  };

  const endRun = async () => {
    await Promise.allSettled(computed.connectedPods.map((pod) => podBleService.stopRecording(pod.id)));
    setRunPhase('post_run');
    setActiveTab('home');
  };

  const saveCurrentSession = () => {
    setAppState((current) => ({
      ...current,
      sessionHistory: [...current.sessionHistory, computed.sessionRecord].slice(-25),
    }));
    setRunPhase('pre_run');
  };

  const discardCurrentSession = () => {
    setRunPhase('pre_run');
  };

  const clearLocalData = async () => {
    await localStore.clearAll();
    setAppState(createDefaultBetaAppState());
  };

  const visibleTabs = devMode ? [...MAIN_TABS, ...DEV_TABS] : MAIN_TABS;

  if (showOnboarding) {
    return (
      <>
        <StatusBar style="dark" />
        <SafeAreaView style={styles.safe}>
          <OnboardingScreen onDone={() => setShowOnboarding(false)} />
        </SafeAreaView>
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>SubStride Lab</Text>
          <Text style={styles.headerSub}>
            {computed.connectedPods.length > 0 ? `${computed.connectedPods.length} pod mode` : 'Simulator fallback'} · {computed.session.label}
          </Text>
        </View>
        <View style={styles.strainPill}>
          <Text style={styles.strainLabel}>Strain</Text>
          <Text style={styles.strainValue}>{computed.metrics.trainingStrain.value}</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBarWrapper}>
        <View style={styles.tabBarContent}>
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const isDev = DEV_TABS.some((d) => d.id === tab.id);
            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.tab,
                  { width: `${100 / visibleTabs.length}%` },
                  isActive && styles.tabActive,
                  isDev && styles.tabDev,
                ]}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>{tab.icon}</Text>
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive, isDev && styles.tabLabelDev]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Screen content */}
      <ScrollView
        key={activeTab}
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'home' && runPhase === 'post_run' && (
          <PostRunScreen
            computed={computed}
            shoes={appState.shoes}
            onUpdateContext={updateSessionContext}
            onSaveSession={saveCurrentSession}
            onDiscard={discardCurrentSession}
          />
        )}
        {activeTab === 'home' && runPhase !== 'post_run' && (
          <RunSummaryScreen
            computed={computed}
            isRunning={runPhase === 'recording'}
            onStartRun={startRun}
            onEndRun={endRun}
          />
        )}
        {activeTab === 'heatmap' && <HeatmapScreen frames={computed.frames} />}
        {activeTab === 'insights' && (
          <InsightsScreen
            metrics={computed.metrics}
            explanation={computed.explanation}
            isSimulated
          />
        )}
        {activeTab === 'trends' && <TrendsScreen metrics={computed.metrics} history={computed.history} baseline={computed.baseline} />}
        {activeTab === 'connect' && (
          <PairingScreen
            pods={appState.pods}
            onSetConnection={updatePodConnection}
            onSyncSession={saveCurrentSession}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsScreen
            devMode={devMode}
            onToggleDevMode={setDevMode}
            profile={appState.profile}
            shoes={appState.shoes}
            pods={appState.pods}
            context={computed.context}
            onUpdateContext={updateSessionContext}
            onAddShoe={addShoe}
            onRenameShoe={renameShoe}
            onSetPodConnection={updatePodConnection}
            onClearLocalData={clearLocalData}
          />
        )}
        {activeTab === 'sessions' && devMode && (
          <SessionsScreen selectedScenario={scenario} onSelectScenario={setScenario} />
        )}
        {activeTab === 'debug' && devMode && (
          <ValidationScreen
            metrics={computed.metrics}
            calibration={computed.calibration}
            frames={computed.frames}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: colors.bgCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
  headerSub: { marginTop: 2, fontSize: 11, color: colors.textTertiary },
  strainPill: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.brandLight,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.brandBorder,
  },
  strainLabel: { fontSize: 9, fontWeight: '700', color: colors.brand, textTransform: 'uppercase', letterSpacing: 0.5 },
  strainValue: { fontSize: 22, fontWeight: '800', color: colors.brand, lineHeight: 26 },

  // Tab bar
  tabBarWrapper: {
    backgroundColor: colors.bgCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tabBarContent: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    paddingLeft: 6,
    paddingRight: 6,
    gap: 0,
  },
  tab: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
    gap: 2,
  },
  tabActive: { borderBottomColor: colors.brand },
  tabDev: { opacity: 0.8 },
  tabIcon: { fontSize: 16 },
  tabIconActive: {},
  tabLabel: { fontSize: 11, fontWeight: '600', color: colors.textTertiary },
  tabLabelActive: { color: colors.brand },
  tabLabelDev: { color: colors.simPurple },

  // Screen content
  screenContent: { padding: 16, paddingBottom: 40 },
});
