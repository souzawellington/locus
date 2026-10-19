import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMapCall, buildMapAskRequest, insideShape, localAsk, mapAskPayload, readToolCalls, type MapPin } from "./ask.ts";
import { findFlights, normalizeCallsign } from "./flight.ts";
import { containsPolygon, roundToAbout1Km } from "./geo.ts";
import { adsbDbUrl, adsbFiUrl, lookupFlight, nearby, openskyTokenBody, openskyTokenUrl, usgsWeekUrl } from "./proxy.ts";

test("flight numbers are detected without calling the network", () => {
  const hits = findFlights("Chego no LA8084, ou no BA 247. O tp1352 não conta em minúsculas. Ano 2024.");
  assert.deepEqual(
    hits.map((hit) => hit.callsign),
    ["LA8084", "BA247"],
  );
  assert.equal(normalizeCallsign("ba 247"), "BA247");
  assert.equal(findFlights("sem voo aqui").length, 0);
});

test("flight lookup builds adsb requests and keeps the OpenSky secret out of the url", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("adsbdb")) {
      return new Response(
        JSON.stringify({
          response: {
            flightroute: {
              airline: { name: "TAP" },
              origin: { iata_code: "LIS", name: "Lisboa", latitude: 38.77, longitude: -9.13 },
              destination: { iata_code: "GRU", name: "Guarulhos", latitude: -23.43, longitude: -46.47 },
            },
          },
        }),
        { status: 200 },
      );
    }
    if (url.includes("adsb.fi")) return new Response(JSON.stringify({ ac: [] }), { status: 200 });
    if (url.includes("auth.opensky")) return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
    return new Response(JSON.stringify({ states: [] }), { status: 200 });
  };
  const snap = await lookupFlight("TP 1352", fetchImpl, { openskyId: "id", openskySecret: "segredo" });
  assert.equal(calls[0]?.url, adsbDbUrl("TP1352"));
  assert.equal(calls[1]?.url, adsbFiUrl("TP1352"));
  assert.equal(calls[2]?.url, openskyTokenUrl());
  assert.equal(String(calls[2]?.init?.body).includes("segredo"), true);
  assert.equal(calls[2]?.url.includes("segredo"), false);
  assert.equal(openskyTokenBody("id", "segredo").includes("client_secret=segredo"), true);
  assert.equal(snap.airline, "TAP");
  assert.equal(snap.status, "sem posição");
  assert.equal(snap.origin?.code, "LIS");
});

test("alerts keep only nearby events and round coordinates to about a kilometre", () => {
  const center = { lat: -23.55, lon: -46.63 };
  const rounded = roundToAbout1Km(center.lat, center.lon);
  assert.ok(Math.abs(rounded.lat - center.lat) < 0.02);
  assert.ok(Math.abs(rounded.lon - center.lon) < 0.02);
  assert.notEqual(rounded.lat, center.lat);
  const events = nearby(
    [
      { id: "perto", lat: -23.56, lon: -46.64 },
      { id: "longe", lat: 0, lon: 0 },
    ],
    center,
    50,
  );
  assert.deepEqual(events.map((event) => event.id), ["perto"]);
  assert.match(usgsWeekUrl(), /2\.5_week\.geojson$/);
});

test("map questions become tool calls and a polygon keeps only the inside pin", () => {
  const pins: MapPin[] = [
    { noteId: "a", noteTitle: "Mesas", name: "Bar", address: "São Paulo", lat: -23.54, lon: -46.64, snippet: "Restaurantes anotados" },
    { noteId: "b", noteTitle: "Casa", name: "Ana", address: "Lisboa", lat: 38.72, lon: -9.14, snippet: "festa" },
  ];
  const call = localAsk("mostra os restaurantes que anotei perto daqui");
  assert.equal(call.name, "near");
  assert.equal(call.arguments.here, true);
  const answer = applyMapCall({ name: "filter_places", arguments: { text: "restaurantes" } }, pins, null, null);
  assert.equal(answer.pins.length, 1);
  assert.equal(answer.notes[0]?.title, "Mesas");
  const body = {
    choices: [{ message: { tool_calls: [{ function: { name: "fly_to", arguments: "{\"query\":\"Lisboa\"}" } }] } }],
  };
  assert.equal(readToolCalls(body)[0]?.name, "fly_to");
  const ring = [
    { lat: -23.6, lon: -46.7 },
    { lat: -23.6, lon: -46.6 },
    { lat: -23.5, lon: -46.6 },
    { lat: -23.5, lon: -46.7 },
  ];
  assert.equal(containsPolygon({ lat: -23.55, lon: -46.65 }, ring), true);
  assert.equal(containsPolygon({ lat: 0, lon: 0 }, ring), false);
  assert.equal(insideShape(pins[0]!, { kind: "polygon", ring }), true);
  const payload = mapAskPayload(pins, "Londres");
  assert.equal(JSON.stringify(payload).includes("festa"), true);
  assert.equal("seal" in (payload.places[0] ?? {}), false);
});

test("a map question with a key builds a tool request and omits the key from the url", () => {
  const { url, init } = buildMapAskRequest(
    { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKey: "sk-test" },
    [],
    "Londres",
  );
  assert.equal(url.includes("sk-test"), false);
  assert.match(String((init.headers as Record<string, string>).Authorization), /sk-test/);
  assert.match(String(init.body), /filter_places/);
});
