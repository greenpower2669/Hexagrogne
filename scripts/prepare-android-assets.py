#!/usr/bin/env python3
from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[1]
icon=root/'public/icons/fabhexagrogne-f-v3-maskable-512.png'
if not icon.exists():raise SystemExit('Restaurer Hexagrogne-assets.zip avant le build.')
for density in ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi']:
 dest=root/'android/app/src/main/res'/('mipmap-'+density);dest.mkdir(parents=True,exist_ok=True)
 for name in ['ic_launcher.png','ic_launcher_round.png','ic_launcher_foreground.png']:shutil.copyfile(icon,dest/name)
