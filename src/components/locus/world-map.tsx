import { useEffect, useRef, useState } from "react";
import { loadIdeaSettings } from "@/figures/idea/settings";
import { cachedRoute, deviceGeoCache, searchPlaces } from "@/lib/maps/cache";
import { browserGeocoder } from "@/lib/maps/geocode";
import { formatPlace, placesIn } from "@/lib/maps/place";
import { browserRouter } from "@/lib/maps/route";
import { plainText } from "@/lib/vault/markdown";
import { presentNotes } from "@/lib/vault/retrieve";
import { useVault } from "@/lib/vault/store";
import { applyMapCall, buildMapAskRequest, insideShape, localAsk, mapAskPayload, placesGeoJSON, readToolCalls, type MapPin } from "@/lib/world/ask";
import { nearestOrder, type LatLon } from "@/lib/world/geo";
import { downloadText } from "@/lib/vault/format";

const NOTICE = "locus-map-ask-notice";

function pinsFromNotes(): MapPin[] {
  const state = useVault.getState();
  return presentNotes(state.notes, state.openNotes).flatMap((note) => {
    if (note.seal && !state.openNotes[note.id]) return [];
    return placesIn(note.body).map((item) => ({
      noteId: note.id,
      noteTitle: note.title,
      name: item.place.name,
      address: item.place.address,
      lat: item.place.lat,
      lon: item.place.lon,
      snippet: plainText(note.body).slice(0, 160),
    }));
  });
}

export function WorldMap() {
  const notes = useVault((state) => state.notes);
  const openNotes = useVault((state) => state.openNotes);
  const createNote = useVault((state) => state.createNote);
  const select = useVault((state) => state.select);
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ flyTo: (options: { center: [number, number]; zoom: number; duration?: number }) => void; getSource: (id: string) => unknown } | null>(null);
  const [query, setQuery] = useState("");
  const [said, setSaid] = useState("Todos os lugares das notas abertas.");
  const [shown, setShown] = useState<MapPin[]>(() => pinsFromNotes());
  const [cards, setCards] = useState<{ id: string; title: string; snippet: string }[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [ring, setRing] = useState<LatLon[]>([]);
  const [notice, setNotice] = useState(false);
  const drawingRef = useRef(false);
  drawingRef.current = drawing;

  useEffect(() => {
    const next = pinsFromNotes();
    setShown(next);
  }, [notes, openNotes]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    let remove = () => {};
    void (async () => {
      const maplibregl = await import("maplibre-gl");
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (dead) return;
      const map = new maplibregl.Map({
        container: el,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [-46.63, -23.55],
        zoom: 4,
      });
      map.on("load", () => {
        map.addSource("pins", { type: "geojson", data: placesGeoJSON(pinsFromNotes()), cluster: true, clusterRadius: 48 });
        map.addLayer({ id: "clusters", type: "circle", source: "pins", filter: ["has", "point_count"], paint: { "circle-color": "#9C4520", "circle-radius": 16 } });
        map.addLayer({ id: "count", type: "symbol", source: "pins", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 } });
        map.addLayer({ id: "pin", type: "circle", source: "pins", filter: ["!", ["has", "point_count"]], paint: { "circle-color": "#9C4520", "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#F3EFE6" } });
        map.addSource("ring", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "ring", type: "line", source: "ring", paint: { "line-color": "#9C4520", "line-width": 2 } });
      });
      map.on("click", (event) => {
        if (!drawingRef.current) return;
        setRing((points) => [...points, { lat: event.lngLat.lat, lon: event.lngLat.lng }]);
      });
      mapRef.current = map;
      remove = () => map.remove();
    })();
    return () => {
      dead = true;
      remove();
    };
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource("pins") as { setData?: (value: unknown) => void } | undefined;
    source?.setData?.(placesGeoJSON(shown));
    const ringSource = mapRef.current?.getSource("ring") as { setData?: (value: unknown) => void } | undefined;
    ringSource?.setData?.({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: ring.map((point) => [point.lon, point.lat]) },
    });
  }, [shown, ring]);

  async function run(force = false) {
    const settings = loadIdeaSettings();
    if (settings.apiKey && !force && localStorage.getItem(NOTICE) !== "sim") {
      setNotice(true);
      return;
    }
    const all = pinsFromNotes();
    let call = localAsk(query);
    if (settings.apiKey) {
      try {
        const request = buildMapAskRequest(settings, all, query);
        const response = await fetch(request.url, request.init);
        const calls = readToolCalls(await response.json());
        if (calls[0]) call = calls[0];
      } catch {
        call = localAsk(query);
      }
    }
    let named: LatLon | null = null;
    if (call.name === "near" && !call.arguments.here) {
      const hits = await searchPlaces(String(call.arguments.query ?? query), browserGeocoder(), deviceGeoCache()).catch(() => []);
      named = hits[0] ?? null;
    }
    let here: LatLon | null = null;
    if (call.name === "near" && call.arguments.here) {
      here = await new Promise<LatLon>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
          () => reject(new Error("negado")),
        );
      }).catch(() => null);
    }
    const answer = applyMapCall(call, all, here, named);
    setShown(answer.pins);
    setCards(answer.notes);
    setSaid(answer.said);
    const source = mapRef.current?.getSource("pins") as { setData?: (value: unknown) => void } | undefined;
    source?.setData?.(placesGeoJSON(answer.pins));
    if (answer.fly) mapRef.current?.flyTo({ center: [answer.fly.lon, answer.fly.lat], zoom: 12, duration: 0 });
  }

  async function makeRoute() {
    const inside = pinsFromNotes().filter((pin) => insideShape(pin, { kind: "polygon", ring }));
    const ordered = nearestOrder(inside);
    let extra = "";
    if (ordered.length > 1) {
      try {
        const route = await cachedRoute(browserRouter(), ordered[0]!, ordered[1]!, "car", deviceGeoCache());
        extra = `\n\nPrimeiro trecho, cerca de ${Math.round(route.distanceM / 100) / 10} km.`;
      } catch {
        extra = "";
      }
    }
    const body = [
      "Lugares dentro da área desenhada.",
      "",
      ...ordered.map((pin, index) => `${index + 1}. ${pin.name} — ${pin.address}`),
      extra,
      "",
      ...ordered.map((pin) => formatPlace({ name: pin.name, address: pin.address, lat: pin.lat, lon: pin.lon, mode: "car" })),
    ].join("\n");
    createNote({ title: "Roteiro", body });
  }

  return (
    <div className="relative h-full min-h-0" data-testid="world-map">
      <div ref={host} className="h-full w-full" />
      <div className="absolute inset-x-3 top-3 flex flex-col gap-2 md:left-auto md:w-96">
        <form
          className="rounded-lg border border-line bg-paper p-3 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          <label className="text-xs text-muted" htmlFor="map-ask">
            Pergunte ao mapa
          </label>
          <div className="mt-1 flex gap-2">
            <input id="map-ask" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="O que eu salvei em São Paulo" className="h-11 min-w-0 flex-1 rounded-md border border-line bg-paper-2 px-3 text-base text-ink caret-ink outline-none placeholder:text-muted" />
            <button type="button" className="h-11 rounded-md border border-line px-3 text-sm" onClick={() => startVoice(setQuery)}>
              Voz
            </button>
          </div>
          <button type="submit" className="mt-2 h-10 text-sm text-copper">
            Perguntar
          </button>
          <p className="text-sm text-muted">{said}</p>
        </form>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="h-10 rounded-full border border-line bg-paper px-3 text-sm" onClick={() => setDrawing((value) => !value)}>
            {drawing ? "Parar desenho" : "Desenhar área"}
          </button>
          {ring.length > 2 ? (
            <>
              <button type="button" className="h-10 rounded-full bg-copper px-3 text-sm text-paper-2" onClick={() => void makeRoute()}>
                Criar roteiro
              </button>
              <button
                type="button"
                className="h-10 rounded-full border border-line bg-paper px-3 text-sm"
                onClick={() => downloadText("roteiro.geojson", JSON.stringify(placesGeoJSON(pinsFromNotes().filter((pin) => insideShape(pin, { kind: "polygon", ring }))), null, 2))}
              >
                Exportar GeoJSON
              </button>
            </>
          ) : null}
        </div>
        <div className="max-h-48 overflow-auto">
          {cards.map((card) => (
            <button key={card.id} type="button" className="mb-2 block w-full rounded-md border border-line bg-paper px-3 py-2 text-left" onClick={() => select(card.id)}>
              <span className="block text-sm text-ink">{card.title}</span>
              <span className="block text-xs text-muted">{card.snippet}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="absolute bottom-3 left-3 text-xs text-muted">© OpenStreetMap · OpenFreeMap</p>
      {notice ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-ink/40 p-4" role="dialog" aria-label="Aviso">
          <div className="max-w-md rounded-lg border border-line bg-paper p-4">
            <p className="font-serif text-xl">O que segue para o modelo</p>
            <p className="mt-2 text-sm text-muted">
              Só nomes de lugares, coordenadas arredondadas, títulos e um trecho curto das notas abertas. Notas trancadas não entram. A chave continua só neste aparelho.
            </p>
            <p className="mt-2 text-xs text-muted">{JSON.stringify(mapAskPayload(shown, query)).slice(0, 180)}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="h-11 rounded-md bg-copper px-4 text-sm text-paper-2"
                onClick={() => {
                  localStorage.setItem(NOTICE, "sim");
                  setNotice(false);
                  void run(true);
                }}
              >
                Entendi
              </button>
              <button type="button" className="h-11 rounded-md border border-line px-4 text-sm" onClick={() => setNotice(false)}>
                Agora não
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function startVoice(setQuery: (value: string) => void) {
  const speech = window as Window & { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const Ctor = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
  if (!Ctor) {
    setQuery("A voz não está disponível neste navegador.");
    return;
  }
  const rec = new Ctor();
  rec.lang = "pt-BR";
  rec.onresult = (event) => setQuery(event.results[0]?.[0]?.transcript ?? "");
  rec.start();
}

type SpeechRec = {
  lang: string;
  start: () => void;
  onresult: (event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void;
};
