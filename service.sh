MODDIR=${0%/*}
ARCHCTL="$MODDIR/bin/archctl"
STATE_DIR=/data/adb/arch-manager/state

until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 2
done

[ -x "$ARCHCTL" ] || exit 0
mkdir -p "$STATE_DIR"
ARCH_MANAGER_ROOT=/data/adb/arch-manager "$ARCHCTL" scan
[ -f "$STATE_DIR/baseline.json" ] || ARCH_MANAGER_ROOT=/data/adb/arch-manager "$ARCHCTL" capture
ARCH_MANAGER_ROOT=/data/adb/arch-manager "$ARCHCTL" validate >/dev/null 2>&1 || true
