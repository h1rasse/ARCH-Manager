import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/logic.js";

const known = { cpu: { policy0: { gov: ["schedutil"], freq: ["300000", "1800000"] } }, gpu: {}, cooling: { cooling_device0: {} }, tcp: ["cubic"], profiles: ["balanced"] };

test("friendly device labels hide raw policy and vendor node names", () => {
  const cpu = { path: "/sys/devices/system/cpu/cpufreq/policy0", affected_cpus: "0 1 2 3" };
  assert.equal(L.cpuLabel(cpu), "CPU cluster 0");
  assert.equal(L.cpuCores(cpu), "Cores 0–3");
  assert.equal(L.gpuLabel(), "GPU");
  assert.equal(L.gpuLabel(1, 2), "GPU 2");
  assert.equal(L.gpuBackendLabel("qualcomm-kgsl"), "Qualcomm Adreno");
  assert.equal(L.gpuBackendLabel("unknown"), "Graphics processor");
});

test("activeGpuDevices keeps recognized GPUs above zero MHz only", () => {
  const active = { path: "/sys/class/devfreq/kgsl-3d0", backend: "qualcomm-kgsl", cur_freq: "587000000" };
  const genericGpu = { path: "/sys/class/devfreq/gpu0", backend: "generic-devfreq", cur_freq: "150000000" };
  const devices = [
    active,
    { path: "/sys/class/devfreq/kgsl-3d1", backend: "qualcomm-kgsl", cur_freq: "0" },
    genericGpu,
    { path: "/sys/class/devfreq/soc-l3", backend: "generic-devfreq", cur_freq: "800000000" },
    { path: "/sys/class/devfreq/mali0", backend: "mali-devfreq", cur_freq: null }
  ];
  assert.deepEqual(L.activeGpuDevices(devices), [active, genericGpu]);
  assert.deepEqual(L.activeGpuDevices(null), []);
});

test("buildCommand quotes and rejects unsafe arguments", () => {
  assert.equal(L.buildCommand(["cpu", "list"]), `${L.BIN} 'cpu' 'list'`);
  assert.throws(() => L.buildCommand(["cpu", "list; rm -rf /"]));
  assert.throws(() => L.buildCommand(["a b"]));
});

test("writeArgs enforces discovery allowlists", () => {
  assert.deepEqual(L.writeArgs("cpu-gov", { id: "policy0", value: "schedutil" }, known), ["cpu", "set-governor", "policy0", "schedutil"]);
  assert.throws(() => L.writeArgs("cpu-gov", { id: "policy0", value: "bogus" }, known));
  assert.throws(() => L.writeArgs("cpu-max", { id: "policy0", value: "999" }, known));
  assert.throws(() => L.writeArgs("core-offline", { id: "cpu0" }, known));
  assert.throws(() => L.writeArgs("uclamp-max", { id: "top-app", value: "1025" }, known));
  assert.throws(() => L.writeArgs("tcp", { value: "x" }, known));
});

test("parseDryRun extracts planned changes and skipped lines", () => {
  const out = "Dry run: CPU policy0 governor -> performance\nDry run: GPU kgsl-3d0 maximum frequency -> 587000000\nDry run completed: 2 planned operation(s)\n";
  const r = L.parseDryRun(out, "Skipped CPU policy4: governor unavailable: performance\n");
  assert.equal(r.changes.length, 2);
  assert.equal(r.skipped.length, 1);
  assert.equal(L.parseDryRun("Dry run: restore captured baseline\n", "").restore, true);
});

test("classify and parseJson handle failures", () => {
  assert.equal(L.classify({ errno: 127, stdout: "", stderr: "not found" }).kind, "missing");
  assert.equal(L.classify({ errno: 1, stdout: "", stderr: "Permission denied" }).kind, "permission");
  assert.equal(L.parseJson("{bad").ok, false);
});
