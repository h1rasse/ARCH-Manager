#!/system/bin/sh

MODDIR=${0%/*}
ARCHCTL="$MODDIR/bin/archctl"

[ -x "$ARCHCTL" ] || exit 0

case "${1:-status}" in
    validate)
        ARCH_MANAGER_ROOT=/data/adb/arch-manager "$ARCHCTL" validate --json
        ;;
    restore)
        ARCH_MANAGER_ROOT=/data/adb/arch-manager "$ARCHCTL" restore
        ;;
    profile)
        shift
        ARCH_MANAGER_ROOT=/data/adb/arch-manager "$ARCHCTL" profile "$@"
        ;;
    mode)
        shift
        ARCH_MANAGER_ROOT=/data/adb/arch-manager "$ARCHCTL" mode "$@"
        ;;
    *)
        ARCH_MANAGER_ROOT=/data/adb/arch-manager "$ARCHCTL" scan
        ARCH_MANAGER_ROOT=/data/adb/arch-manager "$ARCHCTL" validate
        ARCH_MANAGER_ROOT=/data/adb/arch-manager "$ARCHCTL" status
        ;;
esac
