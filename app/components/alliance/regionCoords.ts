export const AZ_ALL_REGIONS = [
  'Bakı', 'Abşeron', 'Ağcabədi', 'Ağdam', 'Ağdaş', 'Ağstafa', 'Ağsu', 'Astara',
  'Babək', 'Balakən', 'Bərdə', 'Beyləqan', 'Biləsuvar', 'Cəbrayıl', 'Cəlilabad', 'Culfa',
  'Daşkəsən', 'Füzuli', 'Gədəbəy', 'Gəncə', 'Goranboy', 'Göyçay', 'Göygöl', 'Hacıqabul',
  'İmişli', 'İsmayıllı', 'Kəlbəcər', 'Kəngərli', 'Kürdəmir', 'Laçın', 'Lənkəran', 'Lerik',
  'Masallı', 'Mingəçevir', 'Naftalan', 'Naxçıvan', 'Neftçala', 'Oğuz', 'Ordubad', 'Qax',
  'Qazax', 'Qəbələ', 'Qobustan', 'Quba', 'Qubadlı', 'Qusar', 'Saatlı', 'Sabirabad',
  'Şabran', 'Şahbuz', 'Şəki', 'Şamaxı', 'Şəmkir', 'Şərur', 'Şirvan', 'Siyəzən',
  'Sumqayıt', 'Şuşa', 'Tərtər', 'Tovuz', 'Ucar', 'Yardımlı', 'Yevlax', 'Zaqatala', 'Zəngilan', 'Zərdab',
];

/** Rayon mərkəzlərinin təxmini koordinatları */
const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  Bakı: { lat: 40.4093, lng: 49.8671 },
  Sumqayıt: { lat: 40.5897, lng: 49.6686 },
  Gəncə: { lat: 40.6828, lng: 46.3606 },
  Mingəçevir: { lat: 40.7703, lng: 47.0489 },
  Naftalan: { lat: 40.5067, lng: 46.8217 },
  Şirvan: { lat: 39.9378, lng: 48.9293 },
  Naxçıvan: { lat: 39.2089, lng: 45.4122 },
  Şəki: { lat: 41.1919, lng: 47.1706 },
  Lənkəran: { lat: 38.7536, lng: 48.8511 },
  Quba: { lat: 41.3611, lng: 48.5134 },
  Şamaxı: { lat: 40.6314, lng: 48.6414 },
  Şuşa: { lat: 39.7601, lng: 46.7497 },
  Xankəndi: { lat: 39.8157, lng: 46.7519 },
  Ağdam: { lat: 39.9931, lng: 46.9297 },
  Füzuli: { lat: 39.6004, lng: 47.1433 },
  Cəbrayıl: { lat: 39.0833, lng: 47.0667 },
  Zəngilan: { lat: 39.0833, lng: 46.65 },
  Qubadlı: { lat: 39.3439, lng: 46.5819 },
  Kəlbəcər: { lat: 40.1064, lng: 46.0385 },
  Laçın: { lat: 39.5989, lng: 46.5503 },
  Tovuz: { lat: 40.9922, lng: 45.6289 },
  Qazax: { lat: 41.0933, lng: 45.3661 },
  Zaqatala: { lat: 41.6336, lng: 46.6433 },
  Balakən: { lat: 41.7262, lng: 46.4088 },
  Şəmkir: { lat: 40.8298, lng: 46.0189 },
  Gədəbəy: { lat: 40.5656, lng: 45.8161 },
  Daşkəsən: { lat: 40.5214, lng: 46.0799 },
  Goranboy: { lat: 40.6103, lng: 46.7897 },
  Yevlax: { lat: 40.6172, lng: 47.1500 },
  Ağsu: { lat: 40.5692, lng: 48.4009 },
  İsmayıllı: { lat: 40.7849, lng: 48.1511 },
  Kürdəmir: { lat: 40.3453, lng: 48.1564 },
  Ucar: { lat: 40.5193, lng: 47.6542 },
  Ağdaş: { lat: 40.6473, lng: 47.4738 },
  Göyçay: { lat: 40.6532, lng: 47.7406 },
  Bərdə: { lat: 40.3748, lng: 47.1267 },
  Tərtər: { lat: 40.3450, lng: 46.9289 },
  Ağcabədi: { lat: 40.0508, lng: 47.4593 },
  Beyləqan: { lat: 39.7756, lng: 47.6186 },
  İmişli: { lat: 39.8699, lng: 48.0600 },
  Saatlı: { lat: 39.9311, lng: 48.3689 },
  Sabirabad: { lat: 40.0089, lng: 48.4770 },
  Hacıqabul: { lat: 40.0393, lng: 48.9429 },
  Siyəzən: { lat: 41.0789, lng: 49.1489 },
  Xaçmaz: { lat: 41.4643, lng: 48.8056 },
  Qusar: { lat: 41.4275, lng: 48.4302 },
  Qəbələ: { lat: 40.9814, lng: 47.8458 },
  Oğuz: { lat: 41.0708, lng: 47.4583 },
  Şabran: { lat: 41.2158, lng: 48.9943 },
  Qobustan: { lat: 40.0824, lng: 49.4120 },
  Abşeron: { lat: 40.4678, lng: 50.0256 },
  Astara: { lat: 38.4560, lng: 48.8750 },
  Lerik: { lat: 38.7739, lng: 48.4150 },
  Masallı: { lat: 38.9403, lng: 48.6653 },
  Yardımlı: { lat: 38.9077, lng: 48.2406 },
  Biləsuvar: { lat: 39.4594, lng: 48.5450 },
  Neftçala: { lat: 39.3583, lng: 49.2469 },
  Cəlilabad: { lat: 39.2097, lng: 48.4970 },
  Ağstafa: { lat: 41.1189, lng: 45.4539 },
  Göygöl: { lat: 40.5894, lng: 46.3189 },
  Babək: { lat: 39.1508, lng: 45.4414 },
  Culfa: { lat: 38.9558, lng: 45.6308 },
  Ordubad: { lat: 38.9022, lng: 46.0019 },
  Şahbuz: { lat: 39.3592, lng: 45.5739 },
  Kəngərli: { lat: 39.4000, lng: 45.0833 },
  Şərur: { lat: 39.5544, lng: 44.9826 },
  Zərdab: { lat: 40.2147, lng: 47.7128 },
};

export function getRegionCoords(region: string): { lat: number; lng: number } {
  const known = REGION_COORDS[region];
  if (known) {
    return {
      lat: known.lat + (Math.random() - 0.5) * 0.04,
      lng: known.lng + (Math.random() - 0.5) * 0.04,
    };
  }

  const index = AZ_ALL_REGIONS.indexOf(region);
  const t = index >= 0 ? index / AZ_ALL_REGIONS.length : 0.5;
  return {
    lat: 38.5 + t * 3.3 + (Math.random() - 0.5) * 0.06,
    lng: 44.8 + t * 5.6 + (Math.random() - 0.5) * 0.06,
  };
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function baseRegionCoords(region: string): { lat: number; lng: number } {
  const known = REGION_COORDS[region];
  if (known) return known;

  const index = AZ_ALL_REGIONS.indexOf(region);
  const t = index >= 0 ? index / AZ_ALL_REGIONS.length : 0.5;
  return {
    lat: 38.5 + t * 3.3,
    lng: 44.8 + t * 5.6,
  };
}

/** Xəritədə eyni qalanın yerini dəyişməmək üçün sabit koordinat */
export function getStableAllianceCoords(
  region: string,
  allianceId: string
): { lat: number; lng: number } {
  const base = baseRegionCoords(region || 'Bakı');
  const h = hashSeed(`${allianceId}:${region}`);
  const jitterLat = ((h & 0xff) - 128) / 3200;
  const jitterLng = (((h >> 8) & 0xff) - 128) / 3200;
  return {
    lat: base.lat + jitterLat,
    lng: base.lng + jitterLng,
  };
}

/** Eyni rayondakı ittifaqları xəritədə bir-birindən ayrı göstərmək üçün spiral yayılma */
export function getSpreadAllianceCoords(
  region: string,
  allianceId: string,
  indexInRegion: number,
  totalInRegion: number
): { lat: number; lng: number } {
  const base = baseRegionCoords(region || 'Bakı');
  if (totalInRegion <= 1) {
    return getStableAllianceCoords(region, allianceId);
  }

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const seedAngle = (hashSeed(`${allianceId}:spread`) % 360) * (Math.PI / 180) * 0.15;
  const angle = indexInRegion * goldenAngle + seedAngle;
  const ring = Math.floor(Math.sqrt(indexInRegion)) + 1;
  const spreadStep = 0.09;
  const radius = Math.max(0.085, ring * spreadStep);

  return {
    lat: base.lat + radius * Math.cos(angle),
    lng: base.lng + radius * Math.sin(angle),
  };
}

export function withAllianceMapCoords<T extends { id: string; region?: string; lat?: number; lng?: number }>(
  alliances: T[]
): (T & { lat: number; lng: number })[] {
  const regionGroups = new Map<string, T[]>();
  for (const item of alliances) {
    const region = item.region || 'Bakı';
    const group = regionGroups.get(region);
    if (group) group.push(item);
    else regionGroups.set(region, [item]);
  }

  const regionIndex = new Map<string, Map<string, number>>();
  for (const [region, group] of regionGroups) {
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const idxMap = new Map<string, number>();
    sorted.forEach((item, i) => idxMap.set(item.id, i));
    regionIndex.set(region, idxMap);
  }

  return alliances.map((item) => {
    const region = item.region || 'Bakı';
    const group = regionGroups.get(region) ?? [item];
    const index = regionIndex.get(region)?.get(item.id) ?? 0;

    if (typeof item.lat === 'number' && typeof item.lng === 'number') {
      if (group.length <= 1) {
        return item as T & { lat: number; lng: number };
      }
      const spread = getSpreadAllianceCoords(region, item.id, index, group.length);
      return { ...item, lat: spread.lat, lng: spread.lng };
    }

    const coords = getSpreadAllianceCoords(region, item.id, index, group.length);
    return { ...item, lat: coords.lat, lng: coords.lng };
  });
}
