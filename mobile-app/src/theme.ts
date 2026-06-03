export const colors = {
  brand: '#1b6ef3',
  brandDark: '#1456c8',
  brandLight: '#edf4ff',
  brandBorder: '#bfd5fd',

  bgPrimary: '#f5f6f8',
  bgCard: '#ffffff',
  bgCardAlt: '#f9fafb',

  border: '#e0e4ea',
  borderLight: '#edf0f4',

  textPrimary: '#17202c',
  textSecondary: '#4a5565',
  textTertiary: '#8492a6',
  textInverse: '#ffffff',
  textBrand: '#1b6ef3',

  success: '#16a34a',
  successLight: '#dcfce7',
  successBorder: '#86efac',
  warning: '#d97706',
  warningLight: '#fef3c7',
  warningBorder: '#fcd34d',
  error: '#dc2626',
  errorLight: '#fee2e2',
  errorBorder: '#fca5a5',

  simPurple: '#7c3aed',
  simPurpleLight: '#ede9fe',

  scoreLow: '#16a34a',
  scoreModerate: '#1b6ef3',
  scoreHigh: '#d97706',
  scoreVeryHigh: '#dc2626',
};

export function scoreColor(category: string): string {
  if (category === 'low') return colors.scoreLow;
  if (category === 'moderate') return colors.scoreModerate;
  if (category === 'high') return colors.scoreHigh;
  return colors.scoreVeryHigh;
}

// Continuous green→amber→red gradient. Pass higherIsBetter=true to invert (green at high values).
export function scoreGradientColor(score: number, higherIsBetter = false): string {
  const s = higherIsBetter ? 100 - score : score;
  const t = Math.max(0, Math.min(1, s / 100));
  if (t <= 0.5) {
    const u = t / 0.5;
    const r = Math.round(22 + u * (245 - 22));
    const g = Math.round(163 + u * (158 - 163));
    const b = Math.round(74 + u * (11 - 74));
    return `rgb(${r},${g},${b})`;
  }
  const u = (t - 0.5) / 0.5;
  const r = Math.round(245 + u * (220 - 245));
  const g = Math.round(158 + u * (38 - 158));
  const b = Math.round(11 + u * (38 - 11));
  return `rgb(${r},${g},${b})`;
}

export function heatColor(intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity));
  if (t < 0.35) {
    const s = t / 0.35;
    const r = Math.round(34 + s * (132 - 34));
    const g = Math.round(197 + s * (204 - 197));
    const b = Math.round(94 + s * (22 - 94));
    return `rgb(${r},${g},${b})`;
  }
  if (t < 0.65) {
    const s = (t - 0.35) / 0.3;
    const r = Math.round(132 + s * (245 - 132));
    const g = Math.round(204 + s * (158 - 204));
    const b = Math.round(22 + s * (11 - 22));
    return `rgb(${r},${g},${b})`;
  }
  const s = (t - 0.65) / 0.35;
  const r = Math.round(245 + s * (220 - 245));
  const g = Math.round(158 + s * (38 - 158));
  const b = Math.round(11 + s * (38 - 11));
  return `rgb(${r},${g},${b})`;
}

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
};

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
};
