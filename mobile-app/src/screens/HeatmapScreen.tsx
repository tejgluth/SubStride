import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, PanResponder, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CalibratedFrame } from '@substride/analytics';
import { zoneMap } from '@substride/analytics';
import { Section } from '../components/Section';
import { FootHeatmap } from '../components/FootHeatmap';
import { colors, heatColor, radius } from '../theme';

type LoadMode = 'cumulative' | 'peak';

interface Props {
  frames: CalibratedFrame[];
}

interface HeatmapSummary {
  sampleCount: number;
  averages: number[];
  peaks: number[];
}

interface ProgressionBucket {
  startMs: number;
  endMs: number;
  combined: HeatmapSummary;
  left: HeatmapSummary;
  right: HeatmapSummary;
}

function summarizeFrames(frames: CalibratedFrame[]) {
  const sums = new Array(16).fill(0);
  const maxPerZone = new Array(16).fill(0);

  for (const frame of frames) {
    frame.relativeLoad.forEach((v, i) => {
      sums[i] += v;
      if (v > maxPerZone[i]) maxPerZone[i] = v;
    });
  }

  return {
    sampleCount: frames.length,
    averages: sums.map((s) => s / Math.max(1, frames.length)),
    peaks: maxPerZone,
  };
}

function buildProgressionBuckets(frames: CalibratedFrame[]): ProgressionBucket[] {
  if (frames.length === 0) return [];

  const timestamps = frames.map((frame) => frame.timestampMs).filter(Number.isFinite);
  if (timestamps.length === 0) return [];

  const startMs = Math.min(...timestamps);
  const endMs = Math.max(...timestamps);
  const durationMs = Math.max(1, endMs - startMs);
  // Real runs progress by minute; short simulator runs use smaller windows so playback is visible.
  const bucketMs = durationMs >= 120000 ? 60000 : Math.max(5000, Math.ceil(durationMs / 8));
  const bucketCount = Math.max(2, Math.ceil(durationMs / bucketMs));
  const grouped = Array.from({ length: bucketCount }, () => [] as CalibratedFrame[]);

  frames.forEach((frame) => {
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((frame.timestampMs - startMs) / bucketMs)));
    grouped[index].push(frame);
  });

  return grouped.map((bucketFrames, index) => {
    const bucketStart = startMs + index * bucketMs;
    const bucketEnd = index === bucketCount - 1 ? endMs : Math.min(endMs, bucketStart + bucketMs);
    const leftFrames = bucketFrames.filter((frame) => frame.foot === 'left');
    const rightFrames = bucketFrames.filter((frame) => frame.foot === 'right');
    return {
      startMs: Math.max(startMs, bucketStart),
      endMs: Math.max(bucketStart, bucketEnd),
      combined: summarizeFrames(bucketFrames),
      left: summarizeFrames(leftFrames),
      right: summarizeFrames(rightFrames),
    };
  });
}

function getActiveHeatmapDomain(values: number[]) {
  const activeValues = values.filter((value) => Number.isFinite(value) && value > 0);

  if (activeValues.length === 0) {
    return { min: 0, max: 1 };
  }

  return {
    min: Math.min(...activeValues),
    max: Math.max(...activeValues),
  };
}

function valuesForMode(summary: HeatmapSummary, mode: LoadMode) {
  return mode === 'cumulative' ? summary.averages : summary.peaks;
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function HeatmapScreen({ frames }: Props) {
  const [mode, setMode] = useState<LoadMode>('cumulative');
  const [showNames, setShowNames] = useState(false);
  const [progressionEnabled, setProgressionEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progressionIndex, setProgressionIndex] = useState(0);
  const [trackWidth, setTrackWidth] = useState(1);
  const switchAnim = useRef(new Animated.Value(0)).current;
  const progressionPanelAnim = useRef(new Animated.Value(0)).current;
  const scrubTrackRef = useRef<View>(null);
  const scrubTrackPageX = useRef(0);

  const { combined, left, right } = useMemo(() => {
    const leftFrames = frames.filter((frame) => frame.foot === 'left');
    const rightFrames = frames.filter((frame) => frame.foot === 'right');

    return {
      combined: summarizeFrames(frames),
      left: summarizeFrames(leftFrames),
      right: summarizeFrames(rightFrames),
    };
  }, [frames]);

  const progressionBuckets = useMemo(() => buildProgressionBuckets(frames), [frames]);
  const selectedBucket = progressionBuckets[Math.min(progressionIndex, Math.max(0, progressionBuckets.length - 1))];
  const activeCombined = progressionEnabled && selectedBucket ? selectedBucket.combined : combined;
  const activeLeft = progressionEnabled && selectedBucket ? selectedBucket.left : left;
  const activeRight = progressionEnabled && selectedBucket ? selectedBucket.right : right;

  const displayValues = valuesForMode(activeCombined, mode);
  const leftValues = valuesForMode(activeLeft, mode);
  const rightValues = valuesForMode(activeRight, mode);
  const domainValues = progressionEnabled && progressionBuckets.length > 0
    ? progressionBuckets.flatMap((bucket) => [
      ...valuesForMode(bucket.left, mode),
      ...valuesForMode(bucket.right, mode),
    ])
    : [...leftValues, ...rightValues];
  const heatmapDomain = getActiveHeatmapDomain(domainValues);
  const totalLoad = displayValues.reduce((a, b) => a + b, 0);
  const progressionPercent = progressionBuckets.length > 1 ? progressionIndex / (progressionBuckets.length - 1) : 0;
  const progressionLabel = selectedBucket
    ? `${Math.round(progressionPercent * 100)}% · ${formatElapsed(selectedBucket.startMs)}-${formatElapsed(selectedBucket.endMs)}`
    : '0% · 0:00-0:00';

  const regionSummary = useMemo(() => {
    const regions: Record<string, number> = { heel: 0, midfoot: 0, forefoot: 0, toe: 0 };
    zoneMap.forEach((z, i) => { regions[z.region] += displayValues[i]; });
    const total = Object.values(regions).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(regions).map(([key, val]) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      pct: (val / total) * 100,
    }));
  }, [displayValues]);

  useEffect(() => {
    Animated.timing(switchAnim, {
      toValue: progressionEnabled ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    Animated.timing(progressionPanelAnim, {
      toValue: progressionEnabled ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    if (!progressionEnabled) setIsPlaying(false);
  }, [progressionEnabled, progressionPanelAnim, switchAnim]);

  useEffect(() => {
    setProgressionIndex((current) => Math.min(current, Math.max(0, progressionBuckets.length - 1)));
  }, [progressionBuckets.length]);

  useEffect(() => {
    if (!isPlaying || !progressionEnabled || progressionBuckets.length <= 1) return undefined;
    const timer = setInterval(() => {
      setProgressionIndex((current) => (current >= progressionBuckets.length - 1 ? 0 : current + 1));
    }, 700);
    return () => clearInterval(timer);
  }, [isPlaying, progressionEnabled, progressionBuckets.length]);

  const measureScrubTrack = () => {
    scrubTrackRef.current?.measureInWindow((x, _y, width) => {
      scrubTrackPageX.current = x;
      if (width > 0) {
        setTrackWidth(width);
      }
    });
  };

  const setProgressionFromTrackX = (trackX: number) => {
    if (progressionBuckets.length <= 1) return;
    const clamped = Math.max(0, Math.min(trackWidth, trackX));
    const nextIndex = Math.round((clamped / Math.max(1, trackWidth)) * (progressionBuckets.length - 1));
    setProgressionIndex((current) => (current === nextIndex ? current : nextIndex));
  };

  const setProgressionFromPageX = (pageX: number) => {
    setProgressionFromTrackX(pageX - scrubTrackPageX.current);
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => progressionEnabled && progressionBuckets.length > 1,
    onStartShouldSetPanResponderCapture: () => progressionEnabled && progressionBuckets.length > 1,
    onMoveShouldSetPanResponder: () => progressionEnabled && progressionBuckets.length > 1,
    onMoveShouldSetPanResponderCapture: () => progressionEnabled && progressionBuckets.length > 1,
    onPanResponderGrant: (event, gestureState) => {
      setIsPlaying(false);
      measureScrubTrack();
      const pageX = event.nativeEvent.pageX || gestureState.x0;
      const initialTrackX = scrubTrackPageX.current > 0
        ? pageX - scrubTrackPageX.current
        : event.nativeEvent.locationX;
      setProgressionFromTrackX(initialTrackX);
    },
    onPanResponderMove: (_event, gestureState) => {
      setProgressionFromPageX(gestureState.moveX);
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  }), [progressionEnabled, progressionBuckets.length, trackWidth]);

  const onTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(Math.max(1, event.nativeEvent.layout.width));
    requestAnimationFrame(measureScrubTrack);
  };

  const togglePlayback = () => {
    if (progressionBuckets.length <= 1) return;
    if (!isPlaying && progressionIndex >= progressionBuckets.length - 1) {
      setProgressionIndex(0);
    }
    setIsPlaying((current) => !current);
  };

  const switchTrackColor = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.textPrimary],
  });
  const switchThumbX = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 16],
  });
  const progressionPanelStyle = {
    opacity: progressionPanelAnim,
    marginTop: progressionPanelAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 8],
    }),
    maxHeight: progressionPanelAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 96],
    }),
    transform: [{
      translateY: progressionPanelAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-8, 0],
      }),
    }],
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Mode toggles */}
      <View style={styles.toggleRow}>
        {(['cumulative', 'peak'] as LoadMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.toggleBtn, mode === m && styles.toggleActive]}
            onPress={() => setMode(m)}
          >
            <Text style={[styles.toggleText, mode === m && styles.toggleTextActive]}>
              {m === 'cumulative' ? 'Cumulative load' : 'Peak load'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Section title="Pressure heatmap" subtitle="16-zone relative load · not calibrated kPa">
        <View style={styles.heatmapPair}>
          <FootHeatmap
            zoneAverages={leftValues}
            foot="left"
            label="Left foot"
            minIntensity={heatmapDomain.min}
            maxIntensity={heatmapDomain.max}
            sampleCount={activeLeft.sampleCount}
            showZoneNames={showNames}
          />
          <FootHeatmap
            zoneAverages={rightValues}
            foot="right"
            label="Right foot"
            minIntensity={heatmapDomain.min}
            maxIntensity={heatmapDomain.max}
            sampleCount={activeRight.sampleCount}
            showZoneNames={showNames}
          />
        </View>
        <View style={styles.legend}>
          <Text style={styles.legendText}>Low</Text>
          <View style={styles.legendBar}>
            {Array.from({ length: 120 }, (_, i) => i / 119).map((t, i) => (
              <View key={i} style={[styles.legendSeg, { backgroundColor: heatColor(t) }]} />
            ))}
          </View>
          <Text style={styles.legendText}>High</Text>
        </View>
        <View style={styles.heatmapFooter}>
          <TouchableOpacity style={styles.namesBtn} onPress={() => setShowNames(!showNames)}>
            <Text style={styles.namesBtnText}>{showNames ? 'Hide zone numbers' : 'Show zone numbers'}</Text>
          </TouchableOpacity>
          <Pressable
            style={styles.progressionToggle}
            onPress={() => setProgressionEnabled((current) => !current)}
          >
            <Text style={styles.progressionToggleLabel}>Pressure progression</Text>
            <Animated.View style={[styles.switchTrack, { backgroundColor: switchTrackColor }]}>
              <Animated.View style={[styles.switchThumb, { transform: [{ translateX: switchThumbX }] }]} />
            </Animated.View>
          </Pressable>
        </View>

        <Animated.View style={[styles.progressionPanel, progressionPanelStyle]} pointerEvents={progressionEnabled ? 'auto' : 'none'}>
          <View style={styles.progressionPanelHeader}>
            <Pressable
              style={[styles.playButton, progressionBuckets.length <= 1 && styles.playButtonDisabled]}
              onPress={togglePlayback}
            >
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={13} color={colors.textInverse} />
            </Pressable>
            <Text style={styles.progressionValue}>{progressionLabel}</Text>
          </View>
          <View style={styles.scrubRow}>
            <Text style={styles.scrubEndLabel}>Start</Text>
            <View
              ref={scrubTrackRef}
              collapsable={false}
              style={styles.scrubTrack}
              onLayout={onTrackLayout}
              {...panResponder.panHandlers}
            >
              <View pointerEvents="none" style={styles.scrubRail} />
              <View pointerEvents="none" style={[styles.scrubFill, { width: `${progressionPercent * 100}%` }]} />
              <View pointerEvents="none" style={[styles.scrubHead, { left: `${progressionPercent * 100}%` }]} />
            </View>
            <Text style={styles.scrubEndLabel}>End</Text>
          </View>
        </Animated.View>
      </Section>

      {/* Region breakdown */}
      <Section title="Load by region">
        {regionSummary.map(({ key, label, pct }) => (
          <View key={key} style={styles.regionRow}>
            <Text style={styles.regionLabel}>{label}</Text>
            <View style={styles.regionTrack}>
              <View style={[styles.regionFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.regionPct} numberOfLines={1}>{pct.toFixed(1)}%</Text>
          </View>
        ))}
        <Text style={styles.note}>
          Relative fractions only — not validated pressure measurements.
        </Text>
      </Section>

      {/* Zone details */}
      <Section title="Zone table" subtitle="Tap mode to switch between average and peak">
        {zoneMap.map((zone, i) => {
          const val = displayValues[i];
          const pct = totalLoad > 0 ? ((val / totalLoad) * 100).toFixed(1) : '0.0';
          return (
            <View key={zone.id} style={styles.zoneRow}>
              <View style={[styles.zoneNum, { backgroundColor: colors.brandLight }]}>
                <Text style={styles.zoneNumText}>{i + 1}</Text>
              </View>
              <View style={styles.zoneInfo}>
                <Text style={styles.zoneName}>{zone.displayName}</Text>
                <Text style={styles.zoneTech}>{zone.region} · {zone.side}</Text>
              </View>
              <Text style={styles.zoneVal}>{pct}%</Text>
            </View>
          );
        })}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  toggleActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandLight,
  },
  toggleText: { fontSize: 13, fontWeight: '600', color: colors.textTertiary },
  toggleTextActive: { color: colors.brand },
  heatmapPair: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 10,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  legendText: { fontSize: 10, color: colors.textTertiary, fontWeight: '700' },
  legendBar: { flexDirection: 'row', height: 9, borderRadius: radius.full, overflow: 'hidden', flex: 1 },
  legendSeg: { flex: 1 },
  heatmapFooter: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  namesBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  namesBtnText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  progressionToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressionToggleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  switchTrack: {
    width: 32,
    height: 16,
    borderRadius: radius.full,
    justifyContent: 'center',
  },
  switchThumb: {
    position: 'absolute',
    top: 1,
    left: 0,
    width: 14,
    height: 14,
    borderRadius: radius.full,
    backgroundColor: colors.bgCard,
  },
  progressionPanel: {
    overflow: 'hidden',
  },
  progressionPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  playButton: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.textPrimary,
  },
  playButtonDisabled: {
    opacity: 0.36,
  },
  progressionValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  scrubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scrubEndLabel: {
    width: 34,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textTertiary,
  },
  scrubTrack: {
    flex: 1,
    height: 34,
    justifyContent: 'center',
  },
  scrubRail: {
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.border,
  },
  scrubFill: {
    position: 'absolute',
    left: 0,
    top: 13.5,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.textPrimary,
  },
  scrubHead: {
    position: 'absolute',
    top: 3,
    width: 3,
    height: 28,
    marginLeft: -1.5,
    borderRadius: radius.full,
    backgroundColor: colors.textPrimary,
  },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  regionLabel: { width: 72, fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  regionTrack: { flex: 1, height: 8, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  regionFill: { height: '100%', backgroundColor: colors.brand, borderRadius: radius.full },
  regionPct: { width: 52, fontSize: 12, fontWeight: '700', color: colors.textPrimary, textAlign: 'right', flexShrink: 0 },
  note: { marginTop: 6, fontSize: 11, color: colors.textTertiary, lineHeight: 16 },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight },
  zoneNum: { width: 26, height: 26, borderRadius: radius.sm, justifyContent: 'center', alignItems: 'center' },
  zoneNumText: { fontSize: 11, fontWeight: '800', color: colors.brand },
  zoneInfo: { flex: 1 },
  zoneName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  zoneTech: { fontSize: 11, color: colors.textTertiary, textTransform: 'capitalize' },
  zoneVal: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
});
