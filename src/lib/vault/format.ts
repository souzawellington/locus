import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { fold } from "./retrieve";

export function relativeTime(timestamp: number): string {
  return formatDistanceToNow(timestamp, { addSuffix: true, locale: ptBR });
}

export function exactTime(timestamp: number): string {
  return format(timestamp, "d MMM yyyy, HH:mm", { locale: ptBR });
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function slugify(title: string): string {
  const slug = fold(title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "nota";
}

export function downloadText(filename: string, text: string, type = "text/markdown;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
