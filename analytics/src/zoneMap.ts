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

export function mirroredZoneMap(): ZoneDefinition[] {
  return zoneMap.map((zone) => {
    const side = zone.side === "medial" ? "lateral" : zone.side === "lateral" ? "medial" : zone.side;
    return { ...zone, side, mirrorOf: zone.id };
  });
}
