import { useMemo, useRef, useState } from "react";
import { Dots, IsoFigure, Line, Plate, Solid } from "../../.agents/skills/anatomy/kit/react/draw";
import { follow, useInView, useLoop, useReadout } from "../../.agents/skills/anatomy/kit/react/live";
import { translateAlong } from "../../.agents/skills/anatomy/kit/iso-kit";
import "../../.agents/skills/anatomy/kit/iso.css";
import { ApproveLine } from "@/components/locus/approve";
import type { FigureEmbed } from "@/lib/vault/markdown";
import { downloadText } from "@/lib/vault/format";
import { useVault } from "@/lib/vault/store";
import { compileFigureScene } from "./geometry/scene";
import { resolveMachine, validateAndRepair } from "./idea/compile";
import type { FigureIdeaSpec, SavedIdea } from "./idea/schema";
import { sorted } from "./geometry/common";
import type { Machine } from "./geometry/machines";
import { exportFigure, type ExportKind } from "./export-client";
import { printSheetSvg, readThemeTokens } from "./print-sheet";
import { SceneView } from "./SceneView";

function MachineView({
  machine,
  loop,
  interactive,
  forcedApart = false,
}: {
  machine: Machine;
  loop: boolean;
  interactive: boolean;
  forcedApart?: boolean;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const inView = useInView(stage);
  const { anchor, say } = useReadout<HTMLDivElement>();
  const shown = useRef({ t: 0.45, apart: 0 });
  const goal = useRef({ t: 0.45, apart: 0 });
  const touched = useRef(0);
  const nodes = useRef(new Map<string, SVGGElement>());

  const paint = (t: number, apart: number) => {
    for (const group of machine.groups) {
      const node = nodes.current.get(group.id);
      if (!node) continue;
      const delta = group.place(t, apart);
      const idle = delta[0] === 0 && delta[1] === 0 && delta[2] === 0;
      if (idle) node.removeAttribute("transform");
      else node.setAttribute("transform", translateAlong(machine.projection, delta));
    }
    say(machine.read(t, apart));
  };

  useLoop((dt, calm) => {
    if (calm) {
      paint(0.45, 0);
      return false;
    }
    if (!loop && !interactive) {
      paint(0.45, 0);
      return false;
    }
    const now = performance.now();
    const handsOn = interactive && now - touched.current < 1800;
    if (forcedApart) goal.current.apart = 1;
    else if (!handsOn) goal.current.apart = 0;
    if (loop && !handsOn) goal.current.t = 0.5 + Math.sin(now / 900) * 0.34;
    const next = shown.current;
    next.t = follow(next.t, goal.current.t, dt, 0.18, false);
    next.apart = follow(next.apart, goal.current.apart, dt, 0.2, false);
    paint(next.t, next.apart);
    return inView;
  }, inView);

  const setT = (value: number) => {
    touched.current = performance.now();
    goal.current.t = Math.max(0, Math.min(1, value));
  };

  const art = (
    <IsoFigure width={machine.width} height={machine.height} label={machine.title}>
      {machine.groups.map((group) => (
        <g
          key={group.id}
          data-group={group.id}
          ref={(node) => {
            if (node) nodes.current.set(group.id, node);
            else nodes.current.delete(group.id);
          }}
        >
          {sorted(group.items).map((item) => {
            if (item.kind === "solid" && item.paths) {
              const tone = item.tone === "hi" || item.tone === "mid" || item.tone === "lo" || item.tone === "faint" ? item.tone : "mid";
              return <Solid key={item.id} paths={item.paths} tone={tone} lit={item.lit} flat={item.flat} halo={item.halo} crease={item.crease} />;
            }
            if (item.kind === "line" && item.d) {
              const tone = item.tone === "hi" || item.tone === "mid" || item.tone === "lo" || item.tone === "faint" || item.tone === "lit" ? item.tone : "lo";
              return <Line key={item.id} d={item.d} tone={tone} />;
            }
            if (item.kind === "dots" && item.points) {
              const tone = item.tone === "hi" || item.tone === "mid" || item.tone === "lo" || item.tone === "faint" ? item.tone : "mid";
              return <Dots key={item.id} points={item.points} size={item.size} tone={tone} />;
            }
            return null;
          })}
        </g>
      ))}
    </IsoFigure>
  );

  return (
    <div
      ref={stage}
      className="outline-none"
      tabIndex={interactive ? 0 : -1}
      aria-label={`${machine.title}. ${machine.hint}`}
      onPointerMove={
        interactive
          ? (event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              if (!bounds.width) return;
              setT((event.clientX - bounds.left) / bounds.width);
            }
          : undefined
      }
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                setT(goal.current.t + 0.08);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                setT(goal.current.t - 0.08);
              } else if (event.key === "a" || event.key === "A") {
                event.preventDefault();
                touched.current = performance.now();
                goal.current.apart = goal.current.apart > 0.5 ? 0 : 1;
              } else if (event.key === "Home") {
                event.preventDefault();
                setT(0.45);
                goal.current.apart = 0;
              }
            }
          : undefined
      }
    >
      <div ref={anchor}>
        {interactive ? (
          <Plate fig={machine.fig} title={machine.title} hint={machine.hint} readout={machine.read(0.45, 0)} keys={[{ label: "peça vigiada", mark: "lit" }]} caption={machine.caption}>
            {art}
          </Plate>
        ) : (
          art
        )}
      </div>
    </div>
  );
}

function SceneHost({
  spec,
  compact,
  showExport,
}: {
  spec: FigureIdeaSpec;
  compact: boolean;
  showExport: boolean;
}) {
  const verdict = useMemo(() => validateAndRepair(spec), [spec]);
  const prepared = verdict.accepted ? verdict.spec : null;
  const [parameter, setParameter] = useState(() => prepared?.defaultParameterT ?? 0.25);
  const [exploded, setExploded] = useState(false);
  const [dots, setDots] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingSheet, setPendingSheet] = useState<string | null>(null);
  const scene = useMemo(
    () => (prepared ? compileFigureScene(prepared, parameter, { explode: exploded ? 1 : 0 }) : null),
    [prepared, parameter, exploded],
  );
  if (!prepared || !scene) {
    return (
      <figure className="rounded-md border border-dashed border-line bg-paper-2 px-4 py-3 text-sm text-muted">
        Não deu para desenhar esta figura.
      </figure>
    );
  }
  return (
    <>
      <SceneView
        title={prepared.title}
        subtitle={prepared.subtitle}
        parameterLabel={prepared.parameterLabel}
        t={parameter}
        exploded={exploded}
        dots={dots}
        selected={selected}
        scene={scene}
        compact={compact}
        onT={setParameter}
        onToggleExplode={() => setExploded((value) => !value)}
        onToggleDots={() => setDots((value) => !value)}
        onSelect={setSelected}
        onPrint={showExport ? () => setPendingSheet(printSheetSvg(prepared, readThemeTokens())) : undefined}
      />
      {pendingSheet ? (
        <ApproveLine
          sentence="Exportar a prancha desta figura?"
          yesLabel="Aprovar"
          noLabel="Recusar"
          onYes={() => {
            downloadText(`locus-${prepared.id}.svg`, pendingSheet, "image/svg+xml");
            setPendingSheet(null);
          }}
          onNo={() => setPendingSheet(null)}
        />
      ) : null}
    </>
  );
}

const EXPORTS: { kind: ExportKind; label: string }[] = [
  { kind: "svg", label: "SVG" },
  { kind: "png-512", label: "PNG 512" },
  { kind: "png-1024", label: "PNG 1024" },
  { kind: "svg-animated", label: "SVG animado" },
];

export function FigureHost({
  embed,
  showExport = true,
  apart = false,
  draft = null,
  scene = null,
}: {
  embed: FigureEmbed;
  showExport?: boolean;
  apart?: boolean;
  draft?: SavedIdea | null;
  scene?: FigureIdeaSpec | null;
}) {
  const ideas = useVault((state) => state.ideas);
  const scenes = useVault((state) => state.scenes) ?? [];
  const root = useRef<HTMLDivElement>(null);
  const resolved = scene ?? scenes.find((item) => item.id === embed.slug) ?? null;
  if (resolved) {
    return (
      <SceneHost spec={resolved} compact={embed.size === "sticker"} showExport={showExport && embed.size !== "sticker"} />
    );
  }
  const pool = draft ? [draft, ...(ideas ?? []).filter((item) => item.slug !== draft.slug)] : (ideas ?? []);
  const machine = resolveMachine(embed.slug, pool);
  if (!machine) {
    return (
      <figure className="rounded-md border border-dashed border-line bg-paper-2 px-4 py-3 text-sm text-muted">
        Esta figura não está neste aparelho.
      </figure>
    );
  }
  const sticker = embed.size === "sticker";
  const loop = embed.motion === "animated";
  return (
    <div className={sticker ? "locus-sticker-wrap" : "locus-figure-wrap"}>
      <div
        ref={root}
        className={sticker ? "locus-sticker iso" : "locus-figure iso"}
        data-theme="light"
        data-size={embed.size}
        data-motion={embed.motion}
        style={embed.tilt ? { transform: `rotate(${embed.tilt}deg)` } : undefined}
      >
        <MachineView machine={machine} loop={loop} interactive={!sticker} forcedApart={apart} />
      </div>
      {showExport ? (
        <div className="mt-2 flex flex-wrap gap-1" aria-label={`Exportar ${machine.title}`}>
          {EXPORTS.map((item) => (
            <button
              key={item.kind}
              type="button"
              className="h-8 rounded-full border border-line px-2.5 text-xs text-muted"
              onClick={() => {
                if (root.current) void exportFigure(root.current, machine.slug, item.kind);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
