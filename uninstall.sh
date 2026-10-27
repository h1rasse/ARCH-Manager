#!/system/bin/sh

MODDIR=${0%/*}
ARCHCTL="$MODDIR/bin/archctl"
[ -x "$ARCHCTL" ] || exit 0
[ -f "/data/adb/arch-manager/state/baseline.json" ] || exit 0
ARCH_MANAGER_ROOT=/data/adb/arch-manager "$ARCHCTL" restore
