export type LongitudinalGroup = "heel" | "midfoot" | "forefoot" | "toe";
export type SideGroup = "medial" | "center" | "lateral";

export interface ZoneDefinition {
  id: string;
  displayName: string;
  technicalName: string;
  region: LongitudinalGroup;
  side: SideGroup;
  defaultChannelIndex: number;
  svgRef?: string;
  mirrorOf?: string;
}

export const zoneMap: ZoneDefinition[] = [
  { id: "z00", displayName: "Medial heel", technicalName: "posterior medial calcaneal pad", region: "heel", side: "medial", defaultChannelIndex: 0, svgRef: "heel-medial" },
  { id: "z01", displayName: "Center heel", technicalName: "posterior central calcaneal pad", region: "heel", side: "center", defaultChannelIndex: 1, svgRef: "heel-center" },
  { id: "z02", displayName: "Lateral heel", technicalName: "posterior lateral calcaneal pad", region: "heel", side: "lateral", defaultChannelIndex: 2, svgRef: "heel-lateral" },
  { id: "z03", displayName: "Medial midfoot rear", technicalName: "rear medial arch pad", region: "midfoot", side: "medial", defaultChannelIndex: 3, svgRef: "midfoot-medial-rear" },
  { id: "z04", displayName: "Center midfoot rear", technicalName: "rear central midfoot pad", region: "midfoot", side: "center", defaultChannelIndex: 4, svgRef: "midfoot-center-rear" },
  { id: "z05", displayName: "Lateral midfoot rear", technicalName: "rear lateral midfoot pad", region: "midfoot", side: "lateral", defaultChannelIndex: 5, svgRef: "midfoot-lateral-rear" },
  { id: "z06", displayName: "Medial midfoot front", technicalName: "front medial arch pad", region: "midfoot", side: "medial", defaultChannelIndex: 6, svgRef: "midfoot-medial-front" },
  { id: "z07", displayName: "Lateral midfoot front", technicalName: "front lateral midfoot pad", region: "midfoot", side: "lateral", defaultChannelIndex: 7, svgRef: "midfoot-lateral-front" },
  { id: "z08", displayName: "First metatarsal", technicalName: "medial forefoot/metatarsal pad", region: "forefoot", side: "medial", defaultChannelIndex: 8, svgRef: "forefoot-m1" },
  { id: "z09", displayName: "Second metatarsal", technicalName: "central medial forefoot pad", region: "forefoot", side: "center", defaultChannelIndex: 9, svgRef: "forefoot-m2" },
  { id: "z10", displayName: "Third metatarsal", technicalName: "central forefoot pad", region: "forefoot", side: "center", defaultChannelIndex: 10, svgRef: "forefoot-m3" },
  { id: "z11", displayName: "Fourth metatarsal", technicalName: "central lateral forefoot pad", region: "forefoot", side: "center", defaultChannelIndex: 11, svgRef: "forefoot-m4" },
  { id: "z12", displayName: "Fifth metatarsal", technicalName: "lateral forefoot pad", region: "forefoot", side: "lateral", defaultChannelIndex: 12, svgRef: "forefoot-m5" },
  { id: "z13", displayName: "Great toe", technicalName: "hallux toe-off pad", region: "toe", side: "medial", defaultChannelIndex: 13, svgRef: "toe-hallux" },
  { id: "z14", displayName: "Central toes", technicalName: "central toe pad", region: "toe", side: "center", defaultChannelIndex: 14, svgRef: "toe-center" },
  { id: "z15", displayName: "Lateral toes", technicalName: "lateral toe pad", region: "toe", side: "lateral", defaultChannelIndex: 15, svgRef: "toe-lateral" }
];

export function reorderChannelsByZone(rawPressure: number[], channelMap = zoneMap): number[] {
  if (rawPressure.length !== 16) {
    throw new Error(`Expected 16 pressure channels, received ${rawPressure.length}`);
  }
  return channelMap.map((zone) => rawPressure[zone.defaultChannelIndex] ?? 0);
}

/**
 * Returns the canonical zone map with medial<->lateral side labels flipped.
 * The longitudinal (heel/midfoot/forefoot/toe) group is left-right invariant and
 * therefore unchanged. Used to describe a foot whose insole is the physical mirror
 * of the reference (right) layout while keeping identical channel numbering.
 */
export function mirroredZoneMap(): ZoneDefinition[] {
  return zoneMap.map((zone) => {
    const side = zone.side === "medial" ? "lateral" : zone.side === "lateral" ? "medial" : zone.side;
    return { ...zone, side, mirrorOf: zone.id };
  });
}

/**
 * How the LEFT pod's pressure channels relate to anatomy.
 *
 * - "mirrored": the left insole is the physical mirror of the right insole and both
 *   pods use identical channel numbering, so channel `c` on the left foot lands on the
 *   medial/lateral-OPPOSITE pad vs the right foot. Side labels must be flipped.
 * - "anatomical": each pad is wired to the SAME anatomical channel on both feet
 *   (e.g. medial-heel is always channel 0). No flip needed.
 *
 * THIS IS A HARDWARE ASSUMPTION. It cannot be verified without the real pods.
 * Confirm with the single-pad poke test on a LEFT pod (HARDWARE_BRINGUP_CHECKLIST §B)
 * before trusting any medial/lateral or balance metric for the left foot.
 */
export type LeftFootChannelLayout = "mirrored" | "anatomical";

/** Documented default until hardware confirms the wiring. See above. */
export const DEFAULT_LEFT_FOOT_LAYOUT: LeftFootChannelLayout = "mirrored";

/** Set to true only after the left-pod poke test passes. Gates left-foot side confidence. */
export const LEFT_FOOT_LAYOUT_VERIFIED = false;

/**
 * Resolve the zone map (channel -> anatomy) to use for a given foot.
 * Only the medial/lateral side classification can differ between feet; channel
 * indices and longitudinal regions are identical. Right/unknown feet always use the
 * reference map.
 */
export function resolveZoneMapForFoot(
  foot: "left" | "right" | "unknown",
  layout: LeftFootChannelLayout = DEFAULT_LEFT_FOOT_LAYOUT
): ZoneDefinition[] {
  if (foot === "left" && layout === "mirrored") return mirroredZoneMap();
  return zoneMap;
}
