const cpu = [{ path: "/sys/devices/system/cpu/cpufreq/policy0", affected_cpus: "0 1 2 3", scaling_governor: "schedutil", available_governors: "schedutil performance powersave", available_frequencies: "300000 1000000 1800000", scaling_min_freq: "300000", scaling_max_freq: "1800000", scaling_cur_freq: "600000" }];
const gpu = [{ path: "/sys/class/devfreq/kgsl-3d0", backend: "qualcomm-kgsl", name: "kgsl-3d0", governor: "msm-adreno-tz", available_governors: "msm-adreno-tz performance", available_frequencies: "200000000 400000000 587000000", cur_freq: "200000000", min_freq: "200000000", max_freq: "587000000" }];
const zones = [{ path: "/sys/class/thermal/thermal_zone0", zone_type: "cpu", temperature_millicelsius: 38000, trip_points: [], critical_trip_millicelsius: 95000 }];
const net = { interfaces: [{ name: "wlan0", operstate: "up", carrier: "1", mtu: 1500, speed: "866", duplex: "full", address: "02:00:00:00:00:01", tx_queue_len: 1000 }], tcp: { current: "cubic", available: "cubic reno bbr", allowed: "cubic reno", writable: true } };
const cooling = [{ path: "/sys/class/thermal/cooling_device0", device_type: "cpu-cluster0", current_state: 0, max_state: 3, writable: ["cur_state"] }];
const cores = [0, 1, 2, 3].map((n) => ({ cpu: n, online: true, online_node: `/sys/devices/system/cpu/cpu${n}/online`, writable: n > 0 }));
const sched = { uclamp: [{ group: "top-app", attribute: "cpu.uclamp.min", value: "0", writable: true }, { group: "top-app", attribute: "cpu.uclamp.max", value: "1024", writable: true }], schedtune: [] };
const profiles = ["stock", "balanced", "battery", "performance"].map((name) => ({ name, description: `${name} profile` }));
const table = {
  "status --json": { generated_at: 1, device: { kernel_release: "5.15.0-mock", machine: "mock" }, cpu_policies: cpu, devfreq_devices: gpu, thermal_zones: zones, cores, cooling_devices: cooling, network: net },
  "validate --json": { passed: true, checks: [{ name: "sysfs", status: "pass", detail: "/sys" }] },
  "cpu list": cpu, "gpu list": gpu, "thermal list": zones, "core list": cores, "thermal cooling list": cooling,
  "thermal check": { hottest_millicelsius: 38000, limit_millicelsius: 55000, safe_for_performance_increase: true },
  "scheduler list": sched, "network list": net.interfaces, "network tcp list": net.tcp, "profile list": profiles,
  "mode show": { mode: "auto", screen_state: "on" }, "daemon status": { mode: "auto", screen_state: "on", running: false, interval_seconds: 8 }
};

export async function mockExec(line) {
  const key = line.replace(/^\S+archctl\s+/, "").replace(/'/g, "");
  if (key in table) return { errno: 0, stdout: JSON.stringify(table[key]), stderr: "" };
  if (key.endsWith("--dry-run")) return { errno: 0, stdout: "Dry run: CPU policy0 governor -> performance\nDry run completed: 1 planned operation(s)\n", stderr: "" };
  return { errno: 1, stdout: "", stderr: `mock mode is read-only: ${key}` };
}
