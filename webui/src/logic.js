export const BIN = "/data/adb/modules/arch-manager/bin/archctl";
export const MODES = ["auto", "performance", "battery", "strict"];
export const GROUPS = ["top-app", "foreground", "background", "system-background", "restricted"];
const ARG = /^[A-Za-z0-9._-]+$/;
const FIXED = new Set([
  "status --json", "validate --json", "scan", "capture", "restore", "cpu list", "gpu list",
  "thermal list", "thermal check", "thermal cooling list", "core list", "scheduler list",
  "network list", "network tcp list", "profile list", "mode show", "daemon status"
]);

export const base = (path) => String(path ?? "").split("/").filter(Boolean).pop() ?? "";
export const words = (text) => String(text ?? "").split(/\s+/).filter(Boolean);
export const nums = (text) => words(text).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: `Invalid JSON from archctl: ${error.message}` };
  }
}

export function buildCommand(args) {
  if (!Array.isArray(args) || args.length === 0) throw new Error("empty command");
  for (const arg of args) if (!ARG.test(String(arg))) throw new Error(`rejected argument: ${arg}`);
  return `${BIN} ${args.map((arg) => `'${arg}'`).join(" ")}`;
}

export function isReadOnly(args) {
  return FIXED.has(args.join(" ")) && !["scan", "capture", "restore"].includes(args[0]);
}

const need = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function writeArgs(op, a, known) {
  const value = String(a.value);
  switch (op) {
    case "cpu-gov":
      need(known.cpu[a.id]?.gov.includes(value), `Unsupported CPU governor: ${value}`);
      return ["cpu", "set-governor", a.id, value];
    case "cpu-min":
    case "cpu-max":
      need(known.cpu[a.id]?.freq.includes(value), `Frequency not in table: ${value}`);
      return ["cpu", op === "cpu-min" ? "set-min" : "set-max", a.id, value];
    case "gpu-gov":
      need(known.gpu[a.id]?.gov.includes(value), `Unsupported GPU governor: ${value}`);
      return ["gpu", "set-governor", a.id, value];
    case "gpu-min":
    case "gpu-max":
      need(known.gpu[a.id]?.freq.includes(value), `Frequency not in table: ${value}`);
      return ["gpu", op === "gpu-min" ? "set-min" : "set-max", a.id, value];
    case "cooling":
      need(known.cooling[a.id] && /^\d+$/.test(value), `Unknown cooling device: ${a.id}`);
      return ["thermal", "cooling", "boost", a.id, value];
    case "core-online":
    case "core-offline":
      need(/^cpu\d+$/.test(a.id), `Invalid core: ${a.id}`);
      need(op === "core-online" || a.id !== "cpu0", "CPU0 cannot be taken offline");
      return ["core", op === "core-online" ? "online" : "offline", a.id];
    case "uclamp-min":
    case "uclamp-max":
      need(GROUPS.includes(a.id), `Unsupported group: ${a.id}`);
      need(/^\d{1,4}$/.test(value) && Number(value) <= 1024, "uclamp must be 0-1024");
      return ["scheduler", op === "uclamp-min" ? "set-uclamp-min" : "set-uclamp-max", a.id, value];
    case "tcp":
      need(known.tcp.includes(value), `Unavailable algorithm: ${value}`);
      return ["network", "tcp", "set-congestion", value];
    case "profile":
      need(known.profiles.includes(value), `Unknown profile: ${value}`);
      return ["profile", "apply", value];
    case "mode":
      need(MODES.includes(value), `Unknown mode: ${value}`);
      return ["mode", "set", value];
    default:
      throw new Error(`Unknown operation: ${op}`);
  }
}

export function previewArgs(name, known) {
  need(known.profiles.includes(name), `Unknown profile: ${name}`);
  return ["profile", "apply", name, "--dry-run"];
}

export function classify(result) {
  const text = `${result.stderr}\n${result.stdout}`;
  let kind = "error";
  if (result.errno === 127 || /not found|no such file/i.test(text)) kind = "missing";
  else if (/permission denied|not writable|operation not permitted/i.test(text)) kind = "permission";
  else if (/does not exist|unavailable|not available|not in the supported|unsupported/i.test(text)) kind = "unsupported";
  else if (/thermal guard/i.test(text)) kind = "thermal";
  const label = {
    missing: "archctl is unavailable or a required path is missing",
    permission: "Permission denied",
    unsupported: "Not supported on this device",
    thermal: "Blocked by thermal guard",
    error: "archctl reported an error"
  }[kind];
  return { kind, label, detail: (result.stderr || result.stdout || `exit code ${result.errno}`).trim() };
}

const DRY = /^Dry run: (CPU|GPU) (\S+) (governor|minimum frequency|maximum frequency) -> (\S+)$/;

export function parseDryRun(stdout, stderr) {
  const changes = [];
  let restore = false;
  for (const line of String(stdout).split("\n")) {
    const match = DRY.exec(line.trim());
    if (match) changes.push({ kind: match[1], name: match[2], field: match[3], value: match[4] });
    else if (line.startsWith("Dry run: restore")) restore = true;
  }
  const skipped = String(stderr).split("\n").map((l) => l.trim()).filter((l) => l.startsWith("Skipped"));
  return { changes, skipped, restore };
}

export function currentValue(change, cpu, gpu) {
  if (change.kind === "CPU") {
    const item = cpu.find((p) => base(p.path) === change.name);
    if (!item) return { node: "", old: null };
    const key = { governor: "scaling_governor", "minimum frequency": "scaling_min_freq", "maximum frequency": "scaling_max_freq" }[change.field];
    return { node: `${item.path}/${key}`, old: item[key] };
  }
  const item = gpu.find((d) => base(d.path) === change.name);
  if (!item) return { node: "", old: null };
  const key = { governor: "governor", "minimum frequency": "min_freq", "maximum frequency": "max_freq" }[change.field];
  return { node: `${item.path}/${key}`, old: item[key] };
}

export function raisesPerformance(change, old) {
  if (change.field === "governor") return /performance/i.test(change.value);
  return old != null && Number(change.value) > Number(old);
}

export const fmtKhz = (v) => (v == null || v === "" ? "n/a" : `${Math.round(Number(v) / 1000)} MHz`);
export const fmtHz = (v) => (v == null || v === "" ? "n/a" : `${Math.round(Number(v) / 1e6)} MHz`);
export const fmtTemp = (m) => (m == null ? "n/a" : `${(m / 1000).toFixed(1)} °C`);
