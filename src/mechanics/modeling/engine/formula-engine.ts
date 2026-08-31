import type { DataRow } from "../../charts/types/chart-types";
import type { ModelParameter } from "../types/model-types";

function parseFormulaNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

type Token = { type: "number" | "field" | "parameter" | "identifier" | "operator" | "left" | "right" | "comma"; value: string };

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const rest = expression.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) { index += whitespace[0].length; continue; }
    if (expression[index] === "[") {
      const end = expression.indexOf("]", index + 1);
      if (end < 0) throw new Error("Brakuje znaku ] po nazwie kolumny.");
      const value = expression.slice(index + 1, end).trim();
      if (!value) throw new Error("Nazwa kolumny w nawiasach nie może być pusta.");
      tokens.push({ type: "field", value });
      index = end + 1;
      continue;
    }
    if (expression.startsWith("{{", index)) {
      const end = expression.indexOf("}}", index + 2);
      if (end < 0) throw new Error("Brakuje znaków }} po nazwie parametru.");
      const value = expression.slice(index + 2, end).trim();
      if (!value) throw new Error("Nazwa parametru nie może być pusta.");
      tokens.push({ type: "parameter", value });
      index = end + 2;
      continue;
    }
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (number) { tokens.push({ type: "number", value: number[0] }); index += number[0].length; continue; }
    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) { tokens.push({ type: "identifier", value: identifier[0] }); index += identifier[0].length; continue; }
    const char = expression[index];
    if ("+-*/^".includes(char)) tokens.push({ type: "operator", value: char });
    else if (char === "(") tokens.push({ type: "left", value: char });
    else if (char === ")") tokens.push({ type: "right", value: char });
    else if (char === ",") tokens.push({ type: "comma", value: char });
    else throw new Error(`Nieobsługiwany znak „${char}”.`);
    index += 1;
  }
  return tokens;
}

class FormulaParser {
  private index = 0;
  private readonly tokens: Token[];
  private readonly row: DataRow;
  private readonly parameters: Map<string, number>;
  constructor(tokens: Token[], row: DataRow, parameters: ModelParameter[]) {
    this.tokens = tokens;
    this.row = row;
    this.parameters = new Map(parameters.map((parameter) => [parameter.name.trim().toLowerCase(), parameter.value]));
  }

  parse() {
    if (!this.tokens.length) throw new Error("Wpisz formułę.");
    const value = this.expression();
    if (this.index !== this.tokens.length) throw new Error("Nie udało się odczytać całej formuły.");
    if (!Number.isFinite(value)) throw new Error("Formuła zwróciła nieprawidłową wartość.");
    return value;
  }

  private expression(): number {
    let value = this.term();
    while (this.peek("operator", "+") || this.peek("operator", "-")) {
      const operator = this.next().value;
      const right = this.term();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  private term(): number {
    let value = this.power();
    while (this.peek("operator", "*") || this.peek("operator", "/")) {
      const operator = this.next().value;
      const right = this.power();
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  private power(): number {
    let value = this.unary();
    if (this.peek("operator", "^")) { this.next(); value **= this.power(); }
    return value;
  }

  private unary(): number {
    if (this.peek("operator", "+")) { this.next(); return this.unary(); }
    if (this.peek("operator", "-")) { this.next(); return -this.unary(); }
    return this.primary();
  }

  private primary(): number {
    const token = this.next();
    if (token.type === "number") return Number(token.value);
    if (token.type === "field") {
      const value = parseFormulaNumber(this.row[token.value]);
      if (value == null) throw new Error(`Kolumna „${token.value}” nie zawiera liczby w tym wierszu.`);
      return value;
    }
    if (token.type === "parameter") {
      const value = this.parameters.get(token.value.toLowerCase());
      if (value == null || !Number.isFinite(value)) throw new Error(`Parametr „${token.value}” nie istnieje albo nie zawiera liczby.`);
      return value;
    }
    if (token.type === "left") {
      const value = this.expression();
      this.expect("right");
      return value;
    }
    if (token.type === "identifier") {
      const name = token.value.toLowerCase();
      if (name === "pi") return Math.PI;
      if (name === "e") return Math.E;
      this.expect("left");
      const args = [this.expression()];
      while (this.peek("comma")) { this.next(); args.push(this.expression()); }
      this.expect("right");
      if (name === "abs") return Math.abs(args[0]);
      if (name === "sqrt") return Math.sqrt(args[0]);
      if (name === "round") return Math.round(args[0]);
      if (name === "min") return Math.min(...args);
      if (name === "max") return Math.max(...args);
      if (name === "pow" && args.length === 2) return args[0] ** args[1];
      throw new Error(`Nieznana funkcja „${token.value}”.`);
    }
    throw new Error("Formuła ma nieprawidłową składnię.");
  }

  private peek(type: Token["type"], value?: string) { const token = this.tokens[this.index]; return token?.type === type && (value === undefined || token.value === value); }
  private next() { const token = this.tokens[this.index]; if (!token) throw new Error("Formuła kończy się zbyt wcześnie."); this.index += 1; return token; }
  private expect(type: Token["type"]) { if (!this.peek(type)) throw new Error(type === "right" ? "Brakuje nawiasu )." : "Nieprawidłowa formuła."); return this.next(); }
}

export function evaluateFormula(expression: string, row: DataRow, parameters: ModelParameter[] = []) {
  return new FormulaParser(tokenize(expression), row, parameters).parse();
}

export function evaluateFormulaSeries(expression: string, rows: DataRow[], parameters: ModelParameter[] = []) {
  const values: number[] = [];
  let error: string | undefined;
  rows.forEach((row) => {
    try { values.push(evaluateFormula(expression, row, parameters)); }
    catch (reason) { error ??= reason instanceof Error ? reason.message : "Nie udało się policzyć formuły."; }
  });
  return { values, validCount: values.length, error };
}

export function referencedFormulaFields(expression: string) {
  return tokenize(expression).filter((token) => token.type === "field").map((token) => token.value);
}

export function referencedFormulaParameters(expression: string) {
  return tokenize(expression).filter((token) => token.type === "parameter").map((token) => token.value);
}

export function validateFormulaExpression(expression: string, fields: string[], parameters: ModelParameter[] = []) {
  const row = Object.fromEntries(fields.map((field) => [field, "1"]));
  evaluateFormula(expression, row, parameters);
}
