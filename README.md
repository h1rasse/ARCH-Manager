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
