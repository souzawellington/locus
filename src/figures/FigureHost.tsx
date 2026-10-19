import { useRef } from "react";
import { Dots, IsoFigure, Line, Plate, Solid } from "../../.agents/skills/anatomy/kit/react/draw";
import { follow, useInView, useLoop, useReadout } from "../../.agents/skills/anatomy/kit/react/live";
import { translateAlong } from "../../.agents/skills/anatomy/kit/iso-kit";
import "../../.agents/skills/anatomy/kit/iso.css";
import type { FigureEmbed } from "@/lib/vault/markdown";
import { sorted } from "./geometry/common";
import { machineBySlug, type Machine } from "./geometry/machines";

function MachineView({ machine }: { machine: Machine }) {
  const stage = useRef<HTMLDivElement>(null);
  const inView = useInView(stage);
  const { anchor, say } = useReadout<HTMLDivElement>();
  const shown = useRef({ t: 0, apart: 0 });
  const goal = useRef({ t: 0, apart: 0 });
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
    const now = performance.now();
    if (now - touched.current > 1600 && goal.current.apart === 0) {
      goal.current.t = 0.5 + Math.sin(now / 1400) * 0.38;
    }
    const next = shown.current;
    next.t = follow(next.t, goal.current.t, dt, 0.16, calm);
    next.apart = follow(next.apart, goal.current.apart, dt, 0.2, calm);
    paint(next.t, next.apart);
    return inView;
  }, inView);

  const setT = (value: number) => {
    touched.current = performance.now();
    goal.current.t = Math.max(0, Math.min(1, value));
  };

  return (
    <div
      ref={stage}
      className="outline-none"
      tabIndex={0}
      aria-label={`${machine.title}. ${machine.hint}`}
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (!bounds.width) return;
        setT((event.clientX - bounds.left) / bounds.width);
      }}
      onKeyDown={(event) => {
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
          setT(0);
          goal.current.apart = 0;
        }
      }}
    >
      <div ref={anchor}>
        <Plate
          fig={machine.fig}
          title={machine.title}
          hint={machine.hint}
          readout={machine.read(0, 0)}
          keys={[{ label: "peça vigiada", mark: "lit" }]}
          caption={machine.caption}
        >
          <IsoFigure width={machine.width} height={machine.height} label={machine.title}>
            {machine.groups.map((group) => (
              <g key={group.id} ref={(node) => {
                if (node) nodes.current.set(group.id, node);
                else nodes.current.delete(group.id);
              }}>
                {sorted(group.items).map((item) => {
                  if (item.kind === "solid" && item.paths) {
                    const tone = item.tone === "hi" || item.tone === "mid" || item.tone === "lo" || item.tone === "faint" ? item.tone : "mid";
                    return (
                      <Solid
                        key={item.id}
                        paths={item.paths}
                        tone={tone}
                        lit={item.lit}
                        flat={item.flat}
                        halo={item.halo}
                        crease={item.crease}
                      />
                    );
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
        </Plate>
      </div>
    </div>
  );
}

export function FigureHost({ embed }: { embed: FigureEmbed }) {
  const machine = machineBySlug(embed.slug);
  if (!machine) {
    return (
      <figure className="rounded-md border border-dashed border-line bg-paper-2 px-4 py-3 text-sm text-muted">
        Figura desconhecida: <code className="font-mono text-ink">{embed.slug}</code>
      </figure>
    );
  }
  return (
    <div className="locus-figure iso" data-theme="light" data-size={embed.size}>
      <MachineView machine={machine} />
    </div>
  );
}
