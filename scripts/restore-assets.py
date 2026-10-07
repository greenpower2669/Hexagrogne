#!/usr/bin/env python3
"""Restore only the canonical asset inventory, after validating the entire ZIP."""
import argparse,hashlib,json,sys,zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('archive');p.add_argument('--target',default=str(Path(__file__).resolve().parents[1]));a=p.parse_args()
manifest=json.loads((Path(__file__).resolve().parents[1]/'assets-manifest.json').read_text())
try:
 with zipfile.ZipFile(a.archive) as z:
  expected={f['path']:f for f in manifest['files']}
  names=z.namelist()
  if len(names)!=len(set(names)) or set(names)!=set(expected)|{'assets-manifest.json'}:raise ValueError('inventaire incorrect')
  payload={}
  root=Path(a.target).resolve()
  for name,info in expected.items():
   dest=(root/name).resolve()
   if not dest.is_relative_to(root):raise ValueError('chemin interdit')
   if z.getinfo(name).file_size!=info['bytes']:raise ValueError('taille incorrecte : '+name)
   data=z.read(name)
   if hashlib.sha256(data).hexdigest()!=info['sha256']:raise ValueError('SHA-256 incorrect : '+name)
   payload[dest]=data
  for dest,data in payload.items():dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
 print(f'{len(payload)} assets restaurés et vérifiés.')
except (ValueError,OSError,zipfile.BadZipFile,KeyError) as e:
 sys.exit('Archive incompatible : '+str(e))
