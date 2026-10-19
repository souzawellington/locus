export type LatLon = { lat: number; lon: number };

export function haversineKm(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** About 1 km. Latitude uses 111 km per degree; longitude shrinks away from the equator. */
export function roundToAbout1Km(lat: number, lon: number): LatLon {
  const latStep = 1 / 111;
  const lonScale = Math.cos((lat * Math.PI) / 180);
  const lonStep = 1 / (111 * (Math.abs(lonScale) < 0.2 ? 0.2 : lonScale));
  return {
    lat: Math.round(lat / latStep) * latStep,
    lon: Math.round(lon / lonStep) * lonStep,
  };
}

export function containsCircle(point: LatLon, center: LatLon, radiusKm: number): boolean {
  return haversineKm(point, center) <= radiusKm;
}

/** Ray cast. Polygon is a ring of [lon, lat] or LatLon. The last point may repeat the first. */
export function containsPolygon(point: LatLon, ring: LatLon[]): boolean {
  const pts = ring.length > 1 && ring[0] && ring.at(-1) && ring[0].lat === ring.at(-1)?.lat && ring[0].lon === ring.at(-1)?.lon ? ring.slice(0, -1) : ring;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (!a || !b) continue;
    const intersect = a.lat > point.lat !== b.lat > point.lat && point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat || 1e-12) + a.lon;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function nearestOrder<T extends LatLon>(points: T[], start?: LatLon): T[] {
  const left = [...points];
  const ordered: T[] = [];
  let cursor = start ?? left.shift();
  if (!cursor) return [];
  if (!start) ordered.push(cursor as T);
  while (left.length) {
    let best = 0;
    let bestKm = Infinity;
    left.forEach((point, index) => {
      const km = haversineKm(cursor as LatLon, point);
      if (km < bestKm) {
        bestKm = km;
        best = index;
      }
    });
    const next = left.splice(best, 1)[0];
    if (!next) break;
    ordered.push(next);
    cursor = next;
  }
  return ordered;
}
