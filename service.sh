#!/system/bin/sh

MODDIR=${0%/*}
ARCHCTL="$MODDIR/bin/archctl"
STATE_DIR=/data/adb/arch-manager/state

until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 2
done

[ -x "$ARCHCTL" ] || exit 0

for node in \
    /sys/devices/system/cpu/cpufreq/policy*/scaling_min_freq \
    /sys/devices/system/cpu/cpufreq/policy*/scaling_max_freq \
    /sys/devices/system/cpu/cpufreq/policy*/scaling_governor; do
    [ -e "$node" ] || continue
    chmod u+rw "$node" 2>/dev/null || true
done

mkdir -p "$STATE_DIR"
ARCH_MANAGER_ROOT=/data/adb/arch-manager "$ARCHCTL" scan
[ -f "$STATE_DIR/baseline.json" ] || ARCH_MANAGER_ROOT=/data/adb/arch-manager "$ARCHCTL" capture
ARCH_MANAGER_ROOT=/data/adb/arch-manager "$ARCHCTL" validate >/dev/null 2>&1 || true
