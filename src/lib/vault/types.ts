export type CanvasPos = { x: number; y: number; w: number; h: number };

export type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  canvas?: CanvasPos;
};

export type NotebookCell = { id: string; code: string };

export type Citation = {
  noteId: string;
  title: string;
  excerpt: string;
  score: number;
};

export type ToolTrace = {
  name: string;
  readOnly: boolean;
  args: Record<string, string>;
  status: "pending" | "done" | "refused";
  result?: string;
};

export type NoteDraft = {
  title: string;
  body: string;
  concepts: { title: string; body: string }[];
  cells: string[];
  canvas: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  trace?: ToolTrace;
  draft?: NoteDraft;
};

export type WriteMode = "source" | "blocks" | "read";
export type WorkspaceView = "notes" | "canvas" | "notebook" | "graph" | "atlas";

export type ConfirmState = { kind: "delete"; id: string } | { kind: "reset" } | null;
