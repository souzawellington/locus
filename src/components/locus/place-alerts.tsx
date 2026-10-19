import { useEffect, useState } from "react";
import { deviceGeoCache } from "@/lib/maps/cache";
import type { AlertEvent, WeatherNow } from "@/lib/world/proxy";
import { useVault } from "@/lib/vault/store";

const TTL = 30 * 60_000;

export function PlaceAlerts({ lat, lon }: { lat: number; lon: number }) {
  const enabled = useVault((state) => state.placeAlerts);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [weather, setWeather] = useState<WeatherNow | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const key = `alert:${lat.toFixed(2)},${lon.toFixed(2)}`;
    void (async () => {
      const cache = deviceGeoCache();
      const cached = (await cache.get(key)) as { at?: number; events?: AlertEvent[]; weather?: WeatherNow | null } | null;
      if (cached?.at && Date.now() - cached.at < TTL) {
        if (!live) return;
        setEvents(cached.events ?? []);
        setWeather(cached.weather ?? null);
        return;
      }
      const response = await fetch(`/api/locus/alerts?lat=${lat}&lon=${lon}`);
      if (!response.ok || !live) return;
      const body = (await response.json()) as { events?: AlertEvent[]; weather?: WeatherNow | null };
      setEvents(body.events ?? []);
      setWeather(body.weather ?? null);
      await cache.set(key, { at: Date.now(), events: body.events ?? [], weather: body.weather ?? null });
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [enabled, lat, lon]);

  if (!enabled || (!events.length && !weather)) return null;
  return (
    <div className="mt-2 flex flex-col gap-1 rounded-md border border-line bg-paper px-3 py-2 text-sm" data-testid="place-alert">
      {weather ? (
        <p>
          Agora {weather.temperature != null ? `${Math.round(weather.temperature)}°` : ""} {weather.label}. {weather.tomorrow}{" "}
          <a className="text-copper" href={weather.href} target="_blank" rel="noreferrer">
            Open-Meteo
          </a>
        </p>
      ) : null}
      {events.map((event) => (
        <p key={event.id}>
          {event.title} · {event.km} km ·{" "}
          <a className="text-copper" href={event.href} target="_blank" rel="noreferrer">
            {event.source}
          </a>
        </p>
      ))}
    </div>
  );
}
