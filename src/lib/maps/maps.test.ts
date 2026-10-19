import assert from "node:assert/strict";
import { test } from "node:test";
import { roundTripMarkdown } from "../vault/blocks.ts";
import { isPlaceLine, parseBlocks, plainText } from "../vault/markdown.ts";
import { memoryCache, searchPlaces } from "./cache.ts";
import { createNominatimGeocoder, createPhotonGeocoder, nominatimSearchUrl, photonSearchUrl, SUGGESTION_PROVIDER } from "./geocode.ts";
import { createRateLimiter, type Clock } from "./limit.ts";
import { appleMapsUrl, googleMapsUrl, wazeUrl } from "./links.ts";
import { addressLine, formatDistance, formatDuration, formatPlace, looksLikeAddress, parsePlace, placesIn, type Place } from "./place.ts";
import { createOrsRouter, createOsrmRouter, orsUrl, osrmUrl } from "./route.ts";

const casa: Place = {
  name: "Casa da Ana",
  address: "Rua Harmonia, 123 — São Paulo",
  lat: -23.5567645,
  lon: -46.6870128,
  mode: "walk",
};

test("a place round-trips inside a note and stays out of the visible text", () => {
  const line = formatPlace(casa);
  assert.equal(isPlaceLine(line), true);
  const parsed = parsePlace(line);
  assert.equal(parsed?.name, casa.name);
  assert.equal(parsed?.address, casa.address);
  assert.equal(parsed?.mode, "walk");
  assert.ok(Math.abs((parsed?.lat ?? 0) - casa.lat) < 1e-6);
  const note = ["Sábado às 15h.", "", line, "", "Veja [[Bolo de laranja]]."].join("\n");
  const once = roundTripMarkdown(note);
  assert.equal(roundTripMarkdown(once), once);
  assert.equal(placesIn(once).length, 1);
  assert.equal(parseBlocks(once).some((block) => block.kind === "place"), true);
  assert.equal(plainText(once).includes("![["), false);
  assert.equal(plainText(once).includes("Harmonia"), false);
  assert.match(plainText(once), /Sábado às 15h/);
  assert.equal(parsePlace("![[place:91,0|car|x|y]]"), null);
  assert.equal(parsePlace("![[place:1,2|plane|a|b]]"), null);
  assert.equal(placesIn("").length, 0);
});

test("an address line is recognized without being geocoded", () => {
  assert.equal(looksLikeAddress("Rua Harmonia, 123, São Paulo"), true);
  assert.equal(looksLikeAddress("CEP 05435-000"), true);
  assert.equal(looksLikeAddress("Tem bolo e suco na sala."), false);
  assert.equal(addressLine("nota\nRua Augusta, 900"), "Rua Augusta, 900");
});

test("distance and time read in Portuguese", () => {
  assert.equal(formatDistance(350), "350 m");
  assert.equal(formatDistance(4200), "4,2 km");
  assert.equal(formatDuration(18 * 60), "18 min");
  assert.equal(formatDuration(75 * 60), "1 h 15 min");
});

test("deep links are plain urls and carry no key", () => {
  const google = googleMapsUrl(casa);
  const directed = googleMapsUrl(casa, { lat: -23.561, lon: -46.656 });
  const waze = wazeUrl(casa);
  const apple = appleMapsUrl(casa, { lat: -23.561, lon: -46.656 });
  assert.match(google, /^https:\/\/www\.google\.com\/maps\/search\//);
  assert.match(directed, /travelmode=walking/);
  assert.match(waze, /^https:\/\/www\.waze\.com\/ul\?/);
  assert.match(apple, /^https:\/\/maps\.apple\.com\//);
  for (const url of [google, directed, waze, apple]) {
    assert.doesNotMatch(url, /key=/i);
    assert.doesNotMatch(url, /apikey/i);
  }
});

test("suggestions use photon and nominatim is a separate explicit request", async () => {
  assert.equal(SUGGESTION_PROVIDER, "photon");
  const photonUrl = photonSearchUrl("padaria");
  assert.match(photonUrl, /^https:\/\/photon\.komoot\.io\/api\//);
  assert.doesNotMatch(photonUrl, /nominatim/);
  const calls: { url: string; init?: RequestInit }[] = [];
  const geocoder = createPhotonGeocoder(async (url, init) => {
    calls.push({ url, init });
    return new Response(
      JSON.stringify({
        features: [
          {
            geometry: { coordinates: [-46.69, -23.55] },
            properties: { name: "Padaria", street: "Rua Harmonia", housenumber: "10", city: "São Paulo" },
          },
        ],
      }),
      { status: 200 },
    );
  });
  assert.equal(calls.length, 0);
  const hits = await geocoder.search("padaria");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.init?.referrerPolicy, "origin");
  assert.equal(hits[0]?.name, "Padaria");
  assert.equal(hits[0]?.lat, -23.55);

  const nominatim = createNominatimGeocoder(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify([{ lat: "-23.5", lon: "-46.6", display_name: "Rua Harmonia, São Paulo", name: "Harmonia" }]), { status: 200 });
  });
  const found = await nominatim.search("Rua Harmonia 123");
  assert.match(calls.at(-1)?.url ?? "", /^https:\/\/nominatim\.openstreetmap\.org\/search/);
  assert.equal(nominatimSearchUrl("rua").includes("format=jsonv2"), true);
  assert.equal(calls.at(-1)?.init?.referrerPolicy, "origin");
  assert.equal(found[0]?.name, "Harmonia");
});

test("a repeated search is served from the local cache", async () => {
  let calls = 0;
  const geocoder = createPhotonGeocoder(async () => {
    calls += 1;
    return new Response(JSON.stringify({ features: [{ geometry: { coordinates: [1, 2] }, properties: { name: "Lugar" } }] }), { status: 200 });
  });
  const cache = memoryCache();
  await searchPlaces("largo", geocoder, cache);
  await searchPlaces("largo", geocoder, cache);
  assert.equal(calls, 1);
});

test("the rate limiter spaces calls by the interval", async () => {
  let time = 0;
  const waits: number[] = [];
  const clock: Clock = {
    now: () => time,
    wait: async (ms) => {
      waits.push(ms);
      time += ms;
    },
  };
  const limit = createRateLimiter(1000, clock);
  await limit(async () => "a");
  await limit(async () => "b");
  assert.deepEqual(waits, [1000]);
});

test("osrm and openrouteservice requests keep the key out of the url", async () => {
  const from = { lat: -23.55, lon: -46.63 };
  const to = { lat: -23.56, lon: -46.68 };
  const calls: { url: string; init?: RequestInit }[] = [];
  const body = {
    routes: [{ distance: 1200, duration: 400, geometry: { coordinates: [[-46.63, -23.55], [-46.68, -23.56]] } }],
  };
  const osrm = createOsrmRouter(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status: 200 });
  });
  const line = await osrm.route(from, to, "bike");
  assert.match(calls[0]?.url ?? "", /\/bike\//);
  assert.equal(calls[0]?.url, osrmUrl(from, to, "bike"));
  assert.equal(line.distanceM, 1200);
  assert.match(osrmUrl(from, to, "car"), /\/driving\//);
  assert.match(osrmUrl(from, to, "walk"), /\/foot\//);

  const ors = createOrsRouter(async (url, init) => {
    calls.push({ url, init });
    return new Response(
      JSON.stringify({
        features: [
          {
            properties: { summary: { distance: 800, duration: 600 } },
            geometry: { coordinates: [[-46.63, -23.55], [-46.68, -23.56]] },
          },
        ],
      }),
      { status: 200 },
    );
  }, "test-key");
  await ors.route(from, to, "walk");
  const last = calls.at(-1);
  assert.equal(last?.url, orsUrl("walk"));
  assert.equal(last?.url.includes("test-key"), false);
  const headers = last?.init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, "test-key");
});
