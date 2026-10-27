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
- Kernel writes will be added only after capability validation and baseline capture are implemented.
