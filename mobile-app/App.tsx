import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AI_PROMPT_VERSION, canShowAiExplanation, computeLongitudinalTrainingLoad, deterministicExplanation, type RunMetrics, type RunSummaryAndSuggestionsContent, type UserProfile } from '@substride/analytics';

import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { CloudAccountScreen } from './src/screens/CloudAccountScreen';
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
import { colors, radius, scoreGradientColor } from './src/theme';
import {
  addShoeProfile,
  buildRunComputation,
  createDefaultBetaAppState,
  framesForSessionRecord,
  labelForSurface,
  labelForWorkout,
  runNameForContext,
  setPodConnection,
  type BetaAppState,
  type BetaSessionContext,
  type BetaSessionRecord,
} from './src/domain/betaAppModel';
import { localStore } from './src/storage/localStore';
import { podBleService } from './src/services/podBleService';
import {
  getCloudAuthState,
  isSupabaseConfigured,
  onCloudAuthStateChange,
  signInWithEmail,
  signOutOfCloud,
  signUpWithEmail,
  syncSessionHistoryToCloud,
  type CloudAuthState,
  type CloudSyncStatus,
} from './src/services/supabaseClient';
import { buildLocalRunExplanation, explainRun, type RunExplanationResult } from './src/services/openAiExplanations';

type RunPhase = 'pre_run' | 'recording' | 'post_run';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type AutoRunExplanationState = {
  requestKey: string | null;
  content: RunExplanationResult['content'] | null;
  source: RunExplanationResult['source'] | null;
  errorCode: string | null;
  loading: boolean;
};

type RunSummaryProfileContext = {
  runName: string;
  shoe: string;
  surface: string;
  workoutType: string;
  painScore0To10: number;
};

type RunSummaryTarget = {
  requestKey: string;
  sessionId: string;
  metrics: RunMetrics;
  explanation: string;
  profileContext: RunSummaryProfileContext;
  saved: boolean;
  cachedSummary?: BetaSessionRecord['aiSummary'];
};

function emptyRunExplanationState(): AutoRunExplanationState {
  return {
    requestKey: null,
    content: null,
    source: null,
    errorCode: null,
    loading: false,
  };
}

// Main tabs always visible
const MAIN_TABS: { id: AppTab; label: string; icon: IoniconName }[] = [
  { id: 'home', label: 'Run', icon: 'flash-outline' },
  { id: 'heatmap', label: 'Map', icon: 'map-outline' },
  { id: 'insights', label: 'Insights', icon: 'bulb-outline' },
  { id: 'trends', label: 'Trends', icon: 'trending-up-outline' },
  { id: 'connect', label: 'Connect', icon: 'bluetooth-outline' },
  { id: 'settings', label: 'Settings', icon: 'settings-outline' },
];

// Extra tabs shown only in developer mode
const DEV_TABS: { id: AppTab; label: string; icon: IoniconName }[] = [
  { id: 'sessions', label: 'Scen.', icon: 'flask-outline' },
  { id: 'debug', label: 'Debug', icon: 'bug-outline' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [scenario, setScenario] = useState<string>('normal_easy_run');
  const [devMode, setDevMode] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [appState, setAppState] = useState<BetaAppState>(() => createDefaultBetaAppState());
  const [hydrated, setHydrated] = useState(false);
  const [runPhase, setRunPhase] = useState<RunPhase>('pre_run');
  const [viewedAtMs, setViewedAtMs] = useState(() => Date.now());
  const [cloudAuth, setCloudAuth] = useState<CloudAuthState>({ configured: isSupabaseConfigured, session: null, user: null });
  const [cloudAuthReady, setCloudAuthReady] = useState(false);
  const [localOnlyAccepted, setLocalOnlyAccepted] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>({ state: 'idle' });
  const [completedRunSequence, setCompletedRunSequence] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [runExplanationState, setRunExplanationState] = useState<AutoRunExplanationState>(() => emptyRunExplanationState());
  const lastAutoSyncKey = useRef('');
  const lastAutoSummaryKey = useRef('');
  const autoSummaryRequestSequence = useRef(0);
  const lastHardwareErrorKey = useRef('');

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

  useEffect(() => {
    const timer = setInterval(() => setViewedAtMs(Date.now()), 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCloudAuthState()
      .then((state) => {
        if (!cancelled) {
          setCloudAuth(state);
          setCloudAuthReady(true);
        }
      })
      .catch(() => setCloudAuthReady(true));
    const unsubscribe = onCloudAuthStateChange((state) => {
      if (!cancelled) {
        setCloudAuth(state);
        setCloudAuthReady(true);
        if (state.user) setLocalOnlyAccepted(false);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const computed = useMemo(() => {
    return buildRunComputation(appState, scenario as any, { durationSeconds: 45, asOf: viewedAtMs });
  }, [appState, scenario, viewedAtMs]);

  const savedLongitudinalLoad = useMemo(() => (
    computeLongitudinalTrainingLoad(
      appState.sessionHistory.map((record) => ({
        session: record.session,
        metrics: record.metrics,
        painScore0To10: record.context.painScore0To10,
      })),
      { asOf: viewedAtMs }
    )
  ), [appState.sessionHistory, viewedAtMs]);

  useEffect(() => {
    if (runPhase === 'post_run') return;
    const latestSessionId = appState.sessionHistory[appState.sessionHistory.length - 1]?.session.id ?? null;
    if (!latestSessionId) {
      if (selectedSessionId) setSelectedSessionId(null);
      return;
    }
    const selectedStillExists = appState.sessionHistory.some((record) => record.session.id === selectedSessionId);
    if (!selectedStillExists) setSelectedSessionId(latestSessionId);
  }, [appState.sessionHistory, runPhase, selectedSessionId]);

  const selectedHistoryRecord = useMemo(() => {
    if (appState.sessionHistory.length === 0) return null;
    return appState.sessionHistory.find((record) => record.session.id === selectedSessionId)
      ?? appState.sessionHistory[appState.sessionHistory.length - 1];
  }, [appState.sessionHistory, selectedSessionId]);

  const displayedMetrics = useMemo(() => (
    runPhase === 'post_run'
      ? computed.metrics
      : selectedHistoryRecord?.metrics ?? computed.metrics
  ), [computed.metrics, runPhase, selectedHistoryRecord]);

  const displayedFrames = useMemo(() => (
    runPhase === 'post_run'
      ? computed.frames
      : selectedHistoryRecord
        ? framesForSessionRecord(selectedHistoryRecord, appState.pods)
        : computed.frames
  ), [appState.pods, computed.frames, runPhase, selectedHistoryRecord]);

  const hardwareError = useMemo(() => {
    const failingCalibrations = computed.calibrations.filter((calibration) => (
      calibration.quality === 'fail'
      || calibration.badChannels.some((finding) => finding.severity === 'fail')
    ));
    const hardwareBlocking = computed.metrics.confidence.blocking.filter((code) => (
      code === 'calibration_failed'
      || code === 'severe_packet_loss'
      || code === 'too_many_bad_channels'
    ));
    if (failingCalibrations.length === 0 && hardwareBlocking.length === 0) return null;

    const badChannelCount = failingCalibrations.reduce((sum, calibration) => (
      sum + calibration.badChannels.filter((finding) => finding.severity === 'fail').length
    ), 0);
    const reason = [
      badChannelCount > 0 ? `${badChannelCount} failed sensor channel${badChannelCount === 1 ? '' : 's'}` : null,
      ...hardwareBlocking.map((code) => code.replace(/_/g, ' ')),
    ].filter(Boolean).join(' · ');

    return {
      key: `${computed.metrics.sessionId}:${reason}`,
      title: 'Hardware error detected',
      message: `${reason || 'A pod or calibration failure was detected.'} This run should not be used for results until the pod, insole placement, or calibration is fixed.`,
    };
  }, [computed.calibrations, computed.metrics.confidence.blocking, computed.metrics.sessionId]);

  useEffect(() => {
    if (!hardwareError) return;
    if (lastHardwareErrorKey.current === hardwareError.key) return;
    lastHardwareErrorKey.current = hardwareError.key;
    Alert.alert(hardwareError.title, hardwareError.message);
  }, [hardwareError]);

  const insightProfileContext = useMemo(() => ({
    runName: runNameForContext(computed.context),
    shoe: computed.activeShoe?.name ?? 'Unknown shoe',
    surface: labelForSurface(computed.context.surface),
    workoutType: labelForWorkout(computed.context.workoutType),
    painScore0To10: computed.context.painScore0To10,
  }), [
    computed.activeShoe?.name,
    computed.context.painScore0To10,
    computed.context.surface,
    computed.context.workoutType,
  ]);

  const autoSummaryRequestKey = useMemo(() => JSON.stringify({
    completedRunSequence,
    sessionId: computed.metrics.sessionId,
    totalLoad: computed.metrics.totalTrainingLoad.value.score0To100,
    mechanicalLoad: computed.metrics.mechanicalLoad.value.score0To100,
    perceivedLoad: computed.metrics.perceivedLoad.value.score0To100,
    confidence: computed.metrics.confidence.level,
    scoreShowable: computed.metrics.confidence.scoreShowable,
    profileContext: insightProfileContext,
  }), [
    completedRunSequence,
    computed.metrics.confidence.level,
    computed.metrics.confidence.scoreShowable,
    computed.metrics.mechanicalLoad.value.score0To100,
    computed.metrics.perceivedLoad.value.score0To100,
    computed.metrics.sessionId,
    computed.metrics.totalTrainingLoad.value.score0To100,
    insightProfileContext,
  ]);

  const currentRunSummaryTarget = useMemo<RunSummaryTarget | null>(() => (
    completedRunSequence > 0
      ? {
        requestKey: autoSummaryRequestKey,
        sessionId: computed.sessionRecord.session.id,
        metrics: computed.metrics,
        explanation: computed.explanation,
        profileContext: insightProfileContext,
        saved: false,
      }
      : null
  ), [autoSummaryRequestKey, completedRunSequence, computed.explanation, computed.metrics, insightProfileContext]);

  const selectedRunSummaryTarget = useMemo<RunSummaryTarget | null>(() => {
    if (!selectedHistoryRecord) return null;
    const shoe = appState.shoes.find((candidate) => candidate.id === selectedHistoryRecord.context.shoeId) ?? appState.shoes[0];
    const profileContext = {
      runName: selectedHistoryRecord.label,
      shoe: shoe?.name ?? 'Unknown shoe',
      surface: labelForSurface(selectedHistoryRecord.context.surface),
      workoutType: labelForWorkout(selectedHistoryRecord.context.workoutType),
      painScore0To10: selectedHistoryRecord.context.painScore0To10,
    };
    return {
      requestKey: JSON.stringify({
        savedSessionId: selectedHistoryRecord.session.id,
        endedAt: selectedHistoryRecord.session.endedAt,
        totalLoad: selectedHistoryRecord.metrics.totalTrainingLoad.value.score0To100,
        mechanicalLoad: selectedHistoryRecord.metrics.mechanicalLoad.value.score0To100,
        perceivedLoad: selectedHistoryRecord.metrics.perceivedLoad.value.score0To100,
        confidence: selectedHistoryRecord.metrics.confidence.level,
        scoreShowable: selectedHistoryRecord.metrics.confidence.scoreShowable,
        profileContext,
      }),
      sessionId: selectedHistoryRecord.session.id,
      metrics: selectedHistoryRecord.metrics,
      explanation: deterministicExplanation(selectedHistoryRecord.metrics),
      profileContext,
      saved: true,
      cachedSummary: selectedHistoryRecord.aiSummary,
    };
  }, [appState.shoes, selectedHistoryRecord]);

  const activeRunSummaryTarget = runPhase === 'post_run'
    ? currentRunSummaryTarget
    : selectedRunSummaryTarget;

  const cacheSummaryForTarget = (
    target: RunSummaryTarget,
    content: RunSummaryAndSuggestionsContent,
    source: RunExplanationResult['source']
  ) => {
    if (source !== 'local' && source !== 'cloud') return;
    if (!target.saved) return;
    setAppState((current) => ({
      ...current,
      sessionHistory: current.sessionHistory.map((record) => (
        record.session.id === target.sessionId
          ? {
            ...record,
            aiSummary: {
              requestKey: target.requestKey,
              promptVersion: AI_PROMPT_VERSION,
              generatedAt: new Date().toISOString(),
              source,
              content,
            },
          }
          : record
      )),
    }));
  };

  useEffect(() => {
    if (!activeRunSummaryTarget) {
      lastAutoSummaryKey.current = '';
      autoSummaryRequestSequence.current += 1;
      setRunExplanationState((current) => (
        current.requestKey || current.content || current.source || current.errorCode || current.loading
          ? emptyRunExplanationState()
          : current
      ));
      return;
    }

    const { requestKey, metrics, profileContext } = activeRunSummaryTarget;
    const cachedSummary = activeRunSummaryTarget.cachedSummary;
    if (cachedSummary?.requestKey === requestKey) {
      lastAutoSummaryKey.current = requestKey;
      autoSummaryRequestSequence.current += 1;
      setRunExplanationState({
        requestKey,
        content: cachedSummary.content,
        source: cachedSummary.source,
        errorCode: null,
        loading: false,
      });
      return;
    }

    if (!canShowAiExplanation(metrics)) {
      const localResult = buildLocalRunExplanation(metrics, { profileContext });
      lastAutoSummaryKey.current = requestKey;
      autoSummaryRequestSequence.current += 1;
      setRunExplanationState({
        requestKey,
        content: localResult.content,
        source: localResult.source,
        errorCode: localResult.errorCode ?? null,
        loading: false,
      });
      return;
    }

    if (requestKey === lastAutoSummaryKey.current) return;
    lastAutoSummaryKey.current = requestKey;
    const requestId = autoSummaryRequestSequence.current + 1;
    autoSummaryRequestSequence.current = requestId;

    setRunExplanationState((current) => ({
      requestKey,
      content: current.requestKey === requestKey
        ? current.content
        : buildLocalRunExplanation(metrics, { profileContext }).content,
      source: current.requestKey === requestKey ? current.source : 'local',
      errorCode: null,
      loading: true,
    }));

    const timer = setTimeout(() => {
      explainRun(metrics, { profileContext, cacheKey: requestKey })
        .then((result) => {
          if (autoSummaryRequestSequence.current !== requestId) return;
          setRunExplanationState({
            requestKey,
            content: result.content,
            source: result.source,
            errorCode: result.errorCode ?? null,
            loading: false,
          });
          cacheSummaryForTarget(activeRunSummaryTarget, result.content, result.source);
        })
        .catch((error) => {
          if (autoSummaryRequestSequence.current !== requestId) return;
          const localResult = buildLocalRunExplanation(metrics, { profileContext });
          setRunExplanationState({
            requestKey,
            content: localResult.content,
            source: localResult.source,
            errorCode: error instanceof Error ? error.message : 'summary_unavailable',
            loading: false,
          });
          cacheSummaryForTarget(activeRunSummaryTarget, localResult.content, localResult.source);
        });
    }, 350);

    return () => clearTimeout(timer);
  }, [activeRunSummaryTarget]);

  useEffect(() => {
    if (!hydrated || !cloudAuthReady || !cloudAuth.configured || !cloudAuth.user) return;
    const syncKey = JSON.stringify({
      userId: cloudAuth.user.id,
      profile: appState.profile,
      shoes: appState.shoes,
      pods: appState.pods,
      sessions: appState.sessionHistory.map((record) => ({
        id: record.session.id,
        updatedAt: record.session.endedAt ?? record.session.createdAt,
        summaryAt: record.aiSummary?.generatedAt ?? null,
        frameCount: record.frames?.length ?? 0,
      })),
    });
    if (syncKey === lastAutoSyncKey.current) return;

    const timer = setTimeout(() => {
      lastAutoSyncKey.current = syncKey;
      setCloudSyncStatus({ state: 'syncing' });
      syncSessionHistoryToCloud({
        profile: appState.profile,
        shoes: appState.shoes,
        pods: appState.pods,
        records: appState.sessionHistory,
      })
        .then((result) => {
          if (result.skipped) {
            setCloudSyncStatus({ state: 'disabled', reason: result.reason === 'not_signed_in' ? 'not_signed_in' : 'supabase_not_configured' });
            return;
          }
          setCloudSyncStatus({ state: 'synced', at: new Date().toISOString() });
        })
        .catch((error) => {
          setCloudSyncStatus({ state: 'error', message: error instanceof Error ? error.message : 'Cloud autosync failed' });
        });
    }, 800);

    return () => clearTimeout(timer);
  }, [appState.pods, appState.profile, appState.sessionHistory, appState.shoes, cloudAuth.configured, cloudAuth.user, cloudAuthReady, hydrated]);

  const updateSessionContext = (patch: Partial<BetaSessionContext>) => {
    setAppState((current) => ({
      ...current,
      sessionContext: { ...current.sessionContext, ...patch },
    }));
  };

  const updateProfile = (patch: Partial<UserProfile>) => {
    setAppState((current) => ({
      ...current,
      profile: { ...current.profile, ...patch },
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
    setRunExplanationState(emptyRunExplanationState());
    setRunPhase('recording');
    await Promise.allSettled(computed.connectedPods.map((pod) => podBleService.startRecording(pod.id)));
  };

  const endRun = async () => {
    await Promise.allSettled(computed.connectedPods.map((pod) => podBleService.stopRecording(pod.id)));
    setCompletedRunSequence((current) => current + 1);
    setRunPhase('post_run');
    setActiveTab('home');
  };

  const saveCurrentSession = () => {
    const aiSummary = currentRunSummaryTarget
      && runExplanationState.requestKey === currentRunSummaryTarget.requestKey
      && runExplanationState.content
      && (runExplanationState.source === 'local' || runExplanationState.source === 'cloud')
      ? {
        requestKey: currentRunSummaryTarget.requestKey,
        promptVersion: AI_PROMPT_VERSION,
        generatedAt: new Date().toISOString(),
        source: runExplanationState.source,
        content: runExplanationState.content,
      }
      : undefined;
    const recordToSave: BetaSessionRecord = aiSummary
      ? { ...computed.sessionRecord, aiSummary }
      : computed.sessionRecord;
    setAppState((current) => ({
      ...current,
      sessionHistory: [...current.sessionHistory, recordToSave].slice(-25),
    }));
    setSelectedSessionId(recordToSave.session.id);
    setRunPhase('pre_run');
  };

  const discardCurrentSession = () => {
    setRunExplanationState(emptyRunExplanationState());
    setRunPhase('pre_run');
  };

  const clearLocalData = async () => {
    await localStore.clearAll();
    setAppState(createDefaultBetaAppState());
  };

  const cloudSignIn = async (email: string, password: string) => {
    await signInWithEmail(email, password);
    setLocalOnlyAccepted(false);
    setCloudAuth(await getCloudAuthState());
  };

  const cloudSignUp = async (email: string, password: string) => {
    await signUpWithEmail(email, password);
    setLocalOnlyAccepted(false);
    setCloudAuth(await getCloudAuthState());
  };

  const cloudSignOut = async () => {
    await signOutOfCloud();
    setCloudAuth(await getCloudAuthState());
    setCloudSyncStatus({ state: 'idle' });
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

  if (isSupabaseConfigured && !cloudAuthReady) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.cloudLoading}>
          <Text style={styles.cloudLoadingTitle}>Checking beta account</Text>
          <Text style={styles.cloudLoadingText}>SubStride is loading your saved cloud session.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (cloudAuth.configured && !cloudAuth.user && !localOnlyAccepted) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <CloudAccountScreen
          syncStatus={cloudSyncStatus}
          onSignIn={cloudSignIn}
          onSignUp={cloudSignUp}
          onContinueLocal={() => {
            setLocalOnlyAccepted(true);
            setCloudSyncStatus({ state: 'disabled', reason: 'not_signed_in' });
          }}
        />
      </SafeAreaView>
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
        {(() => {
          const loadScore = runPhase === 'post_run'
            ? (
              computed.metrics.confidence.scoreShowable
                ? computed.metrics.totalTrainingLoad.value.score0To100
                : null
            )
            : (
              savedLongitudinalLoad.validSessionCount > 0
                ? savedLongitudinalLoad.currentLoadScore0To100
                : null
            );
          const loadColor = loadScore != null ? scoreGradientColor(loadScore) : colors.brand;
          return (
            <View style={[styles.strainPill, { backgroundColor: loadColor, borderColor: loadColor }]}>
              <Text style={styles.strainLabel}>
                {runPhase === 'post_run' ? 'Run' : 'Current'}
              </Text>
              <Text style={styles.strainValue}>
                {loadScore ?? '—'}
              </Text>
            </View>
          );
        })()}
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
                <Ionicons
                  name={tab.icon}
                  size={20}
                  color={isDev ? colors.simPurple : isActive ? colors.brand : colors.textTertiary}
                />
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
        {activeTab === 'heatmap' && <HeatmapScreen frames={displayedFrames} />}
        {activeTab === 'insights' && (
          <InsightsScreen
            metrics={activeRunSummaryTarget?.metrics ?? displayedMetrics}
            explanation={activeRunSummaryTarget?.explanation ?? computed.explanation}
            isSimulated
            devMode={devMode}
            hasRunSummaryTarget={Boolean(activeRunSummaryTarget)}
            summaryContent={runExplanationState.content}
            summarySource={runExplanationState.source}
            summaryError={runExplanationState.errorCode}
            summaryBusy={runExplanationState.loading}
          />
        )}
        {activeTab === 'trends' && (
          <TrendsScreen
            metrics={displayedMetrics}
            history={appState.sessionHistory}
            shoes={appState.shoes}
            selectedSessionId={selectedHistoryRecord?.session.id ?? null}
            onSelectSession={setSelectedSessionId}
            baseline={computed.baseline}
            longitudinalLoad={savedLongitudinalLoad}
          />
        )}
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
            onUpdateProfile={updateProfile}
            onUpdateContext={updateSessionContext}
            onAddShoe={addShoe}
            onRenameShoe={renameShoe}
            onSetPodConnection={updatePodConnection}
            onClearLocalData={clearLocalData}
            cloudAuth={cloudAuth}
            cloudSyncStatus={cloudSyncStatus}
            onCloudSignIn={cloudSignIn}
            onCloudSignUp={cloudSignUp}
            onCloudSignOut={cloudSignOut}
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
  cloudLoading: { flex: 1, justifyContent: 'center', padding: 24, gap: 8 },
  cloudLoadingTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  cloudLoadingText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },

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
    justifyContent: 'center',
    minWidth: 62,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  strainLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.88)', textTransform: 'uppercase', letterSpacing: 0.4 },
  strainValue: { fontSize: 24, fontWeight: '900', color: colors.textInverse, lineHeight: 27 },

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
  tabLabel: { fontSize: 11, fontWeight: '600', color: colors.textTertiary },
  tabLabelActive: { color: colors.brand },
  tabLabelDev: { color: colors.simPurple },

  // Screen content
  screenContent: { padding: 16, paddingBottom: 40 },
});
