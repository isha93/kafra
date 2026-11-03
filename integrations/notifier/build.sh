#!/bin/bash
# Build "Kafra Notifier.app" from source, locally, and sign it ad hoc.
# Output: integrations/notifier/build/Kafra Notifier.app (gitignored).
set -euo pipefail
cd "$(dirname "$0")"

APP="build/Kafra Notifier.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O -o "$APP/Contents/MacOS/KafraNotifier" KafraNotifier.swift

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>dev.kafra.notifier</string>
  <key>CFBundleName</key><string>Kafra</string>
  <key>CFBundleDisplayName</key><string>Kafra</string>
  <key>CFBundleExecutable</key><string>KafraNotifier</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSUIElement</key><true/>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
</dict>
</plist>
PLIST

# Icon from Kafra's own "waiting" icon, scaled up with nearest neighbour to keep the pixels.
ICON_SRC="../../web/assets/icons/waiting.png"
if [[ -f "$ICON_SRC" ]] && command -v node >/dev/null; then
  ICONSET="build/AppIcon.iconset"
  rm -rf "$ICONSET"; mkdir -p "$ICONSET"
  node --input-type=module -e '
    import { readFileSync, writeFileSync } from "node:fs";
    import { decode, encode } from "../../scripts/png.mjs";
    const src = decode(readFileSync(process.argv[1]));
    for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
      const data = Buffer.alloc(size * size * 4);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const sx = Math.floor((x * src.w) / size), sy = Math.floor((y * src.h) / size);
        src.data.copy(data, (y * size + x) * 4, (sy * src.w + sx) * 4, (sy * src.w + sx) * 4 + 4);
      }
      const png = encode({ w: size, h: size, data });
      const name = { 16: ["16x16"], 32: ["16x16@2x", "32x32"], 64: ["32x32@2x"], 128: ["128x128"], 256: ["128x128@2x", "256x256"], 512: ["256x256@2x", "512x512"], 1024: ["512x512@2x"] }[size];
      for (const n of name) writeFileSync(`${process.argv[2]}/icon_${n}.png`, png);
    }
  ' "$ICON_SRC" "$ICONSET"
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
  rm -rf "$ICONSET"
fi

codesign --force --sign - "$APP" >/dev/null 2>&1
echo "$PWD/$APP"
