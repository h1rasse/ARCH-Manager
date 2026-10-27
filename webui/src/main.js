import { exec } from "kernelsu";
import { createIcons, Home, Cpu, Gauge, SlidersHorizontal, Ellipsis, Activity, RefreshCw, Thermometer, Workflow, Network, Settings, ArrowRight } from "lucide";
import "./styles.css";
import * as L from "./logic.js";

const { esc, base, words, nums } = L;
const PAGES = ["Dashboard", "CPU", "GPU", "Profiles", "More"];
const DETAIL_PAGES = ["Thermal", "Scheduler", "Network", "Settings"];
const SOURCES = {
  Dashboard: { status: ["status", "--json"], validate: ["validate", "--json"], check: ["thermal", "check"], mode: ["mode", "show"], profiles: ["profile", "list"], cpu: ["cpu", "list"], gpu: ["gpu", "list"] },
  CPU: { cpu: ["cpu", "list"], core: ["core", "list"] },
  GPU: { gpu: ["gpu", "list"] },
  Thermal: { check: ["thermal", "check"], zones: ["thermal", "list"], cooling: ["thermal", "cooling", "list"] },
  Scheduler: { sched: ["scheduler", "list"] },
  Network: { net: ["network", "list"], tcp: ["network", "tcp", "list"] },
  Profiles: { profiles: ["profile", "list"], cpu: ["cpu", "list"], gpu: ["gpu", "list"] },
  Settings: { mode: ["mode", "show"], daemon: ["daemon", "status"] }
};
const MODE_HELP = { auto: "Balanced while the screen is on, stock while off", performance: "Performance in both screen states", battery: "Battery mode while on, stock while off", strict: "Stock values in every state" };
const NAV_ICONS = { Dashboard: "home", CPU: "cpu", GPU: "gauge", Profiles: "sliders-horizontal", More: "ellipsis" };
const LUCIDE_ICONS = { Home, Cpu, Gauge, SlidersHorizontal, Ellipsis, Activity, RefreshCw, Thermometer, Workflow, Network, Settings, ArrowRight };

let page = "Dashboard";
let data = {};
let last = null;
let mock = null;
let chain = Promise.resolve();
let simpleMode = localStorage.getItem("arch-simple-mode") !== "advanced";
let renderedPage = null;

const view = document.querySelector("#view");
const dlg = document.querySelector("#dlg");

function run(args) {
  const job = chain.then(async () => {
    try {
      const line = L.buildCommand(args);
      const r = mock ? await mock(line) : await exec(line);
      return { errno: r.errno ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    } catch (error) {
      return { errno: -1, stdout: "", stderr: `KernelSU API error: ${error?.message ?? error}` };
    }
  });
  chain = job.catch(() => {});
  return job;
}

async function getJson(args) {
  const r = await run(args);
  const parsed = L.parseJson(r.stdout);
  if (parsed.ok && (r.errno === 0 || args[0] === "validate")) return { ok: true, value: parsed.value, errno: r.errno };
  const info = r.errno === 0 ? { label: "Invalid output", detail: parsed.error } : L.classify(r);
  return { ok: false, error: info };
}

async function load() {
  const current = page;
  data = {};
  render();
  if (current === "More") return;
  const entries = Object.entries(SOURCES[current] ?? {});
  const results = await Promise.all(entries.map(([, args]) => getJson(args)));
  if (page !== current) return;
  entries.forEach(([key], i) => (data[key] = results[i]));
  render();
}

function known() {
  const val = (r) => (r?.ok ? r.value : []);
  const out = { cpu: {}, gpu: {}, cooling: {}, tcp: [], profiles: [] };
  for (const p of val(data.cpu)) out.cpu[base(p.path)] = { gov: words(p.available_governors), freq: words(p.available_frequencies) };
  for (const d of val(data.gpu)) out.gpu[base(d.path)] = { gov: words(d.available_governors), freq: words(d.available_frequencies) };
  for (const c of val(data.cooling)) out.cooling[base(c.path)] = c;
  out.tcp = words(data.tcp?.value?.available);
  out.profiles = val(data.profiles).map((p) => p.name);
  return out;
}

function ask(title, lines, danger = false) {
  document.querySelector("#dt").textContent = title;
  document.querySelector("#db").innerHTML = lines.filter(Boolean).map((line) => `<p>${line}</p>`).join("");
  const yes = document.querySelector("#yes");
  yes.className = danger ? "danger" : "";
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => resolve(dlg.returnValue === "yes"), { once: true });
    yes.onclick = () => dlg.close("yes");
    document.querySelector("#no").onclick = () => dlg.close("no");
    dlg.showModal();
  });
}

async function thermalNote() {
  const t = await getJson(["thermal", "check"]);
  if (!t.ok) return { text: `Thermal check failed: ${esc(t.error.detail)}`, unsafe: true };
  const v = t.value;
  return { text: `Thermal check: ${L.fmtTemp(v.hottest_millicelsius)} · limit ${L.fmtTemp(v.limit_millicelsius)} · ${v.safe_for_performance_increase ? "safe" : "<b>unsafe for performance increase</b>"}`, unsafe: !v.safe_for_performance_increase };
}

async function write(op, a, title, lines, increase = false, danger = false) {
  let args;
  try {
    args = L.writeArgs(op, a, known());
  } catch (error) {
    last = { ok: false, text: error.message };
    return render();
  }
  const note = increase ? await thermalNote() : null;
  const confirmed = await ask(title, [...lines.map(esc), note?.text, `<code>archctl ${args.join(" ")}</code>`], danger || note?.unsafe);
  if (!confirmed) return render();
  const result = await run(args);
  last = result.errno === 0 ? { ok: true, text: result.stdout.trim(), warn: result.stderr.trim() } : { ok: false, text: L.classify(result).label, warn: L.classify(result).detail };
  await load();
}

const badge = (text, tone = "info") => `<span class="b ${tone}">${esc(text)}</span>`;
const kv = (rows) => `<dl>${rows.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value ?? "n/a")}</dd>`).join("")}</dl>`;
const card = (title, body, right = "") => `<section class="card"><div class="row"><h3>${esc(title)}</h3>${right}</div>${body}</section>`;
const fail = (result) => `<section class="card err"><h3>${esc(result.error.label)}</h3><details><summary>Show details</summary><pre>${esc(result.error.detail)}</pre></details></section>`;
const empty = (text) => `<p class="muted">${esc(text)}</p>`;

function block(result, fn) {
  if (!result) return `<p class="muted loading">Loading...</p>`;
  return result.ok ? fn(result.value) : fail(result);
}

function pick(op, id, options, current, fmt = (value) => value, label = "") {
  if (!options.length) return `<p class="muted">${esc(label)} unavailable</p>`;
  const list = options.includes(String(current)) ? options : [String(current), ...options];
  return `<label>${esc(label)}<select data-op="${op}" data-id="${esc(id)}">${list.map((option) => `<option value="${esc(option)}"${option === String(current) ? " selected" : ""}>${esc(fmt(option))}</option>`).join("")}</select></label>`;
}

function devCard(kind, item, index = 0, count = 1) {
  const id = base(item.path);
  const cpu = kind === "cpu";
  const fmt = cpu ? L.fmtKhz : L.fmtHz;
  const governors = words(item.available_governors);
  const frequencies = nums(item.available_frequencies).map(String);
  const current = cpu ? [item.scaling_governor, item.scaling_min_freq, item.scaling_max_freq] : [item.governor, item.min_freq, item.max_freq];
  const title = cpu ? L.cpuLabel(item) : L.gpuLabel(index, count);
  const subtitle = cpu ? L.cpuCores(item) : L.gpuBackendLabel(item.backend);
  const governorDetails = cpu
    ? ["Available governors", governors.join(", ") || "n/a"]
    : ["Active governor", current[0] || "n/a"];
  const details = cpu
    ? kv([["Current frequency", fmt(item.scaling_cur_freq)], ["Available governors", governors.join(", ") || "n/a"], ["Frequency table", frequencies.map(fmt).join(", ") || "n/a"], ["Hardware identifier", id], ["Kernel path", item.path]])
    : kv([["Backend", L.gpuBackendLabel(item.backend)], ["Device identifier", item.name ?? id], governorDetails, ["Frequency table", frequencies.map(fmt).join(", ") || "n/a"], ["Kernel path", item.path]]);
  return `<section class="tune-card card"><div class="tune-head"><div><span class="eyebrow">${cpu ? "CPU PERFORMANCE" : "GRAPHICS PROCESSOR"}</span><h3>${esc(title)}</h3><p class="muted">${esc(subtitle)}</p>${cpu ? "" : `<p class="muted active-governor">Active governor · <strong>${esc(current[0] || "n/a")}</strong></p>`}</div>${badge(cpu ? "CPU" : "GPU", "info")}</div><div class="metric-line"><strong>${esc(fmt(cpu ? item.scaling_cur_freq : item.cur_freq))}</strong><span class="muted">current frequency</span></div><div class="ctl">${pick(`${kind}-gov`, id, governors, current[0], (value) => value, "Governor")}${pick(`${kind}-min`, id, frequencies, current[1], fmt, "Minimum")}${pick(`${kind}-max`, id, frequencies, current[2], fmt, "Maximum")}</div><details class="advanced"><summary>Advanced details</summary>${details}</details></section>`;
}

function thermalBanner() {
  const result = data.check;
  if (!result?.ok) return result ? fail(result) : "";
  const value = result.value;
  const safe = value.safe_for_performance_increase;
  const hasThermalValues = value.limit_millicelsius != null && value.hottest_millicelsius != null;
  const headroom = hasThermalValues && Number.isFinite(Number(value.limit_millicelsius)) && Number.isFinite(Number(value.hottest_millicelsius))
    ? L.fmtTemp(Number(value.limit_millicelsius) - Number(value.hottest_millicelsius))
    : "n/a";
  return `<section class="thermal-hero ${safe ? "safe" : "unsafe"}"><div class="thermal-orb"><span>${esc(L.fmtTemp(value.hottest_millicelsius))}</span><small>PEAK TEMP</small></div><div class="thermal-copy"><span class="eyebrow">THERMAL SAFETY</span><h2>${safe ? "Within safe range" : "Thermal guard active"}</h2><p>${safe ? "There is room for guarded performance increases." : "Performance increases are blocked until the device cools."}</p><div class="thermal-facts"><div><span>Guard limit</span><strong>${esc(L.fmtTemp(value.limit_millicelsius))}</strong></div><div><span>Headroom</span><strong>${esc(headroom)}</strong></div></div></div></section>`;
}

function profileCard(profile, compact = false) {
  const tone = { performance: "violet", balanced: "blue", battery: "green", stock: "slate", gaming: "pink" }[profile.name] ?? "blue";
  return `<article class="profile-card ${tone}${compact ? " compact" : ""}"><div><span class="eyebrow">PROFILE</span><h3>${esc(profile.name)}</h3><p>${esc(profile.description ?? "Kernel tuning profile")}</p></div><button data-act="preview" data-id="${esc(profile.name)}">Apply</button></article>`;
}

const views = {
  Dashboard() {
    const status = block(data.status, (value) => {
      const device = value.device ?? {};
      const cpu = value.cpu_policies ?? [];
      const gpu = value.devfreq_devices ?? [];
      const cpuSummary = cpu.map((item) => `<div class="summary-row"><span>${esc(L.cpuLabel(item))} · ${esc(L.cpuCores(item))}</span><strong>${esc(L.fmtKhz(item.scaling_cur_freq))}</strong><small>Active governor <b>${esc(item.scaling_governor ?? "n/a")}</b></small></div>`).join("");
      const gpuSummary = gpu.map((item, index) => `<div class="summary-row"><span>${esc(L.gpuLabel(index, gpu.length))} · ${esc(L.gpuBackendLabel(item.backend))}</span><strong>${esc(L.fmtHz(item.cur_freq))}</strong><small>Active governor <b>${esc(item.governor ?? "n/a")}</b></small></div>`).join("");
      return `<div class="welcome"><div><span class="eyebrow">SYSTEM OVERVIEW</span><h2>${esc(device.machine ?? device.soc_id ?? "Device ready")}</h2><p>${esc(device.android_version ?? "Android")} · Current kernel readings</p></div><span class="live-dot">READY</span></div><div class="summary-grid"><section class="card summary-card"><div class="section-title"><span><i data-lucide="cpu" aria-hidden="true"></i> CPU</span>${badge(`${cpu.length} ${cpu.length === 1 ? "policy" : "policies"}`, "info")}</div>${cpuSummary || empty("No CPU frequency data is available.")}</section><section class="card summary-card"><div class="section-title"><span><i data-lucide="gauge" aria-hidden="true"></i> GPU</span>${badge(`${gpu.length} ${gpu.length === 1 ? "device" : "devices"}`, "info")}</div>${gpuSummary || empty("No GPU frequency data is available.")}</section></div>`;
    });
    const mode = block(data.mode, (value) => `<section class="mode-card"><span class="mode-icon"><i data-lucide="sliders-horizontal" aria-hidden="true"></i></span><div class="mode-copy"><span class="eyebrow">PERFORMANCE MODE</span><h3>${esc((value.mode ?? "unknown").replace(/^./, (letter) => letter.toUpperCase()))}</h3><p>${esc(MODE_HELP[value.mode] ?? "Mode status reported by ARCH Manager.")}</p></div><div class="mode-state">${badge(`Screen ${value.screen_state ?? "unknown"}`, "info")}<button class="mode-link" data-page="Settings" aria-label="Open performance mode settings"><i data-lucide="arrow-right" aria-hidden="true"></i></button></div></section>`);
    const profiles = block(data.profiles, (list) => `<div class="section-title"><h2>Quick profiles</h2><button class="text-button" data-page="Profiles">View all</button></div><div class="profile-stack">${list.slice(0, 3).map((profile) => profileCard(profile, true)).join("")}</div>`);
    const validation = block(data.validate, (report) => `<div class="status-strip ${report.passed ? "ok" : "bad"}"><span>${report.passed ? "✓" : "!"}</span><div><strong>${report.passed ? "System ready" : "Validation needs attention"}</strong><small>${report.checks?.filter((check) => check.status === "pass").length ?? 0} checks passed</small></div></div>`);
    return thermalBanner() + status + mode + profiles + validation;
  },
  CPU() {
    const cpu = block(data.cpu, (value) => value.length ? value.map((item) => devCard("cpu", item)).join("") : empty("No CPU policies found."));
    const core = block(data.core, (cores) => {
      const online = cores.filter((coreItem) => coreItem.online).length;
      const rows = [...cores].sort((a, b) => a.cpu - b.cpu).map((coreItem) => {
        const can = coreItem.writable && coreItem.online_node;
        const off = can && coreItem.cpu !== 0 && coreItem.online && online > 1;
        const on = can && !coreItem.online;
        return `<div class="core"><b>CPU${coreItem.cpu}</b>${badge(coreItem.online ? "online" : "offline", coreItem.online ? "ok" : "warn")}${off ? `<button class="ghost" data-act="core-offline" data-id="cpu${coreItem.cpu}">Offline</button>` : ""}${on ? `<button class="ghost" data-act="core-online" data-id="cpu${coreItem.cpu}">Online</button>` : ""}</div>`;
      });
      return simpleMode ? `<details class="advanced card"><summary>Core control</summary>${rows.join("") || empty("No cores reported.")}</details>` : card("Core control", rows.join("") || empty("No cores reported."));
    });
    return `<div class="page-intro"><span class="eyebrow">PROCESSOR</span><h2>CPU control</h2><p>Tune each performance policy with safe frequency tables.</p></div>${cpu}${core}`;
  },
  GPU: () => `<div class="page-intro"><span class="eyebrow">GRAPHICS</span><h2>GPU control</h2><p>Manage graphics frequency and governor targets.</p></div>${block(data.gpu, (value) => value.length ? value.map((item, index) => devCard("gpu", item, index, value.length)).join("") : empty("No Devfreq devices found."))}`,
  Profiles: () => `<div class="page-intro"><span class="eyebrow">TUNING</span><h2>Performance profiles</h2><p>Choose a safe preset for the way you use your device.</p></div>${block(data.profiles, (list) => (list.map((profile) => profileCard(profile)).join("") || empty("No profiles available.")) + `<section class="card restore-card"><div><span class="eyebrow">SAFETY NET</span><h3>Restore baseline</h3><p>Return captured kernel values to their original state.</p></div><button class="danger" data-act="restore">Restore</button></section>`)}`,
  Thermal() {
    const zones = block(data.zones, (value) => value.length ? value.map((zone) => `<details class="card advanced"><summary>${esc(zone.zone_type || base(zone.path))}<span>${esc(L.fmtTemp(zone.temperature_millicelsius))}</span></summary>${kv([["Zone", base(zone.path)], ["Temperature", L.fmtTemp(zone.temperature_millicelsius)], ["Critical trip", L.fmtTemp(zone.critical_trip_millicelsius)]])}</details>`).join("") : empty("No thermal zones found."));
    const cooling = block(data.cooling, (value) => value.length ? value.map((item) => card(base(item.path), kv([["Type", item.device_type], ["Current / max", `${item.current_state ?? "n/a"} / ${item.max_state ?? "n/a"}`]]) + `<p class="muted">${item.writable?.length ? "Cooling boost is available." : "Read-only cooling device."}</p>`)).join("") : empty("No cooling devices found."));
    return `<div class="page-intro"><span class="eyebrow">PROTECTION</span><h2>Thermal management</h2><p>Temperature protection is always active before performance increases.</p></div>${thermalBanner()}${zones}<h2 class="subheading">Cooling devices</h2>${cooling}`;
  },
  Scheduler: () => block(data.sched, (value) => `<div class="page-intro"><span class="eyebrow">SYSTEM</span><h2>Scheduler</h2><p>Adjust uclamp limits for supported task groups.</p></div>${L.GROUPS.map((group) => { const nodes = (value.uclamp ?? []).filter((item) => item.group === group); return nodes.length ? card(group, nodes.map((node) => `<label>${esc(node.attribute)}<input type="number" min="0" max="1024" value="${esc(node.value)}" data-op="${node.attribute.endsWith("min") ? "uclamp-min" : "uclamp-max"}" data-id="${group}" ${node.writable ? "" : "disabled"}></label><button data-act="uclamp" data-op="${node.attribute.endsWith("min") ? "uclamp-min" : "uclamp-max"}" data-id="${group}">Apply</button>`).join("")) : ""}).join("") || empty("No uclamp interface exposed.")}`),
  Network() {
    const tcp = block(data.tcp, (value) => card("TCP congestion", kv([["Current", value.current], ["Allowed", value.allowed]]) + (value.writable ? pick("tcp", "tcp", words(value.available), value.current, (item) => item, "Algorithm") : badge("read-only", "warn"))));
    const network = block(data.net, (value) => {
      if (simpleMode) return empty(`${value.length} network interface${value.length === 1 ? "" : "s"} detected.`);
      return value.map((item) => card(item.name, kv([["State", item.operstate], ["Carrier", item.carrier], ["MTU", item.mtu], ["Speed", item.speed], ["Duplex", item.duplex], ["MAC", item.address], ["TX queue", item.tx_queue_len]]))).join("");
    });
    return `<div class="page-intro"><span class="eyebrow">CONNECTIVITY</span><h2>Network</h2><p>Inspect TCP behavior and interface state.</p></div>${tcp}${network}`;
  },
  Settings() {
    const mode = block(data.mode, (value) => card("Adaptive mode", kv([["Current", value.mode], ["Screen", value.screen_state], ["Behavior", MODE_HELP[value.mode]]]) + pick("mode", "mode", L.MODES, value.mode, (item) => item, "Mode")));
    const daemon = block(data.daemon, (value) => card("Adaptive daemon", kv([["State", value.running ? "Running" : "Not running"], ["Interval", `${value.interval_seconds}s`]]) + `<p class="muted">Start the foreground daemon from a root shell when needed.</p>`));
    return `<div class="page-intro"><span class="eyebrow">PREFERENCES</span><h2>Settings</h2><p>Control interface behavior and adaptive mode.</p></div>${card("Interface", `<div class="setting-row"><div><strong>${simpleMode ? "Simple mode" : "Advanced mode"}</strong><p class="muted">${simpleMode ? "Focused controls and essential status." : "All diagnostics and kernel details."}</p></div><button class="ghost" data-act="toggle-mode">Use ${simpleMode ? "Advanced" : "Simple"}</button></div>`)}${mode}${daemon}${card("Maintenance", `<div class="ctl"><button data-act="scan">Run scan</button><button data-act="capture">Capture baseline</button></div><p class="muted">Binary: ${esc(L.BIN)}</p>`)}`;
  }
};

function renderMore() {
  const items = [
    ["Thermal", "Temperature protection and cooling devices", "thermometer"],
    ["Scheduler", "Uclamp task priority controls", "workflow"],
    ["Network", "TCP congestion and interfaces", "network"],
    ["Settings", "Adaptive mode and interface preferences", "settings"]
  ];
  return `<div class="page-intro"><span class="eyebrow">ARCH MANAGER</span><h2>More controls</h2><p>Advanced tools are grouped here to keep the main dashboard focused.</p></div><div class="more-grid">${items.map(([name, description, icon]) => `<button class="more-card" data-page="${name}"><span class="more-icon"><i data-lucide="${icon}" aria-hidden="true"></i></span><span><strong>${name}</strong><small>${description}</small></span><i class="more-arrow" data-lucide="arrow-right" aria-hidden="true"></i></button>`).join("")}</div>${card("Interface mode", `<div class="setting-row"><div><strong>${simpleMode ? "Simple mode" : "Advanced mode"}</strong><p class="muted">Switch between focused controls and full diagnostics.</p></div><button class="ghost" data-act="toggle-mode">Use ${simpleMode ? "Advanced" : "Simple"}</button></div>`)}`;
}
function renderNav() {
  document.querySelector("#nav").innerHTML = PAGES.map((item) => `<button class="nav-item ${item === page ? "on" : ""}" data-page="${item}" ${item === page ? 'aria-current="page"' : ""}><i class="nav-icon" data-lucide="${NAV_ICONS[item]}" aria-hidden="true"></i><span>${item === "Dashboard" ? "Home" : item}</span></button>`).join("");
}

function render() {
  const result = last ? `<div class="toast ${last.ok ? "ok" : "bad"}"><strong>${last.ok ? "Done" : "Unable to update"}</strong><span>${esc(last.text ?? "")}</span><button class="ghost" data-act="dismiss">×</button></div>` : "";
  const pageChanged = renderedPage !== null && renderedPage !== page;
  const update = () => {
    view.innerHTML = result + (page === "More" ? renderMore() : views[page]());
    renderNav();
    createIcons({ icons: LUCIDE_ICONS, attrs: { "stroke-width": 1.8 } });
  };
  renderedPage = page;
  if (pageChanged && typeof document.startViewTransition === "function") {
    document.startViewTransition(update);
  } else {
    update();
    if (pageChanged) {
      view.classList.remove("page-fallback-enter");
      void view.offsetWidth;
      view.classList.add("page-fallback-enter");
    }
  }
}

async function preview(name) {
  let args;
  try {
    args = L.previewArgs(name, known());
  } catch (error) {
    last = { ok: false, text: error.message };
    return render();
  }
  const result = await run(args);
  if (result.errno !== 0) {
    last = { ok: false, text: L.classify(result).label, warn: L.classify(result).detail };
    return render();
  }
  const dry = L.parseDryRun(result.stdout, result.stderr);
  const cpu = data.cpu?.ok ? data.cpu.value : [];
  const gpu = data.gpu?.ok ? data.gpu.value : [];
  let raises = false;
  const rows = dry.changes.map((change) => {
    const current = L.currentValue(change, cpu, gpu);
    const up = L.raisesPerformance(change, current.old);
    raises ||= up;
    return `<tr><td>${esc(current.node || `${change.kind} ${change.name}`)}</td><td>${esc(current.old ?? "n/a")}</td><td>${esc(change.value)}</td></tr>`;
  });
  const table = rows.length ? `<table><tr><th>Node</th><th>Old</th><th>New</th></tr>${rows.join("")}</table>` : esc(dry.restore ? "Restores the captured baseline." : "No changes planned.");
  const note = raises ? await thermalNote() : null;
  if (!(await ask(`Apply ${name}?`, [table, note?.text], raises && note?.unsafe))) return;
  let applyArgs;
  try {
    applyArgs = L.writeArgs("profile", { value: name }, known());
  } catch (error) {
    last = { ok: false, text: error.message };
    return render();
  }
  const done = await run(applyArgs);
  last = done.errno === 0 ? { ok: true, text: done.stdout.trim(), warn: done.stderr.trim() } : { ok: false, text: L.classify(done).label, warn: L.classify(done).detail };
  await load();
}

async function simple(args, title, text, danger = false) {
  if (!(await ask(title, [esc(text), `<code>archctl ${args.join(" ")}</code>`], danger))) return;
  const result = await run(args);
  last = result.errno === 0 ? { ok: true, text: result.stdout.trim(), warn: result.stderr.trim() } : { ok: false, text: L.classify(result).label, warn: L.classify(result).detail };
  await load();
}

const PERF = (op, value, element) => {
  const item = op.startsWith("cpu") ? data.cpu?.value?.find((policy) => base(policy.path) === element.dataset.id) : data.gpu?.value?.find((device) => base(device.path) === element.dataset.id);
  if (!item) return false;
  if (op.endsWith("gov")) return /performance/i.test(value);
  const current = op.endsWith("min") ? (item.scaling_min_freq ?? item.min_freq) : (item.scaling_max_freq ?? item.max_freq);
  return Number(value) > Number(current);
};

document.addEventListener("change", (event) => {
  const element = event.target;
  const op = element.dataset?.op;
  if (!op || element.tagName !== "SELECT") return;
  const id = element.dataset.id;
  const value = element.value;
  if (/^(cpu|gpu)-/.test(op)) return write(op, { id, value }, `Change ${id}`, [`${op} → ${value}`], PERF(op, value, element));
  if (op === "cooling") return;
  if (op === "tcp") return write(op, { value }, "Change TCP congestion", [`Algorithm → ${value}`]);
  if (op === "mode") return write(op, { value }, "Change adaptive mode", [`Mode → ${value}`, MODE_HELP[value]]);
});

document.addEventListener("click", (event) => {
  const element = event.target.closest("button");
  if (!element) return;
  if (element.dataset.page) {
    page = element.dataset.page;
    last = null;
    return load();
  }
  if (element.id === "reload") return load();
  const action = element.dataset.act;
  const id = element.dataset.id;
  const field = () => view.querySelector(`[data-op="${element.dataset.op ?? "cooling"}"][data-id="${id}"]`);
  if (action === "dismiss") { last = null; return render(); }
  if (action === "toggle-mode") {
    simpleMode = !simpleMode;
    localStorage.setItem("arch-simple-mode", simpleMode ? "simple" : "advanced");
    return render();
  }
  if (action === "preview") return preview(id);
  if (action === "scan") return simple(["scan"], "Run capability scan?", "Refreshes the capability snapshot without changing kernel values.");
  if (action === "capture") return simple(["capture"], "Capture baseline?", "Overwrites the stored baseline with current kernel values.", true);
  if (action === "restore") return simple(["restore"], "Restore baseline?", "Writes captured values back to the kernel.", true);
  if (action === "core-offline") return write("core-offline", { id }, `Take ${id} offline?`, ["Reduces available CPU capacity. CPU0 and the last online core are protected."], false, true);
  if (action === "core-online") return write("core-online", { id }, `Bring ${id} online?`, ["Increases CPU capacity."], true);
  if (action === "cooling") return write("cooling", { id, value: field()?.value }, `Boost cooling on ${id}?`, [`Raises cooling state to ${field()?.value}.`]);
  if (action === "uclamp") return write(element.dataset.op, { id, value: field()?.value }, `Change ${id} uclamp`, [`${element.dataset.op} → ${field()?.value}`], element.dataset.op === "uclamp-min");
});

async function boot() {
  if (import.meta.env.VITE_MOCK === "1") mock = (await import("./mock.js")).mockExec;
  load();
}

boot();
