#!/usr/bin/env bash
set -euo pipefail

ZIP="${1:?usage: verify-package.sh <module.zip>}"
LIST="$(unzip -Z1 "${ZIP}")"
fail() { echo "FAIL: $*" >&2; exit 1; }

for entry in module.prop customize.sh service.sh action.sh uninstall.sh bin/archctl \
  assets/icon.png assets/banner.png webroot/index.html webroot/app.js webroot/styles.css; do
  grep -qx "${entry}" <<<"${LIST}" || fail "missing ${entry}"
done
grep -q '^webroot/assets/.' <<<"${LIST}" || fail "webroot/assets is empty"
if grep -Ev '^(module\.prop|customize\.sh|service\.sh|action\.sh|uninstall\.sh|assets/|bin/|webroot/)' <<<"${LIST}"; then
  fail "unexpected top-level entries (nested folder?)"
fi
for entry in bin/archctl service.sh action.sh customize.sh uninstall.sh; do
  zipinfo "${ZIP}" "${entry}" | grep -q '^-rwx' || fail "${entry} is not executable"
done

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
unzip -q "${ZIP}" -d "${TMP}"
bash -n "${TMP}/customize.sh" "${TMP}/service.sh" "${TMP}/action.sh" "${TMP}/uninstall.sh"

W="${TMP}/webroot"
if grep -Eqi '(src|href)=["'"'"']?(https?:)?//' "${W}/index.html"; then fail "external reference in index.html"; fi
if grep -Eqi 'url\(["'"'"']?(https?:)?//|@import[^;]*(https?:)?//' "${W}/styles.css"; then fail "external reference in styles.css"; fi
if grep -q '__ARCH_MOCK__\|mock mode is read-only' "${W}/app.js"; then fail "mock code present in production bundle"; fi
EXTERNAL="$(grep -Eo 'https?://[A-Za-z0-9./_-]+' "${W}/app.js" | grep -v 'www.w3.org' | sort -u || true)"
if [ -n "${EXTERNAL}" ]; then echo "::warning::URLs found in app.js (review):"; echo "${EXTERNAL}"; fi
echo "OK: ${ZIP}"
