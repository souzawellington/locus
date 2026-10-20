import { useEffect, useRef, useState } from "react";
import { deviceGeoCache, cachedRoute, searchPlaces } from "@/lib/maps/cache";
import { browserGeocoder, type PlaceHit } from "@/lib/maps/geocode";
import { appleMapsUrl, googleMapsUrl, wazeUrl, type LatLon } from "@/lib/maps/links";
import { formatDistance, formatDuration, placesIn, replacePlace, type Place, type TravelMode } from "@/lib/maps/place";
import { browserRouter, type RouteLine } from "@/lib/maps/route";
import { removeBlock } from "@/lib/vault/blocks";
import { cn } from "@/lib/utils";
import { PlaceAlerts } from "./place-alerts";

const MODES: { id: TravelMode; label: string }[] = [
  { id: "car", label: "Carro" },
  { id: "bike", label: "Bicicleta" },
  { id: "walk", label: "A pé" },
];

function here(): Promise<LatLon> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("sem"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      () => reject(new Error("negado")),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60_000 },
    );
  });
}

function webgl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export type AirMark = { lat: number; lon: number; heading: number; label: string };

type MapHandle = {
  sync(places: Place[], route: [number, number][] | null, aircraft: AirMark[]): void;
  remove(): void;
};

async function mountVector(el: HTMLElement): Promise<MapHandle> {
  const maplibregl = await import("maplibre-gl");
  await import("maplibre-gl/dist/maplibre-gl.css");
  const map = new maplibregl.Map({
    container: el,
    style: "https://tiles.openfreemap.org/styles/positron",
    center: [-46.63, -23.55],
    zoom: 11,
  });
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("tempo")), 12000);
    map.once("load", () => {
      window.clearTimeout(timer);
      resolve();
    });
  });
  const markers: { remove(): void }[] = [];
  return {
    sync(places, route, aircraft = []) {
      markers.splice(0).forEach((marker) => marker.remove());
      places.forEach((place, index) => {
        const node = document.createElement("div");
        node.className = "locus-pin";
        node.textContent = String(index + 1);
        markers.push(new maplibregl.Marker({ element: node, anchor: "center" }).setLngLat([place.lon, place.lat]).addTo(map));
      });
      aircraft.forEach((plane) => {
        const node = document.createElement("div");
        node.className = "locus-plane";
        node.style.transform = `rotate(${plane.heading}deg)`;
        node.title = plane.label;
        markers.push(new maplibregl.Marker({ element: node, anchor: "center" }).setLngLat([plane.lon, plane.lat]).addTo(map));
      });
      const geometry = route && route.length > 1 ? { type: "LineString" as const, coordinates: route } : { type: "LineString" as const, coordinates: [] as [number, number][] };
      const source = map.getSource("locus-route") as { setData?: (value: unknown) => void } | undefined;
      if (source?.setData) source.setData({ type: "Feature", properties: {}, geometry });
      else {
        map.addSource("locus-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry } });
        map.addLayer({ id: "locus-route", type: "line", source: "locus-route", paint: { "line-color": "#9C4520", "line-width": 4 } });
      }
      const bounds = new maplibregl.LngLatBounds();
      places.forEach((place) => bounds.extend([place.lon, place.lat]));
      aircraft.forEach((plane) => bounds.extend([plane.lon, plane.lat]));
      route?.forEach((point) => bounds.extend(point));
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 36, maxZoom: 15, duration: 0 });
    },
    remove() {
      map.remove();
    },
  };
}

async function mountRaster(el: HTMLElement): Promise<MapHandle> {
  const leaflet = await import("leaflet");
  await import("leaflet/dist/leaflet.css");
  const L = leaflet.default;
  const map = L.map(el).setView([-23.55, -46.63], 12);
  L.tileLayer("https://tile.openstreetmap.de/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "© OpenStreetMap",
  }).addTo(map);
  const drawn: { remove(): void }[] = [];
  return {
    sync(places, route, aircraft = []) {
      drawn.splice(0).forEach((layer) => layer.remove());
      const bounds = L.latLngBounds([]);
      places.forEach((place, index) => {
        const icon = L.divIcon({
          className: "locus-pin-wrap",
          html: `<span class="locus-pin">${index + 1}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        drawn.push(L.marker([place.lat, place.lon], { icon }).addTo(map));
        bounds.extend([place.lat, place.lon]);
      });
      aircraft.forEach((plane) => {
        const icon = L.divIcon({ className: "locus-pin-wrap", html: `<span class="locus-plane" style="transform:rotate(${plane.heading}deg)"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] });
        drawn.push(L.marker([plane.lat, plane.lon], { icon }).addTo(map));
        bounds.extend([plane.lat, plane.lon]);
      });
      if (route && route.length > 1) {
        const points = route.map(([lon, lat]) => L.latLng(lat, lon));
        drawn.push(L.polyline(points, { color: "#9C4520", weight: 4 }).addTo(map));
        points.forEach((point) => bounds.extend(point));
      }
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    },
    remove() {
      map.remove();
    },
  };
}

async function mountMap(el: HTMLElement): Promise<MapHandle> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
  if (!webgl()) return mountRaster(el);
  try {
    return await mountVector(el);
  } catch {
    return mountRaster(el);
  }
}

function MapPlaceholder({ places }: { places: Place[] }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-line bg-paper-2 px-4 py-6 text-center" data-testid="place-map">
      <div>
        <p className="text-sm text-ink">O desenho do mapa precisa de conexão.</p>
        <p className="mt-1 text-sm text-muted">O lugar continua salvo nesta nota.</p>
        <ul className="mt-3 flex flex-col gap-1 text-sm text-muted">
          {places.map((place, index) => (
            <li key={`${place.lat}-${place.lon}-${index}`}>
              {index + 1}. {place.name}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">© OpenStreetMap</p>
      </div>
    </div>
  );
}

export function PlaceMap({ places, route, aircraft = [] }: { places: Place[]; route: [number, number][] | null; aircraft?: AirMark[] }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [offline, setOffline] = useState(false);
  const data = useRef({ places, route, aircraft });
  data.current = { places, route, aircraft };
  const signature = `${places.map((place) => `${place.lat.toFixed(5)},${place.lon.toFixed(5)}`).join("|")}:${route?.map((point) => point.join(",")).join(";") ?? ""}:${aircraft.map((plane) => plane.label).join(",")}`;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    void mountMap(el)
      .then((next) => {
        if (dead) {
          next.remove();
          return;
        }
        handle.current = next;
        next.sync(data.current.places, data.current.route, data.current.aircraft);
      })
      .catch(() => {
        if (!dead) setOffline(true);
      });
    return () => {
      dead = true;
      handle.current?.remove();
      handle.current = null;
    };
  }, []);

  useEffect(() => {
    handle.current?.sync(places, route, aircraft);
  }, [signature, places, route, aircraft]);

  if (!places.length && !aircraft.length) return null;
  if (offline) return <MapPlaceholder places={places} />;
  return (
    <div data-testid="place-map">
      <div ref={host} className="locus-map" />
      <p className="mt-1 text-xs text-muted">© OpenStreetMap · OpenFreeMap</p>
    </div>
  );
}

function PlaceCard({
  place,
  number,
  active,
  summary,
  from,
  onMode,
  onRemove,
  onRoute,
}: {
  place: Place;
  number: number;
  active: boolean;
  summary: string;
  from?: LatLon;
  onMode: (mode: TravelMode) => void;
  onRemove: () => void;
  onRoute: (line: RouteLine, from: LatLon) => void;
}) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const linked = place;

  async function draw(from: LatLon) {
    setBusy(true);
    setMessage("");
    try {
      const line = await cachedRoute(browserRouter(), from, place, place.mode, deviceGeoCache());
      onRoute(line, from);
    } catch {
      setMessage("A rota não está disponível agora. O lugar continua salvo nesta nota.");
    } finally {
      setBusy(false);
    }
  }

  async function fromText() {
    const text = origin.trim();
    if (text.length < 3) {
      setMessage("Digite um ponto de partida.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const hits = await searchPlaces(text, browserGeocoder(), deviceGeoCache());
      const hit = hits[0];
      if (!hit) {
        setMessage("Não encontrei o ponto de partida.");
        setBusy(false);
        return;
      }
      await draw(hit);
    } catch {
      setMessage("Sem conexão para buscar o ponto de partida.");
      setBusy(false);
    }
  }

  async function fromHere() {
    setMessage("");
    try {
      await draw(await here());
    } catch {
      setMessage("A localização não foi permitida. Digite um ponto de partida.");
    }
  }

  return (
    <article data-testid="place-card" className={cn("rounded-lg border bg-paper-2 p-3", active ? "border-copper" : "border-line")}>
      <p className="text-sm text-muted">{number}</p>
      <h3 className="font-serif text-xl text-ink">{place.name}</h3>
      <p className="text-sm text-muted">{place.address}</p>
      <PlaceAlerts lat={place.lat} lon={place.lon} />
      {summary ? <p className="mt-1 text-sm text-ink">{summary}</p> : null}
      <button type="button" className="mt-2 h-10 text-sm text-copper" onClick={() => setOpen((value) => !value)}>
        Como chegar
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Modo">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={cn("h-10 rounded-full border px-3 text-sm", place.mode === mode.id ? "border-copper text-ink" : "border-line text-muted")}
                onClick={() => onMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <input
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            placeholder="Ponto de partida"
            aria-label="Ponto de partida"
            className="h-11 rounded-md border border-line bg-paper px-3 text-base text-ink caret-ink outline-none placeholder:text-muted"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="h-11 rounded-md bg-copper px-4 text-sm text-paper-2" disabled={busy} onClick={() => void fromText()}>
              Traçar rota
            </button>
            <button type="button" className="h-11 rounded-md border border-line px-4 text-sm" disabled={busy} onClick={() => void fromHere()}>
              Usar minha localização
            </button>
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-2 text-sm text-danger">{message}</p> : null}
      <div className="mt-2 flex flex-col items-start gap-1">
        <a className="text-sm text-copper underline-offset-4 hover:underline" href={googleMapsUrl(linked, from)} target="_blank" rel="noreferrer">
          Abrir no Google Maps
        </a>
        <a className="text-sm text-copper underline-offset-4 hover:underline" href={wazeUrl(linked)} target="_blank" rel="noreferrer">
          Abrir no Waze
        </a>
        <a className="text-sm text-copper underline-offset-4 hover:underline" href={appleMapsUrl(linked, from)} target="_blank" rel="noreferrer">
          Abrir no Apple Maps
        </a>
      </div>
      <button type="button" className="mt-2 h-10 text-sm text-danger" onClick={onRemove}>
        Remover
      </button>
    </article>
  );
}

export function PlaceStack({ markdown, onChange, aircraft = [] }: { markdown: string; onChange?: (next: string) => void; aircraft?: AirMark[] }) {
  const found = placesIn(markdown);
  const places = found.map((item) => item.place);
  const [route, setRoute] = useState<{ index: number; line: RouteLine; from: LatLon } | null>(null);
  if (!found.length) return null;
  const summary = (index: number) => (route?.index === index ? `${formatDistance(route.line.distanceM)} · ${formatDuration(route.line.durationS)}` : "");

  return (
    <div className="flex flex-col gap-3">
      <PlaceMap places={places} route={route?.line.coordinates ?? null} aircraft={aircraft} />
      {found.map((item, number) => (
        <PlaceCard
          key={`${item.index}-${item.place.lat}`}
          place={item.place}
          number={number + 1}
          active={route?.index === number}
          summary={summary(number)}
          from={route?.index === number ? route.from : undefined}
          onMode={(mode) => onChange?.(replacePlace(markdown, item.index, { ...item.place, mode }))}
          onRemove={() => onChange?.(removeBlock(markdown, item.index))}
          onRoute={(line, from) => setRoute({ index: number, line, from })}
        />
      ))}
    </div>
  );
}

export function PlaceSearch({ onPick, onClose }: { onPick: (hit: PlaceHit) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setHits([]);
      setMessage("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchPlaces(text, browserGeocoder(), deviceGeoCache(), controller.signal)
        .then((next) => {
          setHits(next);
          setMessage(next.length ? "" : "Não encontrei esse lugar.");
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setMessage("Sem conexão para buscar. Tente de novo.");
        });
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function locate() {
    setMessage("");
    try {
      const point = await here();
      const named = await browserGeocoder().reverse(point.lat, point.lon);
      onPick(named ?? { name: "Minha localização", address: "Ponto neste aparelho", lat: point.lat, lon: point.lon });
    } catch {
      setMessage("A localização não foi permitida.");
    }
  }

  return (
    <div data-testid="place-search" className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[70dvh] w-full max-w-md overflow-auto rounded-t-2xl border border-line bg-paper-2 p-3 shadow-lg" role="dialog" aria-label="Mapa">
      <p className="font-serif text-xl text-ink">Mapa</p>
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar um lugar ou endereço"
        aria-label="Buscar lugar"
        className="mt-2 h-11 w-full rounded-md border border-line bg-paper px-3 text-base text-ink caret-ink outline-none placeholder:text-muted"
      />
      <button type="button" className="mt-2 h-11 text-sm text-copper" onClick={() => void locate()}>
        Usar minha localização
      </button>
      {message ? <p className="mt-2 text-sm text-muted">{message}</p> : null}
      <ul className="mt-2 flex flex-col">
        {hits.map((hit) => (
          <li key={`${hit.lat},${hit.lon},${hit.name}`}>
            <button type="button" className="flex min-h-11 w-full flex-col items-start rounded-md px-2 py-2 text-left hover:bg-copper-soft" onClick={() => onPick(hit)}>
              <span className="text-sm text-ink">{hit.name}</span>
              <span className="text-xs text-muted">{hit.address}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="mt-2 h-10 text-sm text-muted" onClick={onClose}>
        Cancelar
      </button>
    </div>
  );
}

