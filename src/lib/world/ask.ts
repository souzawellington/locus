import { endpointFor, IdeaRequestError, type IdeaSettings } from "../../figures/idea/provider.ts";
import { containsCircle, containsPolygon, haversineKm, type LatLon } from "./geo.ts";

export type MapPin = {
  noteId: string;
  noteTitle: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  snippet: string;
};

export type MapTool = "filter_places" | "near" | "fly_to" | "list_notes";

export type MapCall = { name: MapTool; arguments: Record<string, unknown> };

export type MapAnswer = {
  pins: MapPin[];
  notes: { id: string; title: string; snippet: string }[];
  fly: LatLon | null;
  said: string;
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "filter_places",
      description: "Filtra os lugares já salvos pelo texto do nome, endereço, nota ou trecho.",
      parameters: { type: "object", properties: { text: { type: "string" } }, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "near",
      description: "Lugares perto de um nome de cidade ou da posição atual.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, here: { type: "boolean" } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fly_to",
      description: "Centraliza o mapa num lugar salvo ou num nome.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_notes",
      description: "Lista as notas que combinam com o texto.",
      parameters: { type: "object", properties: { text: { type: "string" } }, additionalProperties: false },
    },
  },
];

export function mapAskPayload(pins: MapPin[], question: string) {
  return {
    question,
    places: pins.slice(0, 40).map((pin) => ({
      note: pin.noteTitle,
      name: pin.name,
      address: pin.address,
      lat: Number(pin.lat.toFixed(2)),
      lon: Number(pin.lon.toFixed(2)),
      snippet: pin.snippet.slice(0, 140),
    })),
  };
}

export function buildMapAskRequest(settings: IdeaSettings, pins: MapPin[], question: string): { url: string; init: RequestInit } {
  const key = settings.apiKey.trim();
  if (!key) throw new IdeaRequestError("Falta a chave.");
  return {
    url: endpointFor(settings),
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: settings.model.trim(),
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Você só consulta os lugares enviados. Não invente notas. Responda chamando uma ferramenta. Não peça dados de notas trancadas.",
          },
          { role: "user", content: JSON.stringify(mapAskPayload(pins, question)) },
        ],
        tools: TOOLS,
        tool_choice: "auto",
      }),
    },
  };
}

export function readToolCalls(body: unknown): MapCall[] {
  const message = (body as { choices?: { message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[] })?.choices?.[0]?.message;
  const calls = message?.tool_calls ?? [];
  return calls.flatMap((call) => {
    const name = call.function?.name;
    if (name !== "filter_places" && name !== "near" && name !== "fly_to" && name !== "list_notes") return [];
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function?.arguments || "{}") as Record<string, unknown>;
    } catch {
      args = {};
    }
    return [{ name, arguments: args }];
  });
}

function textOf(pin: MapPin): string {
  return `${pin.name} ${pin.address} ${pin.noteTitle} ${pin.snippet}`.toLowerCase();
}

function matches(pin: MapPin, text: string): boolean {
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  return needle.split(/\s+/).every((word) => textOf(pin).includes(word));
}

export function applyMapCall(call: MapCall, pins: MapPin[], here: LatLon | null, named: LatLon | null): MapAnswer {
  if (call.name === "filter_places" || call.name === "list_notes") {
    const text = String(call.arguments.text ?? "");
    const picked = pins.filter((pin) => matches(pin, text));
    return answer(picked, picked[0] ?? null, text ? `Encontrei ${picked.length}.` : "Todos os lugares.");
  }
  if (call.name === "fly_to") {
    const query = String(call.arguments.query ?? "");
    const picked = pins.filter((pin) => matches(pin, query));
    const target = picked[0] ?? (named ? { lat: named.lat, lon: named.lon } : null);
    return answer(picked.length ? picked : pins, target, picked[0] ? `Fui até ${picked[0].name}.` : "Não achei esse lugar nas notas.");
  }
  const origin = call.arguments.here ? here : named;
  if (!origin) return answer(pins, null, "Preciso de um lugar ou da sua localização.");
  const text = String(call.arguments.query ?? "");
  const word = text.replace(/\b(perto|daqui|aqui|em|de|do|da|dos|das)\b/gi, "").trim();
  const picked = pins.filter((pin) => haversineKm(pin, origin) <= 80 && matches(pin, word));
  return answer(picked, origin, `Perto: ${picked.length}.`);
}

function answer(pins: MapPin[], fly: { lat: number; lon: number } | null, said: string): MapAnswer {
  const notes = [...new Map(pins.map((pin) => [pin.noteId, { id: pin.noteId, title: pin.noteTitle, snippet: pin.snippet }])).values()];
  return { pins, notes, fly, said };
}

export function localAsk(question: string): MapCall {
  const text = question.trim();
  const here = /\b(daqui|aqui|minha localização|perto de mim)\b/i.test(text);
  const place = text.match(/\bem\s+([A-Za-zÀ-ú][\wÀ-ú\s-]{2,40})/i)?.[1]?.trim();
  if (here || place) return { name: "near", arguments: { here, query: place || text } };
  if (/^(mostra|mostrar|ir|vai|vá|onde)/i.test(text)) return { name: "fly_to", arguments: { query: text } };
  return { name: "filter_places", arguments: { text } };
}

export function insideShape(pin: LatLon, shape: { kind: "circle"; center: LatLon; radiusKm: number } | { kind: "polygon"; ring: LatLon[] }): boolean {
  if (shape.kind === "circle") return containsCircle(pin, shape.center, shape.radiusKm);
  return containsPolygon(pin, shape.ring);
}

export function placesGeoJSON(pins: MapPin[]) {
  return {
    type: "FeatureCollection" as const,
    features: pins.map((pin) => ({
      type: "Feature" as const,
      properties: { name: pin.name, address: pin.address, note: pin.noteTitle },
      geometry: { type: "Point" as const, coordinates: [pin.lon, pin.lat] },
    })),
  };
}
