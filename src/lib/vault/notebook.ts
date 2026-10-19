export type ChartValue = { kind: "chart"; data: number[]; label: string };
export type Value = number | string | number[] | ChartValue;

export function isChart(value: Value): value is ChartValue {
  return typeof value === "object" && value !== null && !Array.isArray(value) && value.kind === "chart";
}

export function formatValue(value: Value): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "indefinido";
    if (Number.isInteger(value)) return String(value);
    return String(Math.round(value * 10000) / 10000);
  }
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `[${value.map((item) => formatValue(item)).join(", ")}]`;
  return `gráfico · ${value.data.length} pontos`;
}

type Expr =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "name"; v: string }
  | { t: "list"; items: Expr[] }
  | { t: "call"; name: string; args: Expr[] }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "%"; l: Expr; r: Expr }
  | { t: "neg"; x: Expr };

type Stmt = { t: "assign"; name: string; expr: Expr } | { t: "expr"; expr: Expr };

type Tok =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "id"; v: string }
  | { k: "op"; v: string }
  | { k: "nl" }
  | { k: "eof" };

const BUILTINS = new Set([
  "mean",
  "sum",
  "min",
  "max",
  "std",
  "len",
  "abs",
  "round",
  "sqrt",
  "log",
  "range",
  "linspace",
  "sort",
  "unique",
  "chart",
  "str",
]);

function tokenize(source: string): Tok[] {
  const out: Tok[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index] ?? "";
    if (char === " " || char === "\t" || char === "\r") {
      index += 1;
      continue;
    }
    if (char === "#") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "\n") {
      out.push({ k: "nl" });
      index += 1;
      continue;
    }
    if ("+-*/%()[],=".includes(char)) {
      out.push({ k: "op", v: char });
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      const quote = char;
      index += 1;
      let text = "";
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\" && index + 1 < source.length) {
          const next = source[index + 1];
          text += next === "n" ? "\n" : next;
          index += 2;
          continue;
        }
        text += source[index];
        index += 1;
      }
      if (source[index] !== quote) throw new Error("Cadeia de texto sem fecho");
      index += 1;
      out.push({ k: "str", v: text });
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let end = index;
      while (end < source.length && /[0-9.]/.test(source[end] ?? "")) end += 1;
      const raw = source.slice(index, end);
      if (raw === "." || raw.split(".").length > 2) throw new Error(`Número inválido: ${raw}`);
      out.push({ k: "num", v: Number(raw) });
      index = end;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z0-9_]/.test(source[end] ?? "")) end += 1;
      out.push({ k: "id", v: source.slice(index, end) });
      index = end;
      continue;
    }
    throw new Error(`Símbolo inesperado: ${char}`);
  }
  out.push({ k: "eof" });
  return out;
}

class Parser {
  private index = 0;
  private readonly tokens: Tok[];

  constructor(tokens: Tok[]) {
    this.tokens = tokens;
  }

  private peek(): Tok {
    return this.tokens[this.index] ?? { k: "eof" };
  }

  private skipNl() {
    while (this.peek().k === "nl") this.index += 1;
  }

  parseProgram(): Stmt[] {
    const statements: Stmt[] = [];
    this.skipNl();
    while (this.peek().k !== "eof") {
      statements.push(this.parseStmt());
      if (this.peek().k === "nl") this.skipNl();
      else if (this.peek().k !== "eof") throw new Error("Era esperado o fim da linha");
    }
    return statements;
  }

  private parseStmt(): Stmt {
    const token = this.peek();
    const next = this.tokens[this.index + 1];
    if (token.k === "id" && next?.k === "op" && next.v === "=") {
      const name = token.v;
      this.index += 2;
      return { t: "assign", name, expr: this.parseExpr() };
    }
    return { t: "expr", expr: this.parseExpr() };
  }

  private isOp(value: string): boolean {
    const token = this.peek();
    return token.k === "op" && token.v === value;
  }

  private parseExpr(): Expr {
    let left = this.parseTerm();
    for (;;) {
      const token = this.peek();
      if (token.k !== "op" || (token.v !== "+" && token.v !== "-")) break;
      this.index += 1;
      left = { t: "bin", op: token.v, l: left, r: this.parseTerm() };
    }
    return left;
  }

  private parseTerm(): Expr {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token.k !== "op" || (token.v !== "*" && token.v !== "/" && token.v !== "%")) break;
      this.index += 1;
      left = { t: "bin", op: token.v, l: left, r: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.isOp("-")) {
      this.index += 1;
      return { t: "neg", x: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const token = this.peek();
    if (token.k === "num") {
      this.index += 1;
      return { t: "num", v: token.v };
    }
    if (token.k === "str") {
      this.index += 1;
      return { t: "str", v: token.v };
    }
    if (token.k === "id") {
      this.index += 1;
      if (this.isOp("(")) {
        this.index += 1;
        const args: Expr[] = [];
        if (!this.isOp(")")) {
          args.push(this.parseExpr());
          while (this.isOp(",")) {
            this.index += 1;
            if (this.isOp(")")) break;
            args.push(this.parseExpr());
          }
        }
        if (!this.isOp(")")) throw new Error("Falta fechar parêntese");
        this.index += 1;
        return { t: "call", name: token.v, args };
      }
      return { t: "name", v: token.v };
    }
    if (token.k === "op" && token.v === "(") {
      this.index += 1;
      const expr = this.parseExpr();
      if (!this.isOp(")")) throw new Error("Falta fechar parêntese");
      this.index += 1;
      return expr;
    }
    if (token.k === "op" && token.v === "[") {
      this.index += 1;
      const items: Expr[] = [];
      if (!this.isOp("]")) {
        items.push(this.parseExpr());
        while (this.isOp(",")) {
          this.index += 1;
          if (this.isOp("]")) break;
          items.push(this.parseExpr());
        }
      }
      if (!this.isOp("]")) throw new Error("Falta fechar lista");
      this.index += 1;
      return { t: "list", items };
    }
    throw new Error("Expressão incompleta");
  }
}

function parse(source: string): Stmt[] {
  return new Parser(tokenize(source)).parseProgram();
}

function collectRefs(expr: Expr, defined: Set<string>, refs: Set<string>) {
  if (expr.t === "name") {
    if (!defined.has(expr.v) && !BUILTINS.has(expr.v)) refs.add(expr.v);
    return;
  }
  if (expr.t === "neg") collectRefs(expr.x, defined, refs);
  if (expr.t === "bin") {
    collectRefs(expr.l, defined, refs);
    collectRefs(expr.r, defined, refs);
  }
  if (expr.t === "list") expr.items.forEach((item) => collectRefs(item, defined, refs));
  if (expr.t === "call") {
    if (!BUILTINS.has(expr.name) && !defined.has(expr.name)) refs.add(expr.name);
    expr.args.forEach((arg) => collectRefs(arg, defined, refs));
  }
}

export function inspectCell(code: string): { defines: string[]; refs: string[]; error?: string } {
  if (!code.trim()) return { defines: [], refs: [] };
  try {
    const statements = parse(code);
    const defined = new Set<string>();
    const refs = new Set<string>();
    for (const statement of statements) {
      collectRefs(statement.expr, defined, refs);
      if (statement.t === "assign") defined.add(statement.name);
    }
    return { defines: [...defined], refs: [...refs] };
  } catch (error) {
    return { defines: [], refs: [], error: error instanceof Error ? error.message : "Erro de sintaxe" };
  }
}

export type Env = Record<string, Value>;

function asNumber(value: Value, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} espera um número`);
  return value;
}

function asList(value: Value, label: string): number[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "number")) {
    throw new Error(`${label} espera uma lista de números`);
  }
  return value;
}

function callBuiltin(name: string, args: Value[]): Value {
  if (name === "str") {
    const value = args[0];
    if (value === undefined) throw new Error("str espera um valor");
    return formatValue(value);
  }
  if (name === "len") {
    const value = args[0];
    if (typeof value === "string" || Array.isArray(value)) return value.length;
    throw new Error("len espera texto ou lista");
  }
  if (name === "abs") return Math.abs(asNumber(args[0] ?? "x", "abs"));
  if (name === "sqrt") {
    const value = asNumber(args[0] ?? "x", "sqrt");
    if (value < 0) throw new Error("sqrt não aceita negativo");
    return Math.sqrt(value);
  }
  if (name === "log") {
    const value = asNumber(args[0] ?? "x", "log");
    if (value <= 0) throw new Error("log espera um número positivo");
    return Math.log(value);
  }
  if (name === "round") {
    const value = asNumber(args[0] ?? "x", "round");
    const digits = args[1] === undefined ? 0 : asNumber(args[1], "round");
    const power = 10 ** Math.min(8, Math.max(0, digits));
    return Math.round(value * power) / power;
  }
  if (name === "range") {
    const start = args.length <= 1 ? 0 : asNumber(args[0] ?? 0, "range");
    const end = args.length <= 1 ? asNumber(args[0] ?? 0, "range") : asNumber(args[1] ?? 0, "range");
    const out: number[] = [];
    const step = end >= start ? 1 : -1;
    for (let cursor = start; step > 0 ? cursor < end : cursor > end; cursor += step) {
      out.push(cursor);
      if (out.length > 500) throw new Error("range grande demais");
    }
    return out;
  }
  if (name === "linspace") {
    const start = asNumber(args[0] ?? 0, "linspace");
    const end = asNumber(args[1] ?? 0, "linspace");
    const count = asNumber(args[2] ?? 0, "linspace");
    if (count < 2 || count > 500) throw new Error("linspace precisa de 2 a 500 pontos");
    const out: number[] = [];
    for (let index = 0; index < count; index += 1) out.push(start + ((end - start) * index) / (count - 1));
    return out;
  }
  const listArg = (label: string) => {
    if (args.length === 1 && Array.isArray(args[0])) return asList(args[0], label);
    if (args.every((arg) => typeof arg === "number")) return args as number[];
    throw new Error(`${label} espera números ou uma lista`);
  };
  if (name === "sum") return listArg("sum").reduce((total, item) => total + item, 0);
  if (name === "mean") {
    const list = listArg("mean");
    if (!list.length) throw new Error("mean não aceita lista vazia");
    return list.reduce((total, item) => total + item, 0) / list.length;
  }
  if (name === "min") {
    const list = listArg("min");
    if (!list.length) throw new Error("min não aceita lista vazia");
    return Math.min(...list);
  }
  if (name === "max") {
    const list = listArg("max");
    if (!list.length) throw new Error("max não aceita lista vazia");
    return Math.max(...list);
  }
  if (name === "std") {
    const list = listArg("std");
    if (list.length < 2) return 0;
    const mean = list.reduce((total, item) => total + item, 0) / list.length;
    const variance = list.reduce((total, item) => total + (item - mean) ** 2, 0) / (list.length - 1);
    return Math.sqrt(variance);
  }
  if (name === "sort") return [...listArg("sort")].sort((a, b) => a - b);
  if (name === "unique") {
    const list = listArg("unique");
    return [...new Set(list)];
  }
  if (name === "chart") {
    const data = listArg("chart");
    const label = typeof args[1] === "string" ? args[1] : "série";
    return { kind: "chart", data, label };
  }
  throw new Error(`Função desconhecida: ${name}`);
}

function evalExpr(expr: Expr, env: Env): Value {
  if (expr.t === "num") return expr.v;
  if (expr.t === "str") return expr.v;
  if (expr.t === "name") {
    if (!(expr.v in env)) throw new Error(`Nome desconhecido: ${expr.v}`);
    return env[expr.v] as Value;
  }
  if (expr.t === "list") {
    const items = expr.items.map((item) => evalExpr(item, env));
    if (items.some((item) => typeof item !== "number")) throw new Error("Listas só guardam números");
    return items as number[];
  }
  if (expr.t === "neg") return -asNumber(evalExpr(expr.x, env), "negação");
  if (expr.t === "call") {
    if (!BUILTINS.has(expr.name)) throw new Error(`Função desconhecida: ${expr.name}`);
    return callBuiltin(expr.name, expr.args.map((arg) => evalExpr(arg, env)));
  }
  const left = evalExpr(expr.l, env);
  const right = evalExpr(expr.r, env);
  if (expr.op === "+" && (typeof left === "string" || typeof right === "string")) {
    return formatValue(left) + formatValue(right);
  }
  const a = asNumber(left, "operação");
  const b = asNumber(right, "operação");
  if (expr.op === "+") return a + b;
  if (expr.op === "-") return a - b;
  if (expr.op === "*") return a * b;
  if (expr.op === "%") {
    if (b === 0) throw new Error("Divisão por zero");
    return a % b;
  }
  if (b === 0) throw new Error("Divisão por zero");
  return a / b;
}

export type CellRun = {
  ok: boolean;
  error?: string;
  display: Value | null;
  bindings: { name: string; value: Value }[];
  defines: string[];
  refs: string[];
  deps: string[];
  order: number;
};

export function runNotebook(cells: { id: string; code: string }[]): { runs: Record<string, CellRun>; env: Env } {
  const info = new Map<string, ReturnType<typeof inspectCell>>();
  for (const cell of cells) info.set(cell.id, inspectCell(cell.code));

  const definedBy = new Map<string, string>();
  const duplicates = new Map<string, string>();
  for (const cell of cells) {
    const inspected = info.get(cell.id);
    if (!inspected || inspected.error) continue;
    for (const name of inspected.defines) {
      if (definedBy.has(name)) duplicates.set(cell.id, name);
      else definedBy.set(name, cell.id);
    }
  }

  const deps = new Map<string, string[]>();
  for (const cell of cells) {
    const inspected = info.get(cell.id);
    const links = (inspected?.refs ?? [])
      .map((name) => definedBy.get(name))
      .filter((id): id is string => Boolean(id) && id !== cell.id);
    deps.set(cell.id, [...new Set(links)]);
  }

  const indegree = new Map<string, number>(cells.map((cell) => [cell.id, 0]));
  const next = new Map<string, string[]>(cells.map((cell) => [cell.id, []]));
  for (const cell of cells) {
    for (const dep of deps.get(cell.id) ?? []) {
      indegree.set(cell.id, (indegree.get(cell.id) ?? 0) + 1);
      next.get(dep)?.push(cell.id);
    }
  }
  const queue = cells.filter((cell) => indegree.get(cell.id) === 0).map((cell) => cell.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift();
    if (!id) break;
    order.push(id);
    for (const child of next.get(id) ?? []) {
      indegree.set(child, (indegree.get(child) ?? 1) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  const cyclic = new Set(cells.map((cell) => cell.id).filter((id) => !order.includes(id)));
  const env: Env = {};
  const runs: Record<string, CellRun> = {};

  const base = (cellId: string, patch: Partial<CellRun>): CellRun => {
    const inspected = info.get(cellId);
    return {
      ok: false,
      display: null,
      bindings: [],
      defines: inspected?.defines ?? [],
      refs: inspected?.refs ?? [],
      deps: deps.get(cellId) ?? [],
      order: order.indexOf(cellId),
      ...patch,
    };
  };

  for (const id of order) {
    const cell = cells.find((item) => item.id === id);
    const inspected = info.get(id);
    if (!cell || !inspected) continue;
    if (inspected.error) {
      runs[id] = base(id, { error: inspected.error });
      continue;
    }
    if (duplicates.has(id)) {
      runs[id] = base(id, { error: `Nome repetido: ${duplicates.get(id)}` });
      continue;
    }
    try {
      const statements = cell.code.trim() ? parse(cell.code) : [];
      const bindings: { name: string; value: Value }[] = [];
      let display: Value | null = null;
      for (const statement of statements) {
        const value = evalExpr(statement.expr, env);
        if (statement.t === "assign") {
          env[statement.name] = value;
          bindings.push({ name: statement.name, value });
          display = null;
        } else {
          display = value;
        }
      }
      runs[id] = base(id, { ok: true, display, bindings });
    } catch (error) {
      runs[id] = base(id, { error: error instanceof Error ? error.message : "Falha ao calcular" });
    }
  }

  for (const id of cyclic) {
    runs[id] = base(id, { error: "Ciclo de dependências", order: -1 });
  }

  return { runs, env };
}

export function evalScratch(code: string, env: Env): { display: Value | null; error?: string } {
  try {
    const scratch: Env = { ...env };
    const statements = parse(code);
    let display: Value | null = null;
    for (const statement of statements) {
      const value = evalExpr(statement.expr, scratch);
      if (statement.t === "assign") {
        scratch[statement.name] = value;
        display = value;
      } else display = value;
    }
    return { display };
  } catch (error) {
    return { display: null, error: error instanceof Error ? error.message : "Falha ao calcular" };
  }
}
