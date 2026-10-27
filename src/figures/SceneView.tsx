import { useId, useState } from "react";
import type { FigureScene } from "./geometry/scene.ts";
import { strokePx } from "./geometry/stroke.ts";
import { openingReadout } from "./readout.ts";

export type SceneViewProps = {
  title: string;
  subtitle: string;
  parameterLabel: string;
  t: number;
  exploded: boolean;
  dots: boolean;
  selected: string | null;
  scene: FigureScene;
  compact?: boolean;
  onT: (value: number) => void;
  onToggleExplode: () => void;
  onToggleDots: () => void;
  onSelect: (id: string | null) => void;
  onPrint?: () => void;
};

function stepParameter(value: number, delta: number): number {
  return Math.round(Math.min(1, Math.max(0, value + delta)) * 100) / 100;
}

function pointsOf(points: [number, number][]): string {
  return points.map(([x, y]) => `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`).join(" ");
}

export function SceneView({
  title,
  subtitle,
  parameterLabel,
  t,
  exploded,
  dots,
  selected,
  scene,
  compact = false,
  onT,
  onToggleExplode,
  onToggleDots,
  onSelect,
  onPrint,
}: SceneViewProps) {
  const patternId = `locus-dots-${useId().replace(/:/g, "")}`;
  const [hover, setHover] = useState<string | null>(null);
  const hot = selected ?? hover;
  const readout = openingReadout(scene.readouts);
  const target = scene.readouts.find((item) => item.partId === hot)?.label ?? scene.readouts[0]?.label ?? parameterLabel;
  const [minX, minY, width, height] = scene.viewBox.split(/[\s,]+/);
  return (
    <figure
      className="locus-scene"
      tabIndex={0}
      data-size={compact ? "sticker" : "full"}
      data-backdrop={dots ? "dots" : "solid"}
      aria-label={title}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onT(stepParameter(t, 0.05));
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          onT(stepParameter(t, -0.05));
        } else if (event.key === "e" || event.key === "E") {
          event.preventDefault();
          onToggleExplode();
        }
      }}
    >
      <svg viewBox={scene.viewBox} role="img" aria-label={subtitle}>
        <defs>
          <pattern id={patternId} data-testid="figure-dots-pattern" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="1.2" cy="1.2" r="0.7" fill="currentColor" fillOpacity={0.45} />
          </pattern>
        </defs>
        <rect
          x={minX}
          y={minY}
          width={width}
          height={height}
          fill={dots ? `url(#${patternId})` : "var(--paper)"}
          data-seamless={dots ? undefined : ""}
        />
        {scene.polygons.map((polygon) => (
          <polygon
            key={polygon.id}
            data-part={polygon.partId}
            data-tone={polygon.surfaceTone}
            data-stroke={polygon.strokeTier}
            data-hot={hot === polygon.partId ? "true" : "false"}
            points={pointsOf(polygon.points2D)}
            strokeWidth={strokePx(polygon.strokeTier)}
            strokeDasharray={polygon.strokeTier === "construction" ? "1.8 1.4" : undefined}
            onPointerEnter={() => setHover(polygon.partId)}
            onPointerLeave={() => setHover((current) => (current === polygon.partId ? null : current))}
            onClick={() => onSelect(selected === polygon.partId ? null : polygon.partId)}
          />
        ))}
        {scene.callouts.map((callout) => (
          <g key={callout.partId} className="locus-scene-callout" data-align={callout.align}>
            <polyline
              points={pointsOf([callout.anchor2D, callout.elbow2D, [callout.elbow2D[0], callout.label2D[1]]])}
              fill="none"
            />
            <text x={callout.label2D[0]} y={callout.label2D[1]} textAnchor={callout.align === "left" ? "end" : "start"}>
              {callout.text}
            </text>
          </g>
        ))}
      </svg>
      <div className="locus-scene-readout" data-testid="figure-live-readout" data-readout-target={target}>
        <p className="font-mono text-xs text-ink">{readout}</p>
        {scene.readouts
          .filter((item) => !hot || item.partId === hot)
          .slice(0, compact ? 1 : 4)
          .map((item) => (
            <p key={item.partId} className="text-xs text-muted">
              <span className="font-mono text-ink">{item.value}</span> {item.role}
            </p>
          ))}
      </div>
      {compact ? null : (
        <div className="locus-scene-controls">
          <label className="text-sm text-muted">
            {parameterLabel}
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={t}
              aria-label={parameterLabel}
              onChange={(event) => onT(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={onToggleExplode}>
            {exploded ? "Montar" : "Desmontar"}
          </button>
          <button type="button" onClick={onToggleDots}>
            {dots ? "Grade: Pontos" : "Grade: Sólido"}
          </button>
          {onPrint ? (
            <button type="button" onClick={onPrint}>
              Exportar Prancha SVG
            </button>
          ) : null}
        </div>
      )}
    </figure>
  );
}
