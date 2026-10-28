/** Location snapshots are immutable certificate field values, not a live address lookup. */
export type GeoLocation = { lat: number; lng: number; label?: string; source?: "pin"|"gps"|"search"|"coordinates"|"import" };
export function parseGeoLocation(raw: unknown): GeoLocation | null {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    if (typeof v.lat !== "number" || typeof v.lng !== "number" ||
      !Number.isFinite(v.lat) || !Number.isFinite(v.lng) ||
      Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180) return null;
    const location:GeoLocation={lat:v.lat,lng:v.lng};
    if(typeof v.label==="string") location.label=v.label.slice(0,200);
    if(["pin","gps","search","coordinates","import"].includes(String(v.source)))
      location.source=v.source as GeoLocation["source"];
    return location;
  } catch { return null; }
}
export function serializeGeoLocation(location: GeoLocation): string {
  const normalized = parseGeoLocation(location);
  if (!normalized) throw new Error("Latitude must be -90 to 90 and longitude -180 to 180.");
  return JSON.stringify(normalized);
}
export function geoUrl(location: GeoLocation) {
  return "https://www.openstreetmap.org/?mlat=" + location.lat +
    "&mlon=" + location.lng + "#map=17/" + location.lat + "/" + location.lng;
}
export function geoDistanceKm(a: GeoLocation,b: GeoLocation): number {
  const rad = Math.PI/180, dLat=(b.lat-a.lat)*rad,dLng=(b.lng-a.lng)*rad;
  const x=Math.sin(dLat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
export function parseImportedLocation(raw: string): string | null {
  if (!raw.trim()) return "";
  const parsed = parseGeoLocation(raw);
  if (parsed) return serializeGeoLocation(parsed);
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(raw);
  if (!match) return null;
  const latitude=Number(match[1]),longitude=Number(match[2]);
  try { return serializeGeoLocation({lat:latitude,lng:longitude,source:"import"}); } catch { return null; }
}
