import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
import { heatColor, colors } from '../theme';

type FootSide = 'left' | 'right';

interface Props {
  zoneAverages?: number[];
  foot: FootSide;
  label: string;
  minIntensity?: number;
  maxIntensity: number;
  sampleCount?: number;
  showZoneNames?: boolean;
}

const OUTER_TRANSFORM = 'matrix(0.1,0,0,-0.1,96.850394,935.350394)';
const FOOT_TRANSFORM: Record<FootSide, string> = {
  left: 'matrix(-1,0,0,1,7400.331937,0)',
  right: 'matrix(1,0,0,1,1220,0)',
};
const FOOT_VIEW_BOX: Record<FootSide, string> = {
  left: '260 0 285 805',
  right: '510 0 285 805',
};

const OUTLINE = {
  transform: 'matrix(0.881302,0,0,0.881302,526.354687,1307.773301)',
  d: 'M3805,9025C3576,8983 3376,8831 3234,8593C3113,8389 3003,8042 2939,7662C2864,7214 2858,6450 2924,5985C2932,5930 2946,5831 2955,5765C2979,5594 3023,5384 3074,5192C3166,4849 3190,4749 3235,4528C3290,4253 3306,4117 3321,3821C3335,3522 3325,3358 3250,2680C3245,2633 3229,2483 3215,2345C3201,2208 3171,1929 3148,1725C3113,1405 3109,1336 3113,1215C3120,1053 3146,938 3209,805C3461,266 4129,37 4669,304C4894,415 5056,576 5161,795C5247,975 5264,1052 5295,1405C5303,1499 5317,1629 5325,1695C5340,1822 5361,2021 5380,2205C5386,2266 5406,2473 5426,2665C5445,2858 5468,3078 5475,3155C5483,3232 5494,3324 5499,3360C5505,3396 5512,3457 5515,3495C5522,3565 5556,3790 5585,3950C5607,4067 5643,4232 5695,4450C5790,4844 5822,5111 5822,5520C5822,5872 5802,6059 5719,6459C5633,6874 5486,7313 5306,7693C5128,8070 4776,8620 4624,8759C4391,8972 4074,9075 3805,9025Z',
};

const REGION_PATHS = [
  { transform: 'matrix(10,0,0,-10,-968.503937,9353.503937)', d: 'M494,17C494,17 506.526,114.325 490,123C473.474,131.675 425.912,147.826 421,130C415.263,109.18 441.309,10.855 494,17' },
  { transform: 'matrix(10,0,0,-10,-968.503937,9353.503937)', d: 'M504,18C497.77,22.499 511.031,105.237 501,120C493.525,131.002 590.248,128.28 598,120C610.455,106.697 527.085,1.329 504,18Z' },
  { transform: 'matrix(10,0,0,-10,-968.503937,9353.503937)', d: 'M419,141C414.336,142.74 442.918,150.853 484,136C507.89,127.362 480.966,216.205 483,222C485.477,229.056 420.278,234.097 415,228C411.271,197.731 414.897,153.534 419,141Z' },
  { transform: 'matrix(10,0,0,-10,-968.503937,9353.503937)', d: 'M499,132C503.06,146.609 495.201,203.998 489,222C487.403,226.635 547.852,228.006 557,220C566.778,211.442 555.228,136.428 557,134C539.1,135.177 515.466,133.396 499,132Z' },
  { transform: 'matrix(10,0,0,-10,-968.503937,9353.503937)', d: 'M565,134C565,134 570.106,216.83 565,220C559.894,223.17 633.795,226.451 640,222C647.087,216.916 610.137,120.452 604,127C600.635,130.59 565.705,133.94 565,134Z' },
  { transform: 'matrix(10,0,0,-10,-968.503937,9353.503937)', d: 'M416,237C415.959,239.355 465.016,238.514 482,234C491.998,231.343 478.679,320.877 482,317L424,319C419.198,299.198 414.135,263.62 416,237Z' },
  { transform: 'matrix(10,0,0,-10,-968.503937,9353.503937)', d: 'M492,233C493.557,233.253 544.646,235.523 561,230C571.766,226.364 562.094,304.6 561,312C560.451,315.711 531.624,318.829 489,316C486.697,315.847 495.636,248.365 492,233Z' },
  { transform: 'matrix(10,0,0,-10,-968.503937,9353.503937)', d: 'M571,230C574.07,229.876 573.887,306.208 569,311C565.45,314.481 655.607,313.738 655,312C653.609,284.96 651.834,256.106 642,229C618.941,232.529 593.954,231.552 571,230Z' },
  { transform: 'matrix(10,0,0,-10.87961,-968.503937,9638.572143)', d: 'M425,326C425,326 446.957,418.522 448,424C448.665,427.493 538.422,428.799 538,417C537.563,404.783 537.469,334.997 535,326.404C533.206,320.161 453.663,321.983 425,326Z' },
  { transform: 'matrix(9.814843,0,0,-11.116249,-867.479041,9715.2653)', d: 'M640.981,417C644.246,417.746 549.808,430.883 544.906,417.1C540.822,405.62 542.526,324.591 542.943,324.301C549.199,319.959 577.084,321.212 603.719,320.583C618.466,320.235 633.79,320.859 647.057,323.301C669.415,327.417 641.087,417.181 640.981,417Z' },
  { transform: 'matrix(10,0,0,-10,-968.503937,9353.503937)', d: 'M449,441C449,441 451.875,538.313 446,548C441.217,555.887 527.399,554.077 533,545C538.601,535.923 540.182,436.654 538,438C535.599,439.481 452.126,445.82 449,441Z' },
  { transform: 'matrix(10,0,0,-10,-968.503937,9353.503937)', d: 'M545,438C545.335,436.272 586.65,445.21 636,434C639.235,433.265 623.424,545.319 622,547C614.757,555.548 540,547 540,547C542.117,512.703 546.104,473.858 545,438Z' },
  { transform: 'matrix(10,0,0,-10,-968.503937,9353.503937)', d: 'M448,559C477,563.294 504,563.041 533,558L527,660C497.386,661.807 467.65,661.292 436,658C438.776,624.05 443.328,588.209 448,559Z' },
  { transform: 'matrix(10,0,0,-10,-968.503937,9353.503937)', d: 'M538,558C567.42,562.451 598.855,561.664 619,558C617.065,590.243 614.084,630.903 610,664C586.338,664.281 555.671,661.511 532,660L538,558Z' },
  { transform: 'matrix(10,0,0,-10,-968.503937,9353.503937)', d: 'M435,665C465.326,667.772 495.66,668.504 526,668L519,782C519,782 458.899,780.242 440,735C423.758,696.12 434.592,667.944 435,665Z' },
  { transform: 'matrix(-9.967962,0.799832,-0.799832,-9.967962,10102.211383,8908.511371)', d: 'M444.734,665.63L523.76,666.99L521.824,782.394C523.486,780.615 478.569,779.701 456.872,738.197C436.73,699.668 446.4,668.659 444.734,665.63Z' },
];

// SVG paths are ordered visually from toe to heel; pressure values are ordered by analytics zone index.
const PATH_ZONE_ORDER = [13, 14, 15, 8, 9, 10, 11, 12, 6, 7, 3, 4, 5, 0, 1, 2];

const LABEL_CENTERS: Record<FootSide, Array<[number, number]>> = {
  left: [[470, 80], [391.7, 76.2], [479.2, 180.7], [406.6, 180.0], [340, 177], [480.7, 276.1], [404.5, 272.6], [323.2, 271.7], [452.0, 378.9], [329.7, 381.2], [443.0, 496.3], [344.1, 494.4], [449.2, 609.9], [358.2, 611.1], [458.9, 723.5], [363.3, 727.8]],
  right: [[572.9, 89.3], [676.8, 66.9], [591.6, 190.7], [649.1, 180.0], [730.5, 173.5], [575.1, 276.1], [651.2, 272.6], [732.5, 271.7], [603.7, 378.9], [726.0, 381.2], [612.7, 496.3], [711.6, 494.4], [606.5, 609.9], [697.5, 611.1], [596.9, 723.5], [692.5, 727.8]],
};

function makeVisualNumberMap(centers: Array<[number, number]>): number[] {
  const rowTolerance = 30;
  const rows: Array<Array<{ pathIndex: number; x: number; y: number }>> = [];

  centers.forEach(([x, y], pathIndex) => {
    const row = rows.find((items) => Math.abs(items[0].y - y) <= rowTolerance);
    const item = { pathIndex, x, y };
    if (row) row.push(item);
    else rows.push([item]);
  });

  const labels = new Array(centers.length).fill(0);
  let nextLabel = 1;
  rows
    .sort((a, b) => Math.max(...b.map((item) => item.y)) - Math.max(...a.map((item) => item.y)))
    .forEach((row) => {
      row
        .sort((a, b) => a.x - b.x)
        .forEach((item) => {
          labels[item.pathIndex] = nextLabel;
          nextLabel += 1;
        });
    });

  return labels;
}

const VISUAL_NUMBERS: Record<FootSide, number[]> = {
  left: makeVisualNumberMap(LABEL_CENTERS.left),
  right: makeVisualNumberMap(LABEL_CENTERS.right),
};

const ACTIVE_INTENSITY_FLOOR = 0.08;

function normalizeHeatmapIntensity(value: number, minIntensity: number, maxIntensity: number): number {
  const raw = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (raw <= 0) return 0;

  const min = Number.isFinite(minIntensity) ? Math.max(0, minIntensity) : 0;
  const max = Number.isFinite(maxIntensity) ? Math.max(min, maxIntensity) : min;
  const range = max - min;

  if (range <= Number.EPSILON) {
    return 0.5;
  }

  const normalized = Math.max(0, Math.min(1, (raw - min) / range));
  return ACTIVE_INTENSITY_FLOOR + normalized * (1 - ACTIVE_INTENSITY_FLOOR);
}

export function FootHeatmap({ zoneAverages, foot, label, minIntensity = 0, maxIntensity, sampleCount = 0, showZoneNames }: Props) {
  const hasData = !!zoneAverages && sampleCount > 0 && zoneAverages.some((value) => value > 0);

  return (
    <View style={[styles.container, !hasData && styles.containerNoData]}>
      <View style={styles.header}>
        <Text style={styles.footLabel}>{label}</Text>
        <Text style={[styles.dataState, !hasData && styles.dataStateMuted]}>
          {hasData ? `${sampleCount.toLocaleString()} samples` : 'No pod data'}
        </Text>
      </View>

      <Svg width="100%" height="248" viewBox={FOOT_VIEW_BOX[foot]} preserveAspectRatio="xMidYMid meet">
        <G transform={OUTER_TRANSFORM}>
          <G transform={FOOT_TRANSFORM[foot]}>
            {REGION_PATHS.map((path, pathIndex) => {
              const zoneIndex = PATH_ZONE_ORDER[pathIndex];
              const raw = zoneAverages?.[zoneIndex] ?? 0;
              const intensity = normalizeHeatmapIntensity(raw, minIntensity, maxIntensity);
              const fill = hasData ? heatColor(intensity) : colors.bgCardAlt;
              return (
                <Path
                  key={`${foot}-${pathIndex}`}
                  d={path.d}
                  transform={path.transform}
                  fill={fill}
                  stroke={hasData ? 'rgba(23,32,44,0.22)' : colors.border}
                  strokeWidth={hasData ? 1.4 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={hasData ? 1 : 0.58}
                />
              );
            })}
            <Path
              d={OUTLINE.d}
              transform={OUTLINE.transform}
              fill="none"
              stroke={hasData ? colors.textPrimary : colors.textTertiary}
              strokeWidth={10}
              opacity={hasData ? 0.36 : 0.24}
            />
          </G>
        </G>

        {showZoneNames ? (
          LABEL_CENTERS[foot].map(([x, y], pathIndex) => {
            const zoneIndex = PATH_ZONE_ORDER[pathIndex];
            const intensity = normalizeHeatmapIntensity(zoneAverages?.[zoneIndex] ?? 0, minIntensity, maxIntensity);
            const fill = hasData && intensity > 0.58 ? colors.textInverse : colors.textPrimary;
            return (
              <SvgText
                key={`${foot}-label-${zoneIndex}`}
                x={x}
                y={y}
                fill={hasData ? fill : colors.textTertiary}
                fontSize="20"
                fontWeight="800"
                alignmentBaseline="middle"
                textAnchor="middle"
              >
                {VISUAL_NUMBERS[foot][pathIndex]}
              </SvgText>
            );
          })
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
    gap: 8,
  },
  containerNoData: {
    opacity: 0.82,
  },
  header: {
    alignItems: 'center',
    gap: 2,
  },
  footLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dataState: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textTertiary,
  },
  dataStateMuted: {
    color: colors.textTertiary,
  },
});
