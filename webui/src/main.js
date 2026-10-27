import { exec } from "kernelsu";
import "./styles.css";
import * as L from "./logic.js";

const { esc, base, words, nums } = L;
const PAGES = ["Dashboard", "CPU", "GPU", "Thermal", "Scheduler", "Network", "Profiles", "Settings"];
const SOURCES = {
  Dashboard: { status: ["status", "--json"], validate: ["validate", "--json"], check: ["thermal", "check"] },
  CPU: { cpu: ["cpu", "list"], core: ["core", "list"] },
  GPU: { gpu: ["gpu", "list"] },
  Thermal: { check: ["thermal", "check"], zones: ["thermal", "list"], cooling: ["thermal", "cooling", "list"] },
  Scheduler: { sched: ["scheduler", "list"] },
  Network: { net: ["network", "list"], tcp: ["network", "tcp", "list"] },
  Profiles: { profiles: ["profile", "list"], cpu: ["cpu", "list"], gpu: ["gpu", "list"] },
  Settings: { mode: ["mode", "show"], daemon: ["daemon", "status"] }
};
const MODE_HELP = { auto: "balanced when screen is on, stock when off", performance: "performance in both screen states", battery: "battery when on, stock when off", strict: "stock in every state" };

let page = "Dashboard";
let data = {};
let last = null;
let mock = null;
let chain = Promise.resolve();

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
  const entries = Object.entries(SOURCES[current]);
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
  document.querySelector("#db").innerHTML = lines.filter(Boolean).map((l) => `<p>${l}</p>`).join("");
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
  return { text: `Thermal check: hottest ${L.fmtTemp(v.hottest_millicelsius)}, limit ${L.fmtTemp(v.limit_millicelsius)} - ${v.safe_for_performance_increase ? "safe" : "<b>UNSAFE for performance increase</b>"}`, unsafe: !v.safe_for_performance_increase };
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
  const yes = await ask(title, [...lines.map(esc), note?.text, `<code>archctl ${args.join(" ")}</code>`], danger || note?.unsafe);
  if (!yes) return render();
  const r = await run(args);
  last = r.errno === 0 ? { ok: true, text: r.stdout.trim(), warn: r.stderr.trim() } : { ok: false, text: L.classify(r).label, warn: L.classify(r).detail };
  await load();
}

const badge = (text, tone = "info") => `<span class="b ${tone}">${esc(text)}</span>`;
const kv = (rows) => `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v ?? "n/a")}</dd>`).join("")}</dl>`;
const card = (title, body, right = "") => `<section class="card"><div class="row"><h3>${esc(title)}</h3>${right}</div>${body}</section>`;
const fail = (r) => `<section class="card err"><h3>${esc(r.error.label)}</h3><pre>${esc(r.error.detail)}</pre></section>`;
const empty = (text) => `<p class="muted">${esc(text)}</p>`;

function block(result, fn) {
  if (!result) return `<p class="muted">Loading...</p>`;
  return result.ok ? fn(result.value) : fail(result);
}

function pick(op, id, options, current, fmt = (v) => v, label = "") {
  if (!options.length) return `<p class="muted">${esc(label)}: no table exposed</p>`;
  const list = options.includes(String(current)) ? options : [String(current), ...options];
  return `<label>${esc(label)}<select data-op="${op}" data-id="${esc(id)}">${list.map((o) => `<option value="${esc(o)}"${o === String(current) ? " selected" : ""}>${esc(fmt(o))}</option>`).join("")}</select></label>`;
}

function devCard(kind, item) {
  const id = base(item.path);
  const cpu = kind === "cpu";
  const fmt = cpu ? L.fmtKhz : L.fmtHz;
  const gov = words(item.available_governors);
  const freq = nums(item.available_frequencies).map(String);
  const rows = cpu
    ? [["Affected CPUs", item.affected_cpus], ["Governor", item.scaling_governor], ["Current", fmt(item.scaling_cur_freq)], ["Min / Max", `${fmt(item.scaling_min_freq)} / ${fmt(item.scaling_max_freq)}`], ["Table", freq.map(fmt).join(", ") || "n/a"]]
    : [["Backend", item.backend], ["Governor", item.governor], ["Current", fmt(item.cur_freq)], ["Min / Max", `${fmt(item.min_freq)} / ${fmt(item.max_freq)}`], ["Governors", gov.join(", ") || "n/a"]];
  const cur = cpu ? [item.scaling_governor, item.scaling_min_freq, item.scaling_max_freq] : [item.governor, item.min_freq, item.max_freq];
  return card(id, kv(rows) + `<div class="ctl">${pick(`${kind}-gov`, id, gov, cur[0], (v) => v, "Governor")}${pick(`${kind}-min`, id, freq, cur[1], fmt, "Minimum")}${pick(`${kind}-max`, id, freq, cur[2], fmt, "Maximum")}</div>`, badge(cpu ? "cpufreq" : "devfreq"));
}

const views = {
  Dashboard() {
    const s = block(data.status, (v) => {
      const d = v.device ?? {};
      const govs = (xs, key) => [...new Set((xs ?? []).map((x) => x[key]).filter(Boolean))].join(", ") || "n/a";
      return card("System", kv([["Kernel", d.kernel_release], ["Machine", d.machine ?? d.soc_id], ["Android", d.android_version], ["CPU policies", v.cpu_policies?.length ?? 0], ["CPU cores", v.cores?.length ?? 0], ["GPU / Devfreq", v.devfreq_devices?.length ?? 0], ["Thermal zones", v.thermal_zones?.length ?? 0], ["Network interfaces", v.network?.interfaces?.length ?? 0], ["CPU governor", govs(v.cpu_policies, "scaling_governor")], ["GPU governor", govs(v.devfreq_devices, "governor")], ["TCP congestion", v.network?.tcp?.current], ["Snapshot", v.generated_at ? new Date(v.generated_at * 1000).toLocaleString() : "n/a"]]));
    });
    const v = block(data.validate, (r) => card("Validation", `<ul class="checks">${r.checks.map((c) => `<li>${badge(c.status, { pass: "ok", warn: "warn", fail: "bad" }[c.status] ?? "info")} <b>${esc(c.name)}</b> <span class="muted">${esc(c.detail)}</span></li>`).join("")}</ul>`, badge(r.passed ? "passed" : "failed", r.passed ? "ok" : "bad")));
    const hint = data.status && !data.status.ok ? card("No snapshot yet", `<p>Run a capability scan to create the status snapshot.</p><button data-act="scan">Run scan</button>`) : "";
    return thermalBanner() + s + hint + v;
  },
  CPU() {
    const cpu = block(data.cpu, (v) => (v.length ? v.map((p) => devCard("cpu", p)).join("") : empty("No CPU policies found.")));
    const core = block(data.core, (cores) => {
      const online = cores.filter((c) => c.online).length;
      const items = [...cores].sort((a, b) => a.cpu - b.cpu).map((c) => {
        const can = c.writable && c.online_node;
        const off = can && c.cpu !== 0 && c.online && online > 1;
        const on = can && !c.online;
        return `<div class="core"><b>CPU${c.cpu}</b>${badge(c.online ? "online" : "offline", c.online ? "ok" : "warn")}${off ? `<button class="ghost" data-act="core-offline" data-id="cpu${c.cpu}">Offline</button>` : ""}${on ? `<button class="ghost" data-act="core-online" data-id="cpu${c.cpu}">Online</button>` : ""}</div>`;
      });
      return card("Core control", items.join("") || empty("No cores reported."));
    });
    return cpu + core;
  },
  GPU: () => block(data.gpu, (v) => (v.length ? v.map((d) => devCard("gpu", d)).join("") : empty("No Devfreq devices found."))),
  Thermal() {
    const zones = block(data.zones, (v) => (v.length ? v.map((z) => card(z.zone_type || base(z.path), kv([["Zone", base(z.path)], ["Temperature", L.fmtTemp(z.temperature_millicelsius)], ["Critical trip", L.fmtTemp(z.critical_trip_millicelsius)]]))).join("") : empty("No thermal zones found.")));
    const cool = block(data.cooling, (v) => (v.length ? v.map((c) => {
      const states = [];
      for (let s = (c.current_state ?? 0) + 1; s <= (c.max_state ?? 0); s++) states.push(String(s));
      const id = base(c.path);
      return card(id, kv([["Type", c.device_type], ["Current / Max", `${c.current_state ?? "n/a"} / ${c.max_state ?? "n/a"}`]]) + (c.writable?.length && states.length ? pick("cooling", id, states, states[0], (x) => `State ${x}`, "Boost to") + `<button data-act="cooling" data-id="${esc(id)}">Boost cooling</button>` : `<p class="muted">No higher state available or not writable.</p>`));
    }).join("") : empty("No cooling devices found.")));
    return thermalBanner() + zones + `<h2>Cooling devices</h2>` + cool;
  },
  Scheduler: () => block(data.sched, (v) => {
    const map = new Map();
    for (const n of v.uclamp ?? []) {
      const key = `${n.group}/${n.attribute}`;
      if (!map.has(key) || (n.writable && !map.get(key).writable)) map.set(key, n);
    }
    const out = L.GROUPS.map((g) => {
      const min = map.get(`${g}/cpu.uclamp.min`);
      const max = map.get(`${g}/cpu.uclamp.max`);
      if (!min && !max) return "";
      const field = (n, op) => (n ? `<label>${op === "uclamp-min" ? "uclamp min" : "uclamp max"} (${esc(n.value)})<input type="number" inputmode="numeric" min="0" max="1024" step="1" value="${esc(n.value)}" data-op="${op}" data-id="${g}" ${n.writable ? "" : "disabled"}></label>${n.writable ? `<button data-act="uclamp" data-op="${op}" data-id="${g}">Apply</button>` : badge("read-only", "warn")}` : "");
      return card(g, `<div class="ctl">${field(min, "uclamp-min")}${field(max, "uclamp-max")}</div>`);
    }).join("");
    return (out || empty("No uclamp interface exposed.")) + `<p class="muted">schedtune nodes: ${(v.schedtune ?? []).length} (discovery only)</p>`;
  }),
  Network() {
    const ifs = block(data.net, (v) => (v.length ? v.map((n) => card(n.name, kv([["State", n.operstate], ["Carrier", n.carrier], ["MTU", n.mtu], ["Speed", n.speed], ["Duplex", n.duplex], ["MAC", n.address], ["TX queue", n.tx_queue_len]]), badge(n.operstate ?? "unknown", n.operstate === "up" ? "ok" : "info"))).join("") : empty("No interfaces found.")));
    const tcp = block(data.tcp, (t) => card("TCP congestion", kv([["Current", t.current], ["Available", t.available], ["Allowed", t.allowed]]) + (t.writable ? pick("tcp", "tcp", words(t.available), t.current, (v) => v, "Algorithm") : badge("read-only", "warn"))));
    return tcp + ifs;
  },
  Profiles: () => block(data.profiles, (list) => {
    const body = list.map((p) => card(p.name, `<p>${esc(p.description)}</p><button data-act="preview" data-id="${esc(p.name)}">Preview and apply</button>`, badge(["stock", "balanced", "battery", "performance", "gaming"].includes(p.name) ? "built-in" : "custom"))).join("");
    return (body || empty("No profiles.")) + card("Restore", `<p>Restore all values captured in the baseline.</p><button class="danger" data-act="restore">Restore baseline</button>`);
  }),
  Settings() {
    const mode = block(data.mode, (m) => card("Adaptive mode", kv([["Current", m.mode], ["Screen", m.screen_state], ["Behavior", MODE_HELP[m.mode]]]) + pick("mode", "mode", L.MODES, m.mode, (v) => v, "Mode") + `<p class="muted">${L.MODES.map((x) => `${x}: ${MODE_HELP[x]}`).map(esc).join("<br>")}</p>`));
    const daemon = block(data.daemon, (d) => card("Adaptive daemon", kv([["State", d.running ? "lock present (running)" : "not running"], ["Interval", `${d.interval_seconds}s`]]) + `<p class="muted">The daemon runs in the foreground and is not started from the WebUI. Start it from a root shell: <code>archctl daemon run 8</code>. The state is inferred from a lock file and can be stale after a crash.</p>`));
    return mode + daemon + card("Maintenance", `<div class="ctl"><button data-act="scan">Run scan</button><button data-act="capture">Capture baseline</button></div>`) + card("About", kv([["Mode", mock ? "MOCK (development)" : "Device"], ["Binary", L.BIN]]));
  }
};

function thermalBanner() {
  const t = data.check;
  if (!t?.ok) return t ? fail(t) : "";
  const v = t.value;
  return v.safe_for_performance_increase
    ? `<div class="banner ok">Thermal safe: hottest ${L.fmtTemp(v.hottest_millicelsius)} (limit ${L.fmtTemp(v.limit_millicelsius)})</div>`
    : `<div class="banner bad">Thermal warning: hottest ${L.fmtTemp(v.hottest_millicelsius)} reached limit ${L.fmtTemp(v.limit_millicelsius)}. Performance increases are blocked.</div>`;
}

function render() {
  const result = last ? `<div class="banner ${last.ok ? "ok" : "bad"}"><b>${last.ok ? "Done" : "Failed"}</b><pre>${esc([last.text, last.warn].filter(Boolean).join("\n"))}</pre><button class="ghost" data-act="dismiss">Dismiss</button></div>` : "";
  view.innerHTML = result + views[page]();
  document.querySelector("#nav").innerHTML = PAGES.map((p) => `<button class="${p === page ? "on" : ""}" data-page="${p}" ${p === page ? 'aria-current="page"' : ""}>${p}</button>`).join("");
}

async function preview(name) {
  let args;
  try {
    args = L.previewArgs(name, known());
  } catch (error) {
    last = { ok: false, text: error.message };
    return render();
  }
  const r = await run(args);
  if (r.errno !== 0) {
    last = { ok: false, text: L.classify(r).label, warn: L.classify(r).detail };
    return render();
  }
  const dry = L.parseDryRun(r.stdout, r.stderr);
  const cpu = data.cpu?.ok ? data.cpu.value : [];
  const gpu = data.gpu?.ok ? data.gpu.value : [];
  let raises = false;
  const rows = dry.changes.map((c) => {
    const cur = L.currentValue(c, cpu, gpu);
    const up = L.raisesPerformance(c, cur.old);
    raises ||= up;
    return `<tr><td>${esc(cur.node || `${c.kind} ${c.name}`)}</td><td>${esc(cur.old ?? "n/a")}</td><td>${esc(c.value)}</td></tr>`;
  });
  const table = rows.length ? `<table><tr><th>Node</th><th>Old</th><th>New</th></tr>${rows.join("")}</table>` : esc(dry.restore ? "Restores the captured baseline." : "No changes planned.");
  const skipped = dry.skipped.length ? `<pre>${esc(dry.skipped.join("\n"))}</pre>` : "";
  const note = raises ? await thermalNote() : null;
  if (!(await ask(`Apply ${name}?`, [table, skipped, note?.text], raises && note?.unsafe))) return;
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
  const r = await run(args);
  last = r.errno === 0 ? { ok: true, text: r.stdout.trim(), warn: r.stderr.trim() } : { ok: false, text: L.classify(r).label, warn: L.classify(r).detail };
  await load();
}

const PERF = (op, value, el) => {
  const item = op.startsWith("cpu") ? data.cpu?.value?.find((p) => base(p.path) === el.dataset.id) : data.gpu?.value?.find((d) => base(d.path) === el.dataset.id);
  if (!item) return false;
  if (op.endsWith("gov")) return /performance/i.test(value);
  const cur = op.endsWith("min") ? (item.scaling_min_freq ?? item.min_freq) : (item.scaling_max_freq ?? item.max_freq);
  return Number(value) > Number(cur);
};

document.addEventListener("change", (event) => {
  const el = event.target;
  const op = el.dataset?.op;
  if (!op || el.tagName !== "SELECT") return;
  const id = el.dataset.id;
  const value = el.value;
  if (/^(cpu|gpu)-/.test(op)) return write(op, { id, value }, `Change ${id}`, [`${op} -> ${value}`], PERF(op, value, el));
  if (op === "cooling") return;
  if (op === "tcp") return write(op, { value }, "Change TCP congestion", [`Algorithm -> ${value}`]);
  if (op === "mode") return write(op, { value }, "Change adaptive mode", [`Mode -> ${value}`, MODE_HELP[value]]);
});

document.addEventListener("click", (event) => {
  const el = event.target.closest("button");
  if (!el) return;
  if (el.dataset.page) {
    page = el.dataset.page;
    last = null;
    return load();
  }
  if (el.id === "reload") return load();
  const act = el.dataset.act;
  const id = el.dataset.id;
  const field = () => view.querySelector(`[data-op="${el.dataset.op ?? "cooling"}"][data-id="${id}"]`);
  if (act === "dismiss") { last = null; return render(); }
  if (act === "preview") return preview(id);
  if (act === "scan") return simple(["scan"], "Run capability scan?", "Rewrites the capability snapshot in the ARCH Manager state directory. No kernel value is changed.");
  if (act === "capture") return simple(["capture"], "Capture baseline?", "Overwrites the stored baseline with the current kernel values.", true);
  if (act === "restore") return simple(["restore"], "Restore baseline?", "Writes every value stored in the baseline back to the kernel.", true);
  if (act === "core-offline") return write("core-offline", { id }, `Take ${id} offline?`, ["Reduces available CPU capacity. The backend refuses CPU0 and the last online core."], false, true);
  if (act === "core-online") return write("core-online", { id }, `Bring ${id} online?`, ["Increases CPU capacity."], true);
  if (act === "cooling") return write("cooling", { id, value: field()?.value }, `Boost cooling on ${id}?`, [`Raises the cooling state to ${field()?.value}. Cooling can only be increased from here.`]);
  if (act === "uclamp") return write(el.dataset.op, { id, value: field()?.value }, `Change ${id} uclamp`, [`${el.dataset.op} -> ${field()?.value}`], el.dataset.op === "uclamp-min");
});

async function boot() {
  if (import.meta.env.VITE_MOCK === "1") mock = (await import("./mock.js")).mockExec;
  load();
}

boot();
