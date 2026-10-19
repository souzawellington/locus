import { useEffect, useRef, useState } from "react";
import { flightAwareUrl, flightRadarUrl, type FlightSnapshot } from "@/lib/world/flight";
import { PlaceMap, type AirMark } from "./place-view";

export function FlightCard({ callsign, showMap, onAir }: { callsign: string; showMap: boolean; onAir: (mark: AirMark | null) => void }) {
  const [snap, setSnap] = useState<FlightSnapshot | null>(null);
  const [note, setNote] = useState("");
  const card = useRef<HTMLElement>(null);
  const visible = useRef(true);
  const onAirRef = useRef(onAir);
  onAirRef.current = onAir;

  useEffect(() => {
    const node = card.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = Boolean(entry?.isIntersecting);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    let timer = 0;
    const load = async () => {
      if (!visible.current || document.hidden) return;
      try {
        const response = await fetch(`/api/locus/flight?callsign=${encodeURIComponent(callsign)}`);
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as FlightSnapshot;
        if (!live) return;
        setSnap(body);
        setNote("");
        onAirRef.current(body.position ? { lat: body.position.lat, lon: body.position.lon, heading: body.position.heading, label: callsign } : null);
      } catch {
        if (live) setNote("Não consegui consultar o voo agora.");
      }
    };
    void load();
    timer = window.setInterval(() => void load(), 45_000);
    const onHide = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      onAirRef.current(null);
    };
  }, [callsign]);

  const position = snap?.position;
  return (
    <article ref={card} data-testid="flight-card" className="rounded-lg border border-line bg-paper-2 p-3">
      <p className="text-xs tracking-wide text-muted uppercase">Voo</p>
      <h3 className="font-serif text-2xl text-ink">{callsign}</h3>
      <p className="text-sm text-ink">{snap?.airline || "Companhia"}</p>
      <p className="text-sm text-muted">
        {snap?.origin ? `${snap.origin.code} ${snap.origin.name}` : "Origem desconhecida"} → {snap?.destination ? `${snap.destination.code} ${snap.destination.name}` : "destino desconhecido"}
      </p>
      <p className="mt-1 text-sm text-ink">{snap?.status === "no ar" ? "No ar" : "Sem posição ao vivo. O avião pode estar no solo ou fora de cobertura."}</p>
      {position ? (
        <p className="text-sm text-muted">
          Rumo {Math.round(position.heading)}°
          {position.altitudeM != null ? ` · altitude ${Math.round(position.altitudeM).toLocaleString("pt-BR")} m` : ""}
        </p>
      ) : null}
      {snap?.estimate ? <p className="text-sm text-muted">Chegada estimada {snap.estimate}. Não é o horário oficial.</p> : null}
      {note ? <p className="text-sm text-danger">{note}</p> : null}
      <div className="mt-2 flex flex-col items-start gap-1">
        <a className="text-sm text-copper" href={flightRadarUrl(callsign)} target="_blank" rel="noreferrer">
          Abrir no Flightradar24
        </a>
        <a className="text-sm text-copper" href={flightAwareUrl(callsign)} target="_blank" rel="noreferrer">
          Abrir no FlightAware
        </a>
      </div>
      {showMap && position ? <div className="mt-3"><PlaceMap places={[]} route={null} aircraft={[{ lat: position.lat, lon: position.lon, heading: position.heading, label: callsign }]} /></div> : null}
    </article>
  );
}
