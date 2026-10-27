# ARCH Manager

ARCH Manager is a Rust-based Android kernel capability and state controller designed for Magisk and KernelSU environments.

## Phase 0

Phase 0 provides a read-only capability discovery engine, process locking, structured state storage, logging, and guarded baseline restoration.

The scanner inspects available CPUFreq policies, Devfreq devices, thermal zones, power supplies, memory interfaces, and block devices. It does not modify kernel settings.

The module wrapper runs discovery after Android boot completion. It captures a baseline only when no baseline exists and does not apply kernel tuning.

## Build

```sh
cargo build --release
```

## Local execution

The Android state directory can be overridden for development:

```sh
ARCH_MANAGER_ROOT=./runtime cargo run -- scan
ARCH_MANAGER_ROOT=./runtime cargo run -- capture
ARCH_MANAGER_ROOT=./runtime cargo run -- status
```

## Android execution

The default state directory is `/data/adb/arch-manager`.

```sh
archctl scan
archctl capture
archctl status
archctl restore
```

## Safety model

- Discovery is read-only.
- Only one ARCH Manager process may run at a time.
- Restore accepts only `/sys/` and `/proc/sys/` paths.
- Every operation is logged.
- CPUFreq writes are available only through explicit CLI commands with capability validation and baseline capture.

## Phase 1

Phase 1 adds read-only monitoring for device information, CPUFreq policies, Devfreq devices, thermal zones, power supplies, memory, ZRAM, and block devices.

```sh
archctl scan
archctl status
archctl status --json
archctl cpu list
```

The scan output is stored at `/data/adb/arch-manager/state/capabilities.json`.

## Phase 2

Phase 2 adds explicit CPUFreq controls. The command validates the policy, available governor list, hardware frequency limits, current policy limits, write permissions, baseline state, and the value read back after writing.

```sh
archctl cpu set-governor policy0 schedutil
archctl cpu set-min policy0 300000
archctl cpu set-max policy0 1804800
archctl restore
```

CPU changes are not applied automatically at boot. The module boot service remains read-only and only performs discovery plus baseline capture.

## Phase 3

Phase 3 adds generic Devfreq/GPU control. Devices are classified for visibility as `generic-devfreq`, `qualcomm-kgsl`, `mali-devfreq`, or `mediatek-vendor`. Vendor classification does not enable vendor-specific writes; all writes use the available Devfreq interface.

```sh
archctl gpu list
archctl gpu set-governor kgsl-3d0 msm-adreno-tz
archctl gpu set-min kgsl-3d0 200000000
archctl gpu set-max kgsl-3d0 587000000
archctl restore
```

GPU frequency writes are accepted only when the frequency exists in `available_frequencies`, when the target node is writable, and when the new minimum and maximum remain consistent. No GPU setting is applied automatically during boot.

## Phase 4

Phase 4 adds thermal safety monitoring and a performance-increase guard. Thermal zones expose numeric millidegree Celsius values, trip point names, and detected critical trip thresholds.

```sh
archctl thermal list
archctl thermal check
```

The default performance-increase threshold is `55000` millidegree Celsius. It can be overridden for testing or device-specific policy:

```sh
ARCH_MANAGER_THERMAL_LIMIT_MC=52000 archctl thermal check
```

CPU and GPU operations that increase a frequency limit or select a performance governor are rejected when the hottest readable thermal zone reaches the threshold. Operations that reduce limits and `restore` remain available. The guard is evaluated only during explicit CLI writes and does not start a boot daemon or modify thermal trip points.

## Phase 5

Phase 5 adds the profile engine. Built-in profiles are `stock`, `balanced`, `battery`, `performance`, and `gaming`. Profiles apply governor and optional frequency settings only through explicit commands.

```sh
archctl profile list
archctl profile show balanced
archctl profile apply balanced --dry-run
archctl profile apply balanced
archctl profile restore
```

The `stock` profile restores the captured baseline. Custom profiles can be placed under `/data/adb/arch-manager/profiles` as JSON files. The schema is:

```json
{
  "name": "custom",
  "description": "Custom device profile",
  "cpu_governor": "schedutil",
  "cpu_min_freq": null,
  "cpu_max_freq": null,
  "gpu_governor": null,
  "gpu_min_freq": null,
  "gpu_max_freq": null
}
```

Unsupported governors are skipped per device. Frequency changes still use capability validation, baseline capture, write verification, and the Phase 4 thermal guard. Profiles are not applied automatically by the boot service.

## Phase 6

Phase 6 adds adaptive modes and an optional foreground daemon that applies profiles only when the screen state changes.

Available modes:

- `auto`: `balanced` when the screen is on and `stock` when it is off
- `performance`: `performance` in both screen states
- `battery`: `battery` when the screen is on and `stock` when it is off
- `strict`: `stock` in every state

```sh
archctl mode show
archctl mode set auto
archctl daemon status
archctl daemon run 8
```

The daemon uses Android `dumpsys power` output to detect screen state, applies a profile only after a state transition, and ignores unknown states. It is not started by `service.sh`; launch it explicitly after verifying the desired mode. The interval must be between 2 and 300 seconds.

## Phase 7

Phase 7 adds scheduler capability discovery and explicit uclamp controls for common Android cgroup groups. The scanner reports `cpu.uclamp.min`, `cpu.uclamp.max`, `schedtune.boost`, and `schedtune.prefer_idle` when exposed by the device.

```sh
archctl scheduler list
archctl scheduler set-uclamp-min top-app 128
archctl scheduler set-uclamp-max top-app 1024
archctl restore
```

Supported groups are `top-app`, `foreground`, `background`, `system-background`, and `restricted`. Uclamp values are limited to 0–1024. Increasing uclamp is protected by the thermal guard, and scheduler nodes are included in baseline capture and restore. `schedtune` nodes are discovery-only in this phase.
