import {
  Camera,
  Code,
  Heading,
  Image as ImageIcon,
  MapPin,
  Plane,
  Link2,
  List,
  ListChecks,
  Minus,
  Plus,
  Quote,
  Square,
  Sticker,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FigureHost } from "@/figures/FigureHost";
import { exportFigure, type ExportKind } from "@/figures/export-client";
import { FIGURES } from "@/figures/geometry/machines";
import { compressImage, deleteMedia, loadMedia, saveMedia } from "@/lib/media/db";
import { addressLine, formatPlace, parsePlace, placesIn } from "@/lib/maps/place";
import { findFlights } from "@/lib/world/flight";
import { FlightCard } from "./flight-card";
import { deviceGeoCache, searchPlaces } from "@/lib/maps/cache";
import { browserGeocoder } from "@/lib/maps/geocode";
import { PlaceSearch, PlaceStack, type AirMark } from "./place-view";
import {
  insertAfter,
  mentionQuery,
  removeBlock,
  replaceBlock,
  slashQuery,
  SLASH_ITEMS,
  stripTrigger,
  type SlashKind,
} from "@/lib/vault/blocks";
import {
  flightCallsign,
  formatFigureEmbed,
  formatMediaEmbed,
  listItems,
  parseBlocks,
  parseFigureEmbed,
  parseInline,
  parseMediaEmbed,
  codeParts,
  headingText,
  quoteText,
  type FigureEmbed,
  type MdBlock,
} from "@/lib/vault/markdown";
import { sessionKey } from "@/lib/vault/seal";
import { useVault } from "@/lib/vault/store";
import { cn } from "@/lib/utils";

const ICONS = {
  figure: Square,
  sticker: Sticker,
  photo: ImageIcon,
  camera: Camera,
  video: Video,
  map: MapPin,
  flight: Plane,
  note: Link2,
  heading: Heading,
  list: List,
  check: ListChecks,
  quote: Quote,
  code: Code,
  rule: Minus,
} as const;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}

function inlineHtml(raw: string): string {
  const nodes = parseInline(raw);
  return nodes
    .map((node) => {
      if (node.t === "wiki")
        return `<span data-testid="note-chip" data-wiki="${escapeHtml(node.title)}" contenteditable="false" class="inline-flex cursor-pointer items-center rounded-full bg-copper-soft px-2 py-0.5 text-sm text-copper underline decoration-copper/40 underline-offset-4">${escapeHtml(node.label || node.title)}</span>`;
      if (node.t === "text") return escapeHtml(node.v);
      if (node.t === "code") return escapeHtml(node.v);
      if (node.t === "strong" || node.t === "em")
        return escapeHtml(node.v.map((part) => (part.t === "text" ? part.v : "")).join(""));
      return escapeHtml(node.t === "link" ? node.label : "");
    })
    .join("");
}

function readInline(root: HTMLElement): string {
  let out = "";
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
    else if (node instanceof HTMLElement && node.dataset.wiki) out += `[[${node.dataset.wiki}]]`;
    else if (node instanceof HTMLBRElement) out += "\n";
    else out += node.textContent ?? "";
  });
  return out;
}

function InlineField({
  value,
  label,
  className,
  onChange,
  onSlash,
  onMention,
  onMenuKey,
  onWiki,
}: {
  value: string;
  label: string;
  className?: string;
  onChange: (value: string) => void;
  onSlash: (query: string) => void;
  onMention: (query: string) => void;
  onMenuKey: (key: string) => boolean;
  onWiki: (title: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const html = inlineHtml(value);
    if (node.innerHTML === html) return;
    if (focused.current && readInline(node) === value) return;
    node.innerHTML = html;
    if (!focused.current) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [value]);

  return (
    <div
      ref={ref}
      role="textbox"
      aria-label={label}
      contentEditable
      suppressContentEditableWarning
      data-placeholder="Escreva, ou digite /"
      className={cn(
        "min-h-11 w-full whitespace-pre-wrap outline-none empty:before:text-current/40 empty:before:content-[attr(data-placeholder)]",
        className,
      )}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        const node = ref.current;
        if (!node) return;
        onChange(readInline(node));
      }}
      onInput={() => {
        const node = ref.current;
        if (!node) return;
        const next = readInline(node);
        onChange(next);
        const slash = slashQuery(next);
        const mention = mentionQuery(next);
        if (slash !== null) onSlash(slash);
        else if (mention !== null) onMention(mention);
        else onMenuKey("close");
      }}
      onClick={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const chip = target.closest("[data-wiki]");
        if (chip instanceof HTMLElement && chip.dataset.wiki) onWiki(chip.dataset.wiki);
      }}
      onKeyDown={(event) => {
        if (onMenuKey(event.key)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    />
  );
}

function MediaCard({
  id,
  caption,
  noteId,
  onCaption,
  onDelete,
}: {
  id: string;
  caption: string;
  noteId: string;
  onCaption: (caption: string) => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState("");
  const [mime, setMime] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    let current = "";
    void loadMedia(id, sessionKey(noteId)).then((blob) => {
      if (!live || !blob) return;
      current = URL.createObjectURL(blob);
      setMime(blob.type);
      setUrl(current);
    });
    return () => {
      live = false;
      if (current) URL.revokeObjectURL(current);
    };
  }, [id, noteId]);
  const video = mime.startsWith("video/");
  return (
    <>
      <figure
        data-testid="photo-block"
        className="overflow-hidden rounded-lg border border-line bg-paper-2"
      >
        <button type="button" className="block w-full" onClick={() => url && setOpen(true)}>
          {url && video ? <video src={url} className="max-h-80 w-full bg-ink/5" controls /> : null}
          {url && !video ? (
            <img
              src={url}
              alt={caption || "Foto da nota"}
              className="max-h-80 w-full object-contain"
            />
          ) : null}
          {!url ? (
            <span className="block px-3 py-8 text-sm text-muted">Mídia neste dispositivo</span>
          ) : null}
        </button>
        <input
          value={caption}
          onChange={(event) => onCaption(event.target.value)}
          placeholder="Legenda"
          aria-label="Legenda"
          className="w-full border-t border-line bg-transparent px-3 py-2 text-sm outline-none"
        />
        <button type="button" className="h-10 px-3 text-sm text-danger" onClick={onDelete}>
          Remover
        </button>
      </figure>
      {open && url ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
          role="dialog"
        >
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Fechar"
            onClick={() => setOpen(false)}
          />
          <div className="relative max-h-full max-w-3xl">
            {video ? (
              <video src={url} className="max-h-[80dvh] w-full" controls autoPlay />
            ) : (
              <img
                src={url}
                alt={caption || "Foto"}
                className="max-h-[80dvh] w-full object-contain"
              />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function VisualEditor({
  noteId,
  body,
  onChange,
}: {
  noteId: string;
  body: string;
  onChange: (value: string) => void;
}) {
  const notes = useVault((state) => state.notes);
  const ideas = useVault((state) => state.ideas);
  const ensureNote = useVault((state) => state.ensureNote);
  const openWiki = useVault((state) => state.openWiki);
  const setIdeaOpen = useVault((state) => state.setIdeaOpen);
  const placeSuggest = useVault((state) => state.placeSuggest);
  const blocks = parseBlocks(body);
  const figures = useMemo(
    () => [
      ...FIGURES,
      ...(ideas ?? []).map((idea) => ({
        slug: idea.slug,
        fig: "ideia",
        title: idea.title,
        blurb: idea.blurb,
      })),
    ],
    [ideas],
  );
  const [menu, setMenu] = useState<{
    index: number;
    kind: "slash" | "mention";
    query: string;
    panel: "main" | "figure" | "sticker";
  } | null>(null);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [apart, setApart] = useState<Record<number, boolean>>({});
  const [cameraError, setCameraError] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [placeAt, setPlaceAt] = useState<number | null>(null);
  const [flightAt, setFlightAt] = useState<number | null>(null);
  const [flightNo, setFlightNo] = useState("");
  const [airMarks, setAirMarks] = useState<AirMark[]>([]);
  const [suggestNote, setSuggestNote] = useState("");
  const [recording, setRecording] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const liveVideo = useRef<HTMLVideoElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);

  const filtered = SLASH_ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes((menu?.query ?? "").toLowerCase()) ||
      item.id.includes((menu?.query ?? "").toLowerCase()),
  );
  const noteHits = notes
    .filter((note) => note.title.toLowerCase().includes((menu?.query ?? "").toLowerCase()))
    .slice(0, 8);

  function write(next: string) {
    onChange(next);
  }

  function closeMenu() {
    setMenu(null);
    setActive(0);
  }

  async function addFiles(files: File[], kind: "image" | "video") {
    let next = body;
    for (const file of files) {
      const blob =
        kind === "image" && file.type.startsWith("image/") ? await compressImage(file) : file;
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      await saveMedia(id, blob, sessionKey(noteId));
      next = `${next.trim()}\n\n${formatMediaEmbed(id, "")}\n`;
    }
    write(next);
    closeMenu();
  }

  function stopStream() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCameraOn(false);
    if (liveVideo.current) liveVideo.current.srcObject = null;
  }

  async function openCamera(withAudio: boolean) {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("A câmera não foi permitida. Escolha um arquivo da galeria.");
      (withAudio ? videoRef : cameraRef).current?.click();
      return;
    }
    try {
      stopStream();
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: withAudio,
      });
      stream.current = next;
      setCameraOn(true);
      window.setTimeout(() => {
        if (liveVideo.current) liveVideo.current.srcObject = next;
      }, 0);
    } catch {
      setCameraError(
        withAudio
          ? "A câmera não foi permitida. Escolha um vídeo da galeria."
          : "A câmera não foi permitida. Escolha uma foto da galeria.",
      );
      (withAudio ? videoRef : cameraRef).current?.click();
    }
  }

  async function shoot() {
    const video = liveVideo.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    stopStream();
    if (!blob) return;
    await addFiles([new File([blob], "camera.jpg", { type: "image/jpeg" })], "image");
  }

  function startClip() {
    const current = stream.current;
    if (!current || !window.MediaRecorder) {
      videoRef.current?.click();
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(current);
    recorder.current = rec;
    rec.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    rec.onstop = () => {
      setRecording(false);
      const blob = new Blob(chunks, { type: rec.mimeType || "video/webm" });
      void addFiles([new File([blob], "clip.webm", { type: blob.type })], "video");
      stopStream();
    };
    rec.start();
    setRecording(true);
    window.setTimeout(() => {
      if (rec.state === "recording") rec.stop();
    }, 20_000);
  }

  function applySlash(id: SlashKind) {
    if (!menu) return;
    const cleaned = stripTrigger(blocks[menu.index]?.raw ?? "");
    if (id === "figure") {
      setMenu({ ...menu, panel: "figure", query: "" });
      return;
    }
    if (id === "sticker") {
      setMenu({ ...menu, panel: "sticker", query: "" });
      return;
    }
    if (id === "note") {
      setMenu({ ...menu, kind: "mention", query: "" });
      return;
    }
    if (id === "photo") {
      photoRef.current?.click();
      return;
    }
    if (id === "camera") {
      void openCamera(false);
      closeMenu();
      return;
    }
    if (id === "video") {
      void openCamera(true);
      closeMenu();
      return;
    }
    if (id === "map") {
      setPlaceAt(menu.index);
      closeMenu();
      return;
    }
    if (id === "flight") {
      setFlightAt(menu.index);
      closeMenu();
      return;
    }
    const raw =
      id === "heading"
        ? "## "
        : id === "list"
          ? "- "
          : id === "check"
            ? "- [ ] "
            : id === "quote"
              ? "> "
              : id === "code"
                ? "```\n\n```"
                : "---";
    const base = replaceBlock(body, menu.index, cleaned);
    write(cleaned ? insertAfter(base, menu.index, raw) : replaceBlock(body, menu.index, raw));
    closeMenu();
  }

  function chooseNote(title: string) {
    if (!menu) return;
    const cleaned = stripTrigger(blocks[menu.index]?.raw ?? "");
    const joiner = cleaned && !cleaned.endsWith(" ") ? " " : "";
    write(replaceBlock(body, menu.index, `${cleaned}${joiner}[[${title}]]`));
    closeMenu();
  }

  function chooseFigure(slug: string, sticker: boolean) {
    if (!menu) return;
    const cleaned = stripTrigger(blocks[menu.index]?.raw ?? "");
    const line = formatFigureEmbed(
      sticker ? { slug, size: "sticker", motion: "animated", tilt: -2 } : { slug },
    );
    const base = replaceBlock(body, menu.index, cleaned);
    write(cleaned ? insertAfter(base, menu.index, line) : replaceBlock(body, menu.index, line));
    closeMenu();
  }

  function onMenuKey(key: string): boolean {
    if (!menu) return key === "close" ? false : false;
    if (key === "close" || key === "Escape") {
      closeMenu();
      return key !== "close";
    }
    const count =
      menu.kind === "mention"
        ? Math.max(1, noteHits.length)
        : menu.panel === "main"
          ? filtered.length
          : figures.length;
    if (key === "ArrowDown") {
      setActive((value) => (value + 1) % Math.max(count, 1));
      return true;
    }
    if (key === "ArrowUp") {
      setActive((value) => (value - 1 + Math.max(count, 1)) % Math.max(count, 1));
      return true;
    }
    if (key === "Enter") {
      if (menu.kind === "mention") {
        const hit = noteHits[active];
        if (hit) chooseNote(hit.title);
        else if (menu.query.trim()) {
          ensureNote(menu.query.trim());
          chooseNote(menu.query.trim());
        }
      } else if (menu.panel === "figure" || menu.panel === "sticker") {
        const figure = figures[active];
        if (figure) chooseFigure(figure.slug, menu.panel === "sticker");
      } else {
        const item = filtered[active];
        if (item) applySlash(item.id);
      }
      return true;
    }
    return false;
  }

  const keyHandler = useRef(onMenuKey);
  keyHandler.current = onMenuKey;
  const menuOpen = useRef(menu);
  menuOpen.current = menu;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!menuOpen.current) return;
      if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.isContentEditable) return;
      if (keyHandler.current(event.key)) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function patchFigure(index: number, embed: FigureEmbed, raw: string) {
    write(
      replaceBlock(
        body,
        index,
        formatFigureEmbed(embed) === raw ? raw : formatFigureEmbed({ ...embed }),
      ),
    );
  }

  const menuBox = menu ? (
    <div
      data-testid="slash-menu"
      className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[70dvh] w-full max-w-md overflow-auto rounded-t-2xl border border-line bg-paper-2 p-2 shadow-lg"
      role="listbox"
      aria-label="Blocos"
    >
      {menu.panel === "main" && menu.kind === "slash"
        ? filtered.map((item, index) => {
            const Icon = ICONS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === active}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left",
                  index === active && "bg-copper-soft",
                )}
                onMouseEnter={() => setActive(index)}
                onClick={() => applySlash(item.id)}
              >
                <Icon className="size-5 text-copper" />
                <span>
                  <span className="block text-sm text-ink">{item.label}</span>
                  <span className="block text-xs text-muted">{item.hint}</span>
                </span>
              </button>
            );
          })
        : null}
      {menu.kind === "mention"
        ? noteHits.map((note, index) => (
            <button
              key={note.id}
              type="button"
              role="option"
              aria-selected={index === active}
              className={cn(
                "flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm",
                index === active && "bg-copper-soft",
              )}
              onClick={() => chooseNote(note.title)}
            >
              {note.seal ? "Nota trancada" : note.title}
            </button>
          ))
        : null}
      {menu.kind === "mention" && menu.query.trim() ? (
        <button
          type="button"
          className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm text-copper"
          onClick={() => {
            const title = menu.query.trim();
            ensureNote(title);
            chooseNote(title);
          }}
        >
          Criar nota “{menu.query.trim()}”
        </button>
      ) : null}
      {menu.panel === "figure" || menu.panel === "sticker"
        ? figures.map((figure, index) => (
            <button
              key={figure.slug}
              type="button"
              role="option"
              aria-selected={index === active}
              className={cn(
                "flex min-h-16 w-full items-center gap-3 rounded-md px-2 text-left",
                index === active && "bg-copper-soft",
              )}
              onClick={() => chooseFigure(figure.slug, menu.panel === "sticker")}
            >
              <span className="block w-16 shrink-0 overflow-hidden [&_.locus-sticker-wrap]:max-w-16">
                <FigureHost
                  embed={{ slug: figure.slug, size: "sticker", motion: "still", tilt: 0 }}
                  showExport={false}
                />
              </span>
              <span>
                <span className="block text-sm text-ink">{figure.title}</span>
                <span className="block text-xs text-muted">{figure.blurb}</span>
              </span>
            </button>
          ))
        : null}
      {menu.panel === "figure" ? (
        <button
          type="button"
          className="min-h-11 w-full rounded-md px-3 text-left text-sm text-copper"
          onClick={() => {
            closeMenu();
            setIdeaOpen(true);
          }}
        >
          Proponha uma ideia
        </button>
      ) : null}
    </div>
  ) : null;

  function renderBlock(block: MdBlock, index: number) {
    const figure = parseFigureEmbed(block.raw);
    const media = parseMediaEmbed(block.raw);
    if (figure) {
      const friendly = figures.find((item) => item.slug === figure.slug);
      return (
        <div className="relative" onClick={() => setPicked(index)}>
          <FigureHost embed={figure} apart={Boolean(apart[index])} showExport={false} />
          {picked === index ? (
            <div
              data-testid="figure-toolbar"
              className="absolute top-2 right-2 z-10 flex w-60 flex-col gap-2 rounded-lg border border-line bg-paper p-3 text-sm shadow-lg"
              role="toolbar"
              aria-label={friendly?.title || "Figura"}
              onClick={(event) => event.stopPropagation()}
            >
              <p className="font-serif text-base text-ink">{friendly?.title || "Figura"}</p>
              <p className="text-xs text-muted">Tamanho</p>
              <div className="flex gap-1">
                <button
                  type="button"
                  className={cn(
                    "h-10 flex-1 rounded-md border",
                    figure.size === "full" ? "border-copper text-ink" : "border-line text-muted",
                  )}
                  onClick={() => patchFigure(index, { ...figure, size: "full" }, block.raw)}
                >
                  Inteiro
                </button>
                <button
                  type="button"
                  className={cn(
                    "h-10 flex-1 rounded-md border",
                    figure.size === "sticker" ? "border-copper text-ink" : "border-line text-muted",
                  )}
                  onClick={() => patchFigure(index, { ...figure, size: "sticker" }, block.raw)}
                >
                  Figurinha
                </button>
              </div>
              <button
                type="button"
                className="h-10 rounded-md border border-line"
                onClick={() =>
                  patchFigure(
                    index,
                    { ...figure, motion: figure.motion === "animated" ? "still" : "animated" },
                    block.raw,
                  )
                }
              >
                Animar: {figure.motion === "animated" ? "ligado" : "desligado"}
              </button>
              <label className="text-xs text-muted">
                Girar {figure.tilt}°
                <input
                  aria-label="Girar"
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={figure.tilt}
                  className="w-full"
                  onChange={(event) =>
                    patchFigure(index, { ...figure, tilt: Number(event.target.value) }, block.raw)
                  }
                />
              </label>
              <button
                type="button"
                className="h-10 rounded-md border border-line"
                onClick={() => setApart((state) => ({ ...state, [index]: !state[index] }))}
              >
                {apart[index] ? "Montar" : "Desmontar"}
              </button>
              <p className="text-xs text-muted">Exportar</p>
              <div className="flex flex-wrap gap-1">
                {(["svg", "png-512", "png-1024", "svg-animated"] as ExportKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="h-9 rounded-full border border-line px-2 text-xs"
                    onClick={(event) => {
                      const root = event.currentTarget.closest(".relative") as HTMLElement | null;
                      const host = root?.querySelector(".locus-figure, .locus-sticker");
                      if (host instanceof HTMLElement) void exportFigure(host, figure.slug, kind);
                    }}
                  >
                    {kind === "svg"
                      ? "SVG"
                      : kind === "png-512"
                        ? "PNG 512"
                        : kind === "png-1024"
                          ? "PNG 1024"
                          : "Animado"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="h-10 text-danger"
                onClick={() => write(removeBlock(body, index))}
              >
                Remover
              </button>
            </div>
          ) : null}
        </div>
      );
    }
    if (parsePlace(block.raw)) {
      const first = placesIn(body)[0]?.index;
      if (first !== index) return null;
      return <PlaceStack markdown={body} onChange={write} aircraft={airMarks} />;
    }
    const flight = flightCallsign(block.raw);
    if (flight) {
      const hasPlace = placesIn(body).length > 0;
      return (
        <FlightCard
          callsign={flight}
          showMap={!hasPlace}
          onAir={(mark) =>
            setAirMarks((list) => (mark ? [mark] : list.filter((item) => item.label !== flight)))
          }
        />
      );
    }
    if (media) {
      return (
        <MediaCard
          id={media.id}
          noteId={noteId}
          caption={media.caption}
          onCaption={(caption) =>
            write(replaceBlock(body, index, formatMediaEmbed(media.id, caption)))
          }
          onDelete={() => {
            void deleteMedia(media.id);
            write(removeBlock(body, index));
          }}
        />
      );
    }
    if (block.kind === "code") {
      const parts = codeParts(block.raw);
      return (
        <textarea
          value={parts.code}
          aria-label="Código"
          rows={Math.max(3, parts.code.split("\n").length)}
          className="w-full resize-y rounded-md border border-line bg-paper-2 p-3 font-mono text-sm text-ink outline-none"
          onChange={(event) =>
            write(replaceBlock(body, index, `\`\`\`${parts.lang}\n${event.target.value}\n\`\`\``))
          }
        />
      );
    }
    if (block.kind === "rule") return <hr className="border-line" />;
    if (block.kind === "list") {
      const items = listItems(block.raw);
      return (
        <ul className="flex flex-col gap-2">
          {items.map((item, itemIndex) => (
            <li key={itemIndex} className="flex min-h-11 items-start gap-2">
              {item.checked === null ? (
                <span className="mt-3 size-1.5 shrink-0 rounded-full bg-copper" />
              ) : (
                <input
                  type="checkbox"
                  className="mt-3 size-5"
                  checked={item.checked}
                  onChange={() => {
                    const lines = block.raw.split("\n");
                    lines[itemIndex] = item.checked ? `- [ ] ${item.text}` : `- [x] ${item.text}`;
                    write(replaceBlock(body, index, lines.join("\n")));
                  }}
                  aria-label={item.text || "Item"}
                />
              )}
              <input
                value={item.text}
                aria-label="Item da lista"
                className="min-h-11 w-full bg-transparent outline-none"
                onChange={(event) => {
                  const lines = block.raw.split("\n");
                  const marker =
                    item.checked === null
                      ? item.ordered
                        ? `${itemIndex + 1}. `
                        : "- "
                      : `- [${item.checked ? "x" : " "}] `;
                  lines[itemIndex] = `${marker}${event.target.value}`;
                  write(replaceBlock(body, index, lines.join("\n")));
                }}
              />
            </li>
          ))}
        </ul>
      );
    }
    const shown =
      block.kind === "heading"
        ? headingText(block.raw)
        : block.kind === "quote"
          ? quoteText(block.raw)
          : block.raw;
    const commitText = (text: string) => {
      if (block.kind === "heading") write(replaceBlock(body, index, `## ${text}`));
      else if (block.kind === "quote")
        write(
          replaceBlock(
            body,
            index,
            text
              .split("\n")
              .map((line) => `> ${line}`)
              .join("\n"),
          ),
        );
      else write(replaceBlock(body, index, text));
    };
    const field = (
      <InlineField
        value={shown}
        label={block.kind === "heading" ? "Título" : block.kind === "quote" ? "Citação" : "Texto"}
        className={
          block.kind === "heading"
            ? "text-3xl"
            : block.kind === "quote"
              ? "border-l-2 border-copper pl-3 text-lg italic"
              : "text-lg"
        }
        onChange={commitText}
        onSlash={(query) => {
          setMenu({ index, kind: "slash", query, panel: "main" });
          setActive(0);
        }}
        onMention={(query) => {
          setMenu({ index, kind: "mention", query, panel: "main" });
          setActive(0);
        }}
        onMenuKey={onMenuKey}
        onWiki={openWiki}
      />
    );
    const addressHint =
      placeSuggest && block.kind === "paragraph" && !parsePlace(blocks[index + 1]?.raw ?? "")
        ? addressLine(block.raw)
        : null;
    const flightHint = findFlights(block.raw).find(
      (hit) => !blocks.some((item) => flightCallsign(item.raw) === hit.callsign),
    );
    if (!addressHint && !flightHint) return field;
    return (
      <div className="flex flex-col items-start gap-1">
        {field}
        {flightHint ? (
          <button
            type="button"
            className="h-9 text-sm text-copper"
            onClick={() => write(insertAfter(body, index, `![[flight:${flightHint.callsign}]]`))}
          >
            Acompanhar voo
          </button>
        ) : null}
        {addressHint ? (
          <button
            type="button"
            className="h-9 text-sm text-copper"
            onClick={() => {
              setSuggestNote("");
              void searchPlaces(addressHint, browserGeocoder(), deviceGeoCache())
                .then((hits) => {
                  const hit = hits[0];
                  if (!hit) {
                    setSuggestNote("Não encontrei esse endereço.");
                    return;
                  }
                  write(insertAfter(body, index, formatPlace({ ...hit, mode: "car" })));
                })
                .catch(() => setSuggestNote("Sem conexão para mostrar no mapa."));
            }}
          >
            Mostrar no mapa
          </button>
        ) : null}
        {suggestNote ? <p className="text-sm text-muted">{suggestNote}</p> : null}
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col gap-4"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const files = [...event.dataTransfer.files];
        const images = files.filter((file) => file.type.startsWith("image/"));
        const videos = files.filter((file) => file.type.startsWith("video/"));
        if (images.length) void addFiles(images, "image");
        if (videos.length) void addFiles(videos, "video");
      }}
      onPaste={(event) => {
        const files = [...event.clipboardData.files];
        if (!files.length) return;
        event.preventDefault();
        const images = files.filter((file) => file.type.startsWith("image/"));
        const videos = files.filter((file) => file.type.startsWith("video/"));
        if (images.length) void addFiles(images, "image");
        if (videos.length) void addFiles(videos, "video");
      }}
    >
      {(blocks.length ? blocks : [{ id: "blank", kind: "paragraph" as const, raw: "" }]).map(
        (block, index) => (
          <div key={index === 0 && block.kind === "paragraph" ? "lead" : `${block.kind}-${index}`}>
            {renderBlock(block, index)}
          </div>
        ),
      )}
      <button
        type="button"
        className="inline-flex h-11 items-center gap-2 self-start rounded-full border border-line px-4 text-sm text-current"
        onClick={() => {
          write(body.trim() ? `${body.trim()}\n\n` : "");
          setMenu({
            index: Math.max(0, blocks.length - 1),
            kind: "slash",
            query: "",
            panel: "main",
          });
        }}
      >
        <Plus className="size-4" />
        Bloco
      </button>
      {menuBox}
      {flightAt !== null ? (
        <form
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-2xl border border-line bg-paper-2 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const callsign = flightNo.replace(/\s+/g, "").toUpperCase();
            if (!/^[A-Z]{2,3}\d{2,4}$/.test(callsign) || flightAt === null) return;
            const cleaned = stripTrigger(blocks[flightAt]?.raw ?? "");
            const line = `![[flight:${callsign}]]`;
            const base = replaceBlock(body, flightAt, cleaned);
            write(cleaned ? insertAfter(base, flightAt, line) : replaceBlock(body, flightAt, line));
            setFlightAt(null);
            setFlightNo("");
          }}
        >
          <p className="font-serif text-xl">Voo</p>
          <input
            value={flightNo}
            onChange={(event) => setFlightNo(event.target.value)}
            placeholder="LA8084"
            aria-label="Número do voo"
            className="mt-2 h-11 w-full rounded-md border border-line bg-paper px-3 text-base outline-none"
          />
          <button
            type="submit"
            className="mt-2 h-11 rounded-md bg-copper px-4 text-sm text-paper-2"
          >
            Acompanhar
          </button>
        </form>
      ) : null}
      {placeAt !== null ? (
        <PlaceSearch
          onClose={() => setPlaceAt(null)}
          onPick={(hit) => {
            const at = placeAt;
            const cleaned = stripTrigger(blocks[at]?.raw ?? "");
            const line = formatPlace({ ...hit, mode: "car" });
            const base = replaceBlock(body, at, cleaned);
            write(cleaned ? insertAfter(base, at, line) : replaceBlock(body, at, line));
            setPlaceAt(null);
          }}
        />
      ) : null}
      {cameraError ? <p className="text-sm text-danger">{cameraError}</p> : null}
      <div className={cameraOn ? "rounded-lg border border-line bg-paper-2 p-3" : "hidden"}>
        <video
          ref={liveVideo}
          autoPlay
          playsInline
          muted
          className="max-h-64 w-full rounded-md bg-ink/10"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="h-11 rounded-md bg-copper px-4 text-sm text-paper-2"
            onClick={() => void shoot()}
          >
            Usar foto
          </button>
          <button
            type="button"
            className="h-11 rounded-md border border-line px-4 text-sm"
            onClick={() => (recording ? recorder.current?.stop() : startClip())}
          >
            {recording ? "Parar vídeo" : "Gravar clipe"}
          </button>
          <button
            type="button"
            className="h-11 rounded-md border border-line px-4 text-sm"
            onClick={() => videoRef.current?.click()}
          >
            Escolher da galeria
          </button>
          <button
            type="button"
            className="h-11 rounded-md px-3 text-sm text-muted"
            onClick={() => stopStream()}
          >
            Cancelar
          </button>
        </div>
      </div>
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length) void addFiles(files, "image");
          event.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void addFiles([file], "image");
          event.target.value = "";
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void addFiles([file], "video");
          event.target.value = "";
        }}
      />
    </div>
  );
}
