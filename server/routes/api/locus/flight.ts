import { defineEventHandler, getQuery, setResponseHeaders } from "h3";
import { lookupFlight } from "../../../../src/lib/world/proxy.ts";

const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 30_000;

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { "cache-control": "public, max-age=20" });
  const callsign = String(getQuery(event).callsign ?? "");
  const key = callsign.replace(/\s+/g, "").toUpperCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.body;
  const body = await lookupFlight(key, (url, init) => fetch(url, init), {
    openskyId: process.env.OPENSKY_CLIENT_ID,
    openskySecret: process.env.OPENSKY_CLIENT_SECRET,
  });
  cache.set(key, { at: Date.now(), body });
  return body;
});
