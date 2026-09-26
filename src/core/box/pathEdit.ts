import type { PointMm } from "./geometry";

export type PathHandle = { x: number; y: number; xToken: number; yToken: number; kind: "node" | "control" };
export type EditablePath = { tokens: string[]; handles: PathHandle[] };
const lex = /[MmLlHhVvQqCcAaZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
const count: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6, A: 7, Z: 0 };

/** Parse the absolute SVG commands emitted by this editor without flattening curves. */
export function editablePath(path: string): EditablePath {
  const input = path.match(lex) ?? [];
  const tokens: string[] = [], handles: PathHandle[] = [];
  let x = 0, y = 0;
  for (let i = 0; i < input.length;) {
    const command = input[i++];
    const upper = command.toUpperCase();
    const width = count[upper];
    if (width === undefined || command !== upper) throw new Error("路径含不支持的相对命令。");
    if (upper === "Z") { tokens.push("Z"); continue; }
    const values = input.slice(i, i + width).map(Number);
    if (values.length !== width || !values.every(Number.isFinite)) throw new Error("路径坐标无效。");
    i += width;
    const at = tokens.length;
    if (upper === "H" || upper === "V") {
      x = upper === "H" ? values[0] : x;
      y = upper === "V" ? values[0] : y;
      tokens.push("L", String(x), String(y));
      handles.push({ x, y, xToken: at + 1, yToken: at + 2, kind: "node" });
      continue;
    }
    tokens.push(upper, ...values.map(String));
    const add = (xi: number, yi: number, kind: PathHandle["kind"]) => {
      handles.push({ x: values[xi], y: values[yi], xToken: at + xi + 1, yToken: at + yi + 1, kind });
    };
    if (upper === "Q") add(0, 1, "control");
    if (upper === "C") { add(0, 1, "control"); add(2, 3, "control"); }
    const xi = upper === "A" ? 5 : width - 2, yi = upper === "A" ? 6 : width - 1;
    add(xi, yi, "node");
    x = values[xi]; y = values[yi];
  }
  return { tokens, handles };
}

export function pathWithHandles(model: EditablePath, positions: PointMm[]): string {
  const tokens = [...model.tokens];
  model.handles.forEach((handle, index) => {
    const position = positions[index];
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error("节点坐标无效。");
    tokens[handle.xToken] = String(Number(position.x.toFixed(3)));
    tokens[handle.yToken] = String(Number(position.y.toFixed(3)));
  });
  return tokens.join(" ");
}
