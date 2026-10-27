/* ── KernelSU bridge ─────────────────────────────────────────────────── */
let _cbId = 0;
function _exec(cmd, opts) {
  opts = opts || {};
  return new Promise((res, rej) => {
    const key = `_ksu_cb_${Date.now()}_${_cbId++}`;
    window[key] = (errno, stdout, stderr) => {
      res({ errno, stdout: stdout || "", stderr: stderr || "" });
      delete window[key];
    };
    try { ksu.exec(cmd, JSON.stringify(opts), key); }
    catch(e) { rej(e); delete window[key]; }
  });
}

/* ── Inline lucide SVG strings ───────────────────────────────────────── */
const SVG = {
  base: (paths) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`,
  home: () => SVG.base(`<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`),
  cpu: () => SVG.base(`<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M2 7h2"/><path d="M2 17h2"/><path d="M7 2v2"/><path d="M17 2v2"/><path d="M7 20v2"/><path d="M17 20v2"/><path d="M20 7h2"/><path d="M20 17h2"/>`),
  gauge: () => SVG.base(`<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>`),
  sliders: () => SVG.base(`<path d="M10 5H3"/><path d="M12 19H3"/><path d="M21 5h-7"/><path d="M21 19h-5"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M8 10v4"/><path d="M8 12H3"/>`),
  more: () => SVG.base(`<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>`),
  thermometer: () => SVG.base(`<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>`),
  workflow: () => SVG.base(`<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>`),
  network: () => SVG.base(`<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>`),
  settings: () => SVG.base(`<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>`),
  chevronRight: () => SVG.base(`<path d="m9 18 6-6-6-6"/>`),
  check: () => SVG.base(`<path d="M20 6 9 17l-5-5"/>`),
  alertTriangle: () => SVG.base(`<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>`),
  activity: () => SVG.base(`<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>`),
  shield: () => SVG.base(`<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>`),
  zap: () => SVG.base(`<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>`),
};

/* ── Constants ───────────────────────────────────────────────────────── */
const BIN = "/data/adb/modules/arch-manager/bin/archctl";
const MODES = ["auto", "performance", "battery", "strict"];
const GROUPS = ["top-app", "foreground", "background", "system-background", "restricted"];
const MODE_HELP = {
  auto: "Balanced while screen is on, stock while off",
  performance: "Performance in both screen states",
  battery: "Battery mode while on, stock while off",
  strict: "Stock values in every state"
};
const PAGES = ["Dashboard", "CPU", "GPU", "Profiles", "More"];
const NAV_ICONS = {
  Dashboard: "home", CPU: "cpu", GPU: "gauge", Profiles: "sliders", More: "more"
};
const SOURCES = {
  Dashboard: { status:["status","--json"], validate:["validate","--json"], check:["thermal","check"], mode:["mode","show"], profiles:["profile","list"], cpu:["cpu","list"], gpu:["gpu","list"] },
  CPU:       { cpu:["cpu","list"], core:["core","list"] },
  GPU:       { gpu:["gpu","list"] },
  Thermal:   { check:["thermal","check"], zones:["thermal","list"], cooling:["thermal","cooling","list"] },
  Scheduler: { sched:["scheduler","list"] },
  Network:   { net:["network","list"], tcp:["network","tcp","list"] },
  Profiles:  { profiles:["profile","list"], cpu:["cpu","list"], gpu:["gpu","list"] },
  Settings:  { mode:["mode","show"], daemon:["daemon","status"] }
};
const ARG_RE = /^[A-Za-z0-9._-]+$/;

/* ── Helpers ─────────────────────────────────────────────────────────── */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]);
const base = (s) => String(s ?? "").split("/").filter(Boolean).pop() ?? "";
const words = (s) => String(s ?? "").split(/\s+/).filter(Boolean);
const nums = (s) => words(s).map(Number).filter(Number.isFinite).sort((a,b) => a-b);
const fmtKhz = (v) => v == null || v === "" ? "n/a" : `${Math.round(Number(v)/1000)} MHz`;
const fmtHz  = (v) => v == null || v === "" ? "n/a" : `${Math.round(Number(v)/1e6)} MHz`;
const fmtTemp = (v) => v == null ? "n/a" : `${(v/1000).toFixed(1)} °C`;

function cpuLabel(p) {
  const id = base(p?.path), m = /^policy(\d+)$/i.exec(id);
  return m ? `CPU cluster ${Number(m[1])}` : id ? `CPU ${id}` : "CPU cluster";
}
function cpuCores(p) {
  const c = words(p?.affected_cpus).map(Number).filter(Number.isInteger).sort((a,b)=>a-b);
  if (!c.length) return "CPU policy";
  return `Cores ${c.every((v,i) => i===0||v===c[i-1]+1) ? `${c[0]}–${c[c.length-1]}` : c.join(", ")}`;
}
const gpuLabel = (i, n) => n > 1 ? `GPU ${i+1}` : "GPU";
const gpuBackend = (b) => ({"qualcomm-kgsl":"Qualcomm Adreno","mali-devfreq":"ARM Mali","mediatek-vendor":"MediaTek"})[b] ?? "Graphics processor";

function parseJson(s) {
  try { return { ok:true, value:JSON.parse(s) }; }
  catch(e) { return { ok:false, error:`Invalid JSON: ${e.message}` }; }
}
function buildCommand(args) {
  if (!Array.isArray(args) || !args.length) throw new Error("empty command");
  for (const a of args) if (!ARG_RE.test(String(a))) throw new Error(`rejected argument: ${a}`);
  return `${BIN} ${args.map(a => `'${a}'`).join(" ")}`;
}
function classify(r) {
  const txt = `${r.stderr}\n${r.stdout}`;
  let kind = "error";
  if (r.errno === 127 || /not found|no such file/i.test(txt)) kind = "missing";
  else if (/permission denied|not writable|operation not permitted/i.test(txt)) kind = "permission";
  else if (/does not exist|unavailable|not available|not in the supported|unsupported/i.test(txt)) kind = "unsupported";
  else if (/thermal guard/i.test(txt)) kind = "thermal";
  const label = { missing:"archctl unavailable or path missing", permission:"Permission denied", unsupported:"Not supported on this device", thermal:"Blocked by thermal guard", error:"archctl reported an error" }[kind];
  return { kind, label, detail:(r.stderr||r.stdout||`exit code ${r.errno}`).trim() };
}

function writeArgs(op, el, caps) {
  const assert = (c, msg) => { if (!c) throw new Error(msg); };
  const v = String(el.value);
  switch (op) {
    case "cpu-gov": assert(caps.cpu[el.id]?.gov.includes(v), `Unsupported governor: ${v}`); return ["cpu","set-governor",el.id,v];
    case "cpu-min": assert(caps.cpu[el.id]?.freq.includes(v), `Frequency not in table: ${v}`); return ["cpu","set-min",el.id,v];
    case "cpu-max": assert(caps.cpu[el.id]?.freq.includes(v), `Frequency not in table: ${v}`); return ["cpu","set-max",el.id,v];
    case "gpu-gov": assert(caps.gpu[el.id]?.gov.includes(v), `Unsupported governor: ${v}`); return ["gpu","set-governor",el.id,v];
    case "gpu-min": assert(caps.gpu[el.id]?.freq.includes(v), `Frequency not in table: ${v}`); return ["gpu","set-min",el.id,v];
    case "gpu-max": assert(caps.gpu[el.id]?.freq.includes(v), `Frequency not in table: ${v}`); return ["gpu","set-max",el.id,v];
    case "cooling": assert(caps.cooling[el.id] && /^\d+$/.test(v), `Unknown cooling device: ${el.id}`); return ["thermal","cooling","boost",el.id,v];
    case "core-online": assert(/^cpu\d+$/.test(el.id), `Invalid core: ${el.id}`); return ["core","online",el.id];
    case "core-offline": assert(/^cpu\d+$/.test(el.id), `Invalid core: ${el.id}`); assert(el.id!=="cpu0","CPU0 cannot be taken offline"); return ["core","offline",el.id];
    case "uclamp-min": assert(GROUPS.includes(el.id), `Unsupported group: ${el.id}`); assert(/^\d{1,4}$/.test(v)&&Number(v)<=1024,"uclamp 0-1024"); return ["scheduler","set-uclamp-min",el.id,v];
    case "uclamp-max": assert(GROUPS.includes(el.id), `Unsupported group: ${el.id}`); assert(/^\d{1,4}$/.test(v)&&Number(v)<=1024,"uclamp 0-1024"); return ["scheduler","set-uclamp-max",el.id,v];
    case "tcp": assert(caps.tcp.includes(v), `Unavailable: ${v}`); return ["network","tcp","set-congestion",v];
    case "profile": assert(caps.profiles.includes(v), `Unknown profile: ${v}`); return ["profile","apply",v];
    case "mode": assert(MODES.includes(v), `Unknown mode: ${v}`); return ["mode","set",v];
    default: throw new Error(`Unknown operation: ${op}`);
  }
}

const DRY_RE = /^Dry run: (CPU|GPU) (\S+) (governor|minimum frequency|maximum frequency) -> (\S+)$/;
function parseDryRun(stdout, stderr) {
  const changes = [], skipped = [];
  let restore = false;
  for (const line of String(stdout).split("\n")) {
    const m = DRY_RE.exec(line.trim());
    if (m) changes.push({ kind:m[1], name:m[2], field:m[3], value:m[4] });
    else if (line.startsWith("Dry run: restore")) restore = true;
  }
  for (const line of String(stderr).split("\n")) {
    if (line.trim().startsWith("Skipped")) skipped.push(line.trim());
  }
  return { changes, skipped, restore };
}
function currentValue(change, cpuList, gpuList) {
  if (change.kind === "CPU") {
    const p = cpuList.find(p => base(p.path) === change.name);
    if (!p) return { node:"", old:null };
    const f = { governor:"scaling_governor", "minimum frequency":"scaling_min_freq", "maximum frequency":"scaling_max_freq" }[change.field];
    return { node:`${p.path}/${f}`, old:p[f] };
  }
  const d = gpuList.find(d => base(d.path) === change.name);
  if (!d) return { node:"", old:null };
  const f = { governor:"governor", "minimum frequency":"min_freq", "maximum frequency":"max_freq" }[change.field];
  return { node:`${d.path}/${f}`, old:d[f] };
}
const raisesPerf = (c, old) => c.field === "governor" ? /performance/i.test(c.value) : old != null && Number(c.value) > Number(old);

/* ── App state ───────────────────────────────────────────────────────── */
let page = "Dashboard";
let data = {};
let toast = null;
let prevPage = null;
let simple = localStorage.getItem("arch-simple-mode") !== "advanced";
let chain = Promise.resolve();
let mock = null;

const view = document.getElementById("view");
const dlg  = document.getElementById("dlg");

/* ── Run queue ───────────────────────────────────────────────────────── */
function run(args) {
  const job = chain.then(async () => {
    try {
      const cmd = buildCommand(args);
      const r = mock ? await mock(cmd) : await _exec(cmd);
      return { errno: r.errno ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    } catch(e) {
      return { errno:-1, stdout:"", stderr:`KernelSU error: ${e?.message ?? e}` };
    }
  });
  chain = job.catch(() => {});
  return job;
}

async function getJson(args) {
  const r = await run(args);
  const p = parseJson(r.stdout);
  if (p.ok && (r.errno === 0 || args[0] === "validate")) return { ok:true, value:p.value, errno:r.errno };
  return { ok:false, error: r.errno === 0 ? { label:"Invalid output", detail:p.error } : classify(r) };
}

async function load() {
  const cur = page;
  data = {};
  render();
  if (cur === "More") return;
  const entries = Object.entries(SOURCES[cur] ?? {});
  const results = await Promise.all(entries.map(([,a]) => getJson(a)));
  if (page !== cur) return;
  entries.forEach(([k],i) => data[k] = results[i]);
  render();
}

function caps() {
  const val = (r) => r?.ok ? r.value : [];
  const out = { cpu:{}, gpu:{}, cooling:{}, tcp:[], profiles:[] };
  for (const p of val(data.cpu)) out.cpu[base(p.path)] = { gov:words(p.available_governors), freq:words(p.available_frequencies) };
  for (const d of val(data.gpu)) out.gpu[base(d.path)] = { gov:words(d.available_governors), freq:words(d.available_frequencies) };
  for (const c of val(data.cooling)) out.cooling[base(c.path)] = c;
  out.tcp = words(data.tcp?.value?.available);
  out.profiles = val(data.profiles).map(p => p.name);
  return out;
}

/* ── Dialog ──────────────────────────────────────────────────────────── */
function ask(title, lines, danger = false) {
  document.getElementById("dt").textContent = title;
  document.getElementById("db").innerHTML = lines.filter(Boolean).map(l => `<p>${l}</p>`).join("");
  const yes = document.getElementById("yes");
  yes.className = `btn${danger ? " btn-danger" : ""}`;
  return new Promise(res => {
    dlg.addEventListener("close", () => res(dlg.returnValue === "yes"), { once:true });
    yes.onclick = () => dlg.close("yes");
    document.getElementById("no").onclick = () => dlg.close("no");
    dlg.showModal();
  });
}

async function thermalNote() {
  const t = await getJson(["thermal","check"]);
  if (!t.ok) return { text:`Thermal check failed: ${esc(t.error.detail)}`, unsafe:true };
  const v = t.value;
  return {
    text:`${fmtTemp(v.hottest_millicelsius)} · limit ${fmtTemp(v.limit_millicelsius)} · ${v.safe_for_performance_increase ? "safe" : "<b>unsafe for performance increase</b>"}`,
    unsafe: !v.safe_for_performance_increase
  };
}

async function write(op, el, title, lines, increase=false, danger=false) {
  let args;
  try { args = writeArgs(op, el, caps()); }
  catch(e) { toast = { ok:false, text:e.message }; return render(); }
  const note = increase ? await thermalNote() : null;
  if (!await ask(title, [...lines.map(esc), note?.text, `<code>archctl ${args.join(" ")}</code>`], danger || note?.unsafe)) return render();
  const r = await run(args);
  toast = r.errno === 0 ? { ok:true, text:r.stdout.trim(), warn:r.stderr.trim() } : { ok:false, text:classify(r).label, warn:classify(r).detail };
  await load();
}

async function simpleRun(args, title, text, danger=false) {
  if (!await ask(title, [esc(text), `<code>archctl ${args.join(" ")}</code>`], danger)) return;
  const r = await run(args);
  toast = r.errno === 0 ? { ok:true, text:r.stdout.trim() } : { ok:false, text:classify(r).label };
  await load();
}

async function doPreview(name) {
  let args;
  try { args = ["profile","apply",name,"--dry-run"]; }
  catch(e) { toast = { ok:false, text:e.message }; return render(); }
  const r = await run(args);
  if (r.errno !== 0) { toast = { ok:false, text:classify(r).label }; return render(); }
  const dry = parseDryRun(r.stdout, r.stderr);
  const cpuList = data.cpu?.ok ? data.cpu.value : [];
  const gpuList = data.gpu?.ok ? data.gpu.value : [];
  let raises = false;
  const rows = dry.changes.map(c => {
    const cur = currentValue(c, cpuList, gpuList);
    raises ||= raisesPerf(c, cur.old);
    return `<tr><td>${esc(cur.node||`${c.kind} ${c.name}`)}</td><td>${esc(cur.old??"n/a")}</td><td>${esc(c.value)}</td></tr>`;
  });
  const table = rows.length ? `<table><tr><th>Node</th><th>Before</th><th>After</th></tr>${rows.join("")}</table>` : esc(dry.restore ? "Restores captured baseline." : "No changes planned.");
  const note = raises ? await thermalNote() : null;
  if (!await ask(`Apply ${name}?`, [table, note?.text], raises && note?.unsafe)) return;
  let applyArgs;
  try { applyArgs = writeArgs("profile", { value:name }, caps()); }
  catch(e) { toast = { ok:false, text:e.message }; return render(); }
  const done = await run(applyArgs);
  toast = done.errno === 0 ? { ok:true, text:done.stdout.trim() } : { ok:false, text:classify(done).label };
  await load();
}

/* ── HTML builders ───────────────────────────────────────────────────── */
const badge = (text, tone="") => `<span class="badge ${tone}">${esc(text)}</span>`;

const kv = (rows) => `<dl>${rows.map(([k,v]) => `<dt>${esc(k)}</dt><dd>${esc(v??"n/a")}</dd>`).join("")}</dl>`;

const card = (title, body, icon="", right="") =>
  `<section class="card"><div class="card-head"><span class="card-title">${icon ? SVG[icon]() : ""}${esc(title)}</span>${right}</div>${body}</section>`;

const fail = (res) =>
  `<section class="card err"><div class="card-head"><span class="card-title">${SVG.alertTriangle()}<strong>${esc(res.error.label)}</strong></span></div><details class="adv"><summary>Details</summary><pre>${esc(res.error.detail)}</pre></details></section>`;

const loading = () => `<p class="muted loading">Loading…</p>`;

function block(result, fn) {
  if (!result) return loading();
  return result.ok ? fn(result.value) : fail(result);
}

function pick(op, id, options, current, fmt=(v)=>v, label="") {
  if (!options.length) return `<p class="muted">${esc(label)} unavailable</p>`;
  const list = options.includes(String(current)) ? options : [String(current), ...options];
  return `<label>${esc(label)}<select data-op="${op}" data-id="${esc(id)}">${list.map(o => `<option value="${esc(o)}"${o===String(current)?" selected":""}>${esc(fmt(o))}</option>`).join("")}</select></label>`;
}

function devCard(kind, item, idx=0, count=1) {
  const id = base(item.path);
  const isCpu = kind === "cpu";
  const fmt = isCpu ? fmtKhz : fmtHz;
  const govs = words(item.available_governors);
  const freqs = nums(item.available_frequencies).map(String);
  const cur = isCpu ? [item.scaling_governor, item.scaling_min_freq, item.scaling_max_freq]
                    : [item.governor, item.min_freq, item.max_freq];
  const title = isCpu ? cpuLabel(item) : gpuLabel(idx, count);
  const subtitle = isCpu ? cpuCores(item) : gpuBackend(item.backend);
  const curFreqRaw = isCpu ? item.scaling_cur_freq : item.cur_freq;
  const curFreqParts = fmt(curFreqRaw).split(" ");
  const icon = isCpu ? "cpu" : "gauge";

  const advRows = isCpu
    ? [["Current freq", fmt(item.scaling_cur_freq)], ["Governors", govs.join(", ")||"n/a"], ["Freq table", freqs.map(fmt).join(", ")||"n/a"], ["Path", item.path]]
    : [["Backend", gpuBackend(item.backend)], ["Identifier", item.name??id], ["Freq table", freqs.map(fmt).join(", ")||"n/a"], ["Path", item.path]];

  return `<section class="tune-card">
    <div class="tune-head">
      <div>
        <div class="tune-eyebrow">${isCpu ? "CPU" : "GPU"}</div>
        <div class="tune-title">${esc(title)}</div>
        <div class="tune-sub">${esc(subtitle)}</div>
      </div>
      ${badge(isCpu?"CPU":"GPU")}
    </div>
    <div class="freq-display">
      <span class="freq-val">${esc(curFreqParts[0])}</span>
      <span class="freq-unit">${esc(curFreqParts[1]||"")} · ${esc(cur[0]||"n/a")}</span>
    </div>
    <div class="ctl-grid">
      ${pick(`${kind}-gov`, id, govs, cur[0], v=>v, "Governor")}
      ${pick(`${kind}-min`, id, freqs, cur[1], fmt, "Min")}
      ${pick(`${kind}-max`, id, freqs, cur[2], fmt, "Max")}
    </div>
    <details class="adv"><summary>Advanced</summary>${kv(advRows)}</details>
  </section>`;
}

function thermalCard() {
  const r = data.check;
  if (!r?.ok) return r ? fail(r) : "";
  const v = r.value;
  const safe = v.safe_for_performance_increase;
  const hotParts = fmtTemp(v.hottest_millicelsius).split(" ");
  const headroom = (v.limit_millicelsius != null && v.hottest_millicelsius != null)
    ? fmtTemp(Number(v.limit_millicelsius) - Number(v.hottest_millicelsius)) : "n/a";
  return `<div class="thermal-card ${safe?"":"unsafe"}">
    <div class="temp-ring">
      <div>
        <div class="temp-ring-val">${esc(hotParts[0])}</div>
        <div class="temp-ring-unit">PEAK</div>
      </div>
    </div>
    <div class="thermal-info">
      <div class="thermal-title">${safe ? "Thermal safe" : "Thermal guard active"}</div>
      <div class="thermal-sub">${safe ? "Room for performance gains." : "Performance blocked until cooler."}</div>
      <div class="thermal-facts">
        <div class="thermal-fact"><span class="thermal-fact-label">Limit</span><span class="thermal-fact-val">${esc(fmtTemp(v.limit_millicelsius))}</span></div>
        <div class="thermal-fact"><span class="thermal-fact-label">Headroom</span><span class="thermal-fact-val">${esc(headroom)}</span></div>
      </div>
    </div>
  </div>`;
}

const profileColorClass = (name) => ({ performance:"performance", balanced:"balanced", battery:"battery", stock:"stock", gaming:"gaming" })[name] ?? "balanced";

function profileRow(p, compact=false) {
  return `<div class="profile-row ${profileColorClass(p.name)}">
    <div>
      <div class="profile-eyebrow">PROFILE</div>
      <div class="profile-name">${esc(p.name)}</div>
      ${!compact ? `<div class="profile-desc">${esc(p.description ?? "Kernel tuning profile")}</div>` : ""}
    </div>
    <button class="btn btn-ghost btn-sm" data-act="preview" data-id="${esc(p.name)}">Apply</button>
  </div>`;
}

/* ── Page views ──────────────────────────────────────────────────────── */
const VIEWS = {
  Dashboard() {
    const hero = block(data.status, v => {
      const dev = v.device ?? {};
      const cpuPolicies = v.cpu_policies ?? [];
      const gpus = v.devfreq_devices ?? [];
      const cpuRows = cpuPolicies.map(p =>
        `<div class="stat-row"><span class="stat-label">${esc(cpuLabel(p))} · <span class="stat-detail">${esc(cpuCores(p))}</span></span><div style="text-align:right"><span class="stat-val">${esc(fmtKhz(p.scaling_cur_freq))}</span><div class="stat-detail">gov <b>${esc(p.scaling_governor??"n/a")}</b></div></div></div>`
      ).join("");
      const gpuRows = gpus.map((g,i) =>
        `<div class="stat-row"><span class="stat-label">${esc(gpuLabel(i,gpus.length))} · <span class="stat-detail">${esc(gpuBackend(g.backend))}</span></span><div style="text-align:right"><span class="stat-val">${esc(fmtHz(g.cur_freq))}</span><div class="stat-detail">gov <b>${esc(g.governor??"n/a")}</b></div></div></div>`
      ).join("");
      return `<div class="hero">
        <div class="hero-status">LIVE</div>
        <div class="hero-eyebrow">SYSTEM</div>
        <h2>${esc(dev.machine ?? dev.soc_id ?? "Device ready")}</h2>
        <div class="hero-sub">${esc(dev.android_version ?? "Android")}</div>
      </div>
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><span class="card-title">${SVG.cpu()}CPU</span>${badge(`${cpuPolicies.length} ${cpuPolicies.length===1?"policy":"policies"}`)}</div>
          ${cpuRows || `<p class="muted">No CPU data</p>`}
        </section>
        <section class="card">
          <div class="card-head"><span class="card-title">${SVG.gauge()}GPU</span>${badge(`${gpus.length} ${gpus.length===1?"device":"devices"}`)}</div>
          ${gpuRows || `<p class="muted">No GPU data</p>`}
        </section>
      </div>`;
    });
    const modeCard = block(data.mode, v =>
      `<div class="mode-row">
        <div class="mode-icon-wrap">${SVG.sliders()}</div>
        <div class="mode-body">
          <div class="mode-name">${esc((v.mode??"unknown").replace(/^./,c=>c.toUpperCase()))}</div>
          <div class="mode-desc">${esc(MODE_HELP[v.mode] ?? "Performance mode")}</div>
        </div>
        <div class="mode-actions">
          ${badge(`Screen ${v.screen_state??"unknown"}`)}
          <button class="btn btn-ghost btn-sm" data-page="Settings">${SVG.chevronRight()}</button>
        </div>
      </div>`
    );
    const profsCard = block(data.profiles, v =>
      `<div class="row" style="margin-bottom:10px">
        <div class="section-label">${SVG.zap()}Quick profiles</div>
        <button class="btn-link" data-page="Profiles">View all</button>
      </div>
      <div class="profile-stack">${v.slice(0,3).map(p=>profileRow(p,true)).join("")}</div>`
    );
    const validCard = block(data.validate, v =>
      `<div class="valid-strip">
        <div class="valid-icon ${v.passed?"ok":"bad"}">${v.passed?SVG.check():SVG.alertTriangle()}</div>
        <div class="valid-text">
          <strong>${v.passed ? "System ready" : "Validation needs attention"}</strong>
          <small>${(v.checks?.filter(c=>c.status==="pass").length??0)} checks passed</small>
        </div>
      </div>`
    );
    return thermalCard() + hero + modeCard + profsCard + validCard;
  },

  CPU() {
    const devCards = block(data.cpu, v =>
      v.length ? v.map(p=>devCard("cpu",p)).join("") : `<p class="muted">No CPU policies found.</p>`
    );
    const coreCtl = block(data.core, v => {
      const online = v.filter(c=>c.online).length;
      const sorted = [...v].sort((a,b)=>a.cpu-b.cpu);
      const rows = sorted.map(c => {
        const canOff = c.writable && c.online_node && c.cpu!==0 && c.online && online>1;
        const canOn  = c.writable && c.online_node && !c.online;
        return `<div class="core-item">
          <span class="core-id">CPU${c.cpu}</span>
          ${badge(c.online?"Online":"Offline", c.online?"ok":"warn")}
          ${canOff ? `<button class="btn btn-ghost btn-sm" data-act="core-offline" data-id="cpu${c.cpu}">Offline</button>` : ""}
          ${canOn  ? `<button class="btn btn-ghost btn-sm" data-act="core-online" data-id="cpu${c.cpu}">Online</button>` : ""}
        </div>`;
      });
      const inner = `<div class="core-list">${rows.join("")||`<p class="muted">No cores reported.</p>`}</div>`;
      return simple
        ? `<details class="adv" style="border:1px solid var(--line);border-radius:var(--r);padding:0 16px;background:var(--s0)"><summary style="padding:14px 0">Core control</summary>${inner}</details>`
        : card("Core control", inner, "cpu");
    });
    return `<div class="page-top"><div class="page-eyebrow">PROCESSOR</div><h2 class="page-h">CPU</h2></div>${devCards}${coreCtl}`;
  },

  GPU() {
    const devCards = block(data.gpu, v =>
      v.length ? v.map((g,i)=>devCard("gpu",g,i,v.length)).join("") : `<p class="muted">No GPU devices found.</p>`
    );
    return `<div class="page-top"><div class="page-eyebrow">GRAPHICS</div><h2 class="page-h">GPU</h2></div>${devCards}`;
  },

  Profiles() {
    const profiles = block(data.profiles, v =>
      (v.map(p=>profileRow(p)).join("")||`<p class="muted">No profiles available.</p>`) +
      `<div class="restore-card">
        <div>
          <h4>Restore baseline</h4>
          <p>Write captured values back to the kernel.</p>
        </div>
        <button class="btn btn-danger btn-sm" data-act="restore">Restore</button>
      </div>`
    );
    return `<div class="page-top"><div class="page-eyebrow">TUNING</div><h2 class="page-h">Profiles</h2></div>${profiles}`;
  },

  Thermal() {
    const zones = block(data.zones, v =>
      v.length ? v.map(z =>
        `<details class="adv" style="border:1px solid var(--line);border-radius:var(--r);padding:0 16px;background:var(--s0);margin-bottom:8px">
          <summary style="padding:14px 0;font-size:13px;font-weight:700;color:var(--text)">${esc(z.zone_type||base(z.path))}<span style="margin-left:8px">${badge(fmtTemp(z.temperature_millicelsius))}</span></summary>
          ${kv([["Zone",base(z.path)],["Temp",fmtTemp(z.temperature_millicelsius)],["Critical",fmtTemp(z.critical_trip_millicelsius)]])}
        </details>`
      ).join("") : `<p class="muted">No thermal zones found.</p>`
    );
    const cooling = block(data.cooling, v =>
      v.length ? v.map(c =>
        card(base(c.path), kv([["Type",c.device_type],["State",`${c.current_state??"n/a"} / ${c.max_state??"n/a"}`]]), "thermometer")
      ).join("") : `<p class="muted">No cooling devices found.</p>`
    );
    return `<div class="page-top"><div class="page-eyebrow">PROTECTION</div><h2 class="page-h">Thermal</h2></div>${thermalCard()}<div class="section-label" style="margin-top:16px">${SVG.shield()}Zones</div>${zones}<div class="section-label" style="margin-top:16px">${SVG.thermometer()}Cooling</div>${cooling}`;
  },

  Scheduler() {
    const body = block(data.sched, v =>
      GROUPS.map(g => {
        const items = (v.uclamp??[]).filter(u=>u.group===g);
        if (!items.length) return "";
        return card(g, items.map(u =>
          `<div class="row" style="gap:8px;margin-bottom:8px">
            <label style="flex:1">${esc(u.attribute)}<input type="number" min="0" max="1024" value="${esc(u.value)}" data-op="${u.attribute.endsWith("min")?"uclamp-min":"uclamp-max"}" data-id="${g}" ${u.writable?"":"disabled"}></label>
            <button class="btn btn-ghost btn-sm" style="margin-top:16px" data-act="uclamp" data-op="${u.attribute.endsWith("min")?"uclamp-min":"uclamp-max"}" data-id="${g}">Apply</button>
          </div>`
        ).join(""), "workflow");
      }).join("") || `<p class="muted">No uclamp interface exposed.</p>`
    );
    return `<div class="page-top"><div class="page-eyebrow">SYSTEM</div><h2 class="page-h">Scheduler</h2></div>${body}`;
  },

  Network() {
    const tcp = block(data.tcp, v =>
      card("TCP congestion", kv([["Current",v.current],["Allowed",v.allowed]]) +
        (v.writable ? pick("tcp","tcp",words(v.available),v.current,x=>x,"Algorithm") : badge("read-only","warn")),
        "network"
      )
    );
    const net = block(data.net, v =>
      simple ? `<p class="muted">${v.length} interface${v.length===1?"":"s"} detected.</p>` :
      v.map(n => card(n.name, kv([["State",n.operstate],["Carrier",n.carrier],["MTU",n.mtu],["Speed",n.speed],["MAC",n.address]]),"network")).join("")
    );
    return `<div class="page-top"><div class="page-eyebrow">CONNECTIVITY</div><h2 class="page-h">Network</h2></div>${tcp}${net}`;
  },

  Settings() {
    const modeCard = block(data.mode, v =>
      card("Adaptive mode",
        kv([["Current",v.mode],["Screen",v.screen_state],["Behavior",MODE_HELP[v.mode]]]) +
        pick("mode","mode",MODES,v.mode,x=>x,"Mode"),
        "settings"
      )
    );
    const daemonCard = block(data.daemon, v =>
      card("Daemon",
        kv([["State",v.running?"Running":"Stopped"],["Interval",`${v.interval_seconds}s`]]),
        "activity"
      )
    );
    const iface = card("Interface",
      `<div class="setting-row">
        <div><strong>${simple?"Simple":"Advanced"}</strong><p>${simple?"Focused controls.":"Full diagnostics."}</p></div>
        <button class="btn btn-ghost btn-sm" data-act="toggle-mode">Use ${simple?"Advanced":"Simple"}</button>
      </div>`,
      "settings"
    );
    const maint = card("Maintenance",
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button class="btn btn-ghost btn-sm" data-act="scan">Run scan</button>
        <button class="btn btn-ghost btn-sm" data-act="capture">Capture baseline</button>
      </div>
      <p class="muted mt-6">${esc(BIN)}</p>`,
      "settings"
    );
    return `<div class="page-top"><div class="page-eyebrow">PREFERENCES</div><h2 class="page-h">Settings</h2></div>${iface}${modeCard}${daemonCard}${maint}`;
  }
};

function renderMore() {
  const grid = `<div class="more-grid">${
    [["Thermal","Thermal protection","thermometer"],["Scheduler","Uclamp controls","workflow"],["Network","TCP & interfaces","network"],["Settings","Mode & preferences","settings"]].map(([name,desc,icon]) =>
      `<button class="more-btn" data-page="${name}">
        <span class="more-icon">${SVG[icon]()}</span>
        <span class="more-text"><span class="more-name">${name}</span><span class="more-desc">${desc}</span></span>
        <span class="more-arrow">${SVG.chevronRight()}</span>
      </button>`
    ).join("")
  }</div>`;
  const iface = card("Interface",
    `<div class="setting-row">
      <div><strong>${simple?"Simple":"Advanced"}</strong><p>${simple?"Focused controls.":"Full diagnostics."}</p></div>
      <button class="btn btn-ghost btn-sm" data-act="toggle-mode">Use ${simple?"Advanced":"Simple"}</button>
    </div>`,
    "settings"
  );
  return `<div class="page-top"><div class="page-eyebrow">MORE</div><h2 class="page-h">Controls</h2></div>${grid}${iface}`;
}

/* ── Nav ─────────────────────────────────────────────────────────────── */
function renderNav() {
  const nav = document.getElementById("nav");
  nav.innerHTML = PAGES.map(p => {
    const active = p === page;
    const label = p === "Dashboard" ? "Home" : p;
    return `<button class="nav-btn${active?" active":""}" data-page="${p}" ${active?'aria-current="page"':""}>
      ${SVG[NAV_ICONS[p]]()}
      <span class="nav-label">${label}</span>
    </button>`;
  }).join("");
}

/* ── Render ──────────────────────────────────────────────────────────── */
function render() {
  const toastHtml = toast
    ? `<div class="toast ${toast.ok?"ok":"bad"}"><strong>${toast.ok?"Done":"Error"}</strong><span>${esc(toast.text??"")}</span><button class="btn btn-ghost btn-sm" data-act="dismiss">×</button></div>`
    : "";
  const changed = prevPage !== null && prevPage !== page;
  const update = () => {
    view.innerHTML = toastHtml + (page === "More" ? renderMore() : (VIEWS[page] ? VIEWS[page]() : ""));
    renderNav();
  };
  prevPage = page;
  if (changed && typeof document.startViewTransition === "function") {
    document.startViewTransition(update);
  } else {
    update();
    if (changed) {
      view.classList.remove("page-fallback-enter");
      void view.offsetWidth;
      view.classList.add("page-fallback-enter");
    }
  }
}

/* ── Event handlers ──────────────────────────────────────────────────── */
const perfCheck = (op, val, el) => {
  const item = op.startsWith("cpu")
    ? data.cpu?.value?.find(p => base(p.path) === el.dataset.id)
    : data.gpu?.value?.find(d => base(d.path) === el.dataset.id);
  if (!item) return false;
  if (op.endsWith("gov")) return /performance/i.test(val);
  const cur = op.endsWith("min") ? (item.scaling_min_freq??item.min_freq) : (item.scaling_max_freq??item.max_freq);
  return Number(val) > Number(cur);
};

document.addEventListener("change", e => {
  const el = e.target;
  const op = el.dataset?.op;
  if (!op || el.tagName !== "SELECT") return;
  const id = el.dataset.id, val = el.value;
  if (/^(cpu|gpu)-/.test(op)) return write(op, { id, value:val }, `Change ${id}`, [`${op} → ${val}`], perfCheck(op,val,el));
  if (op === "tcp") return write(op, { value:val }, "Change TCP", [`Algorithm → ${val}`]);
  if (op === "mode") return write(op, { value:val }, "Change mode", [`Mode → ${val}`, MODE_HELP[val]]);
});

document.addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.page) { page = btn.dataset.page; toast = null; return load(); }
  if (btn.id === "reload") return load();
  const act = btn.dataset.act, id = btn.dataset.id;
  const field = () => view.querySelector(`[data-op="${btn.dataset.op??"cooling"}"][data-id="${id}"]`);
  if (act === "dismiss") { toast = null; return render(); }
  if (act === "toggle-mode") { simple = !simple; localStorage.setItem("arch-simple-mode", simple?"simple":"advanced"); return render(); }
  if (act === "preview") return doPreview(id);
  if (act === "scan")    return simpleRun(["scan"],    "Run scan?",             "Refreshes the capability snapshot.");
  if (act === "capture") return simpleRun(["capture"], "Capture baseline?",     "Overwrites the stored baseline.", true);
  if (act === "restore") return simpleRun(["restore"], "Restore baseline?",     "Writes captured values back.", true);
  if (act === "core-offline") return write("core-offline", { id }, `Take ${id} offline?`, ["Reduces CPU capacity. CPU0 is protected."], false, true);
  if (act === "core-online")  return write("core-online",  { id }, `Bring ${id} online?`, ["Increases CPU capacity."], true);
  if (act === "cooling")  return write("cooling",  { id, value:field()?.value }, `Boost cooling ${id}?`, [`State → ${field()?.value}`]);
  if (act === "uclamp")   return write(btn.dataset.op, { id, value:field()?.value }, `Change ${id} uclamp`, [`${btn.dataset.op} → ${field()?.value}`], btn.dataset.op==="uclamp-min");
});

/* ── Boot ────────────────────────────────────────────────────────────── */
load();
