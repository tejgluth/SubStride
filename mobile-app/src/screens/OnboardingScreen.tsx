import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../theme';

interface Props {
  onDone: () => void;
}

const SLIDES = [
  {
    icon: '🦺',
    title: 'SubStride Lab Beta',
    body: 'A research tool for understanding foot load patterns during running. This is an early beta — data is local, no account required.',
    note: 'All data stays on your device in this build.',
  },
  {
    icon: '🦿',
    title: 'The pod + liner system',
    body: 'A small sensor pod sits inside a thin over-insole liner. The liner fits under your existing insole so it is nearly invisible inside the shoe.',
    note: '16 pressure zones + IMU · 100 Hz sample rate · standalone recording',
  },
  {
    icon: '📡',
    title: 'Standalone recording',
    body: 'The pod records your run independently — no phone connection needed. After your run, sync over Bluetooth to import the session into SubStride.',
    note: 'Sync range: ~5 metres · BLE 5.0',
  },
  {
    icon: '📊',
    title: 'What you get',
    body: 'Training Strain, pressure heatmaps, gait patterns, and load distribution across your foot. Compared to your personal baseline as it builds over sessions.',
    note: 'These are experimental load indicators — not medical measurements.',
  },
  {
    icon: '⚙️',
    title: 'Calibration first',
    body: 'Before your first run, complete a calibration sequence. This takes about 2 minutes and lets the pod learn your resting baseline and dynamic load range.',
    note: 'Calibration is per-shoe — recalibrate when you change shoes.',
  },
];

export function OnboardingScreen({ onDone }: Props) {
  const [slideIndex, setSlideIndex] = useState(0);
  const slide = SLIDES[slideIndex];
  const isLast = slideIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Slide */}
        <View style={styles.slide}>
          <Text style={styles.slideIcon}>{slide.icon}</Text>
          <Text style={styles.slideTitle}>{slide.title}</Text>
          <Text style={styles.slideBody}>{slide.body}</Text>
          <View style={styles.slideNote}>
            <Text style={styles.slideNoteText}>{slide.note}</Text>
          </View>
        </View>

        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => setSlideIndex(i)}>
              <View style={[styles.dot, i === slideIndex && styles.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Navigation */}
        <View style={styles.navRow}>
          {slideIndex > 0 ? (
            <TouchableOpacity style={styles.backBtn} onPress={() => setSlideIndex(slideIndex - 1)}>
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.backBtn} />
          )}
          <TouchableOpacity
            style={[styles.nextBtn, isLast && styles.nextBtnDone]}
            onPress={isLast ? onDone : () => setSlideIndex(slideIndex + 1)}
          >
            <Text style={styles.nextBtnText}>{isLast ? 'Get started' : 'Next'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.skipBtn} onPress={onDone}>
          <Text style={styles.skipBtnText}>Skip intro</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { flexGrow: 1, padding: 24, justifyContent: 'center', gap: 32 },
  slide: { alignItems: 'center', gap: 16 },
  slideIcon: { fontSize: 60 },
  slideTitle: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  slideBody: { fontSize: 16, lineHeight: 24, color: colors.textSecondary, textAlign: 'center' },
  slideNote: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.brandLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brandBorder,
  },
  slideNoteText: { fontSize: 13, color: colors.brand, fontWeight: '600', textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 24, backgroundColor: colors.brand },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  backBtnText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  nextBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    backgroundColor: colors.brand,
    borderRadius: radius.xl,
  },
  nextBtnDone: { backgroundColor: colors.success },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: colors.textInverse },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipBtnText: { fontSize: 13, color: colors.textTertiary },
});
