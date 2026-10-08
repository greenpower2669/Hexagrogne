#!/usr/bin/env python3
"""Prepare Fab's immutable October V3 exports for the offline Capacitor bundle."""
import argparse, hashlib, json, pathlib, sys

EXPORTS = {
    "FabHexaGrogne-IA-ligue-cycle-1341.json": (1933080, "53cc370418ba87023bd7d562471a5a564a0d0ab9", "fabhexagrogne-ai-pack"),
    "FabHexaBrain-V2-corpus-2026-10-08.json": (11421819, "812df10c52b07014a668c791ed3b2d82b8ac481c", "fabhexabrain"),
    "FabHexaGrogne-victoires-humaines-2026-10-08.json": (4951321, "d4f6612fc91eedf69ecf7dcc7f61f456242d475d", "fabhexagrogne-human-victories"),
}

def blobsha(payload):
    return hashlib.sha1(b"blob " + str(len(payload)).encode() + b"\0" + payload).hexdigest()

def verify(path, expected_size, expected_blob, expected_schema):
    data = path.read_bytes()
    assert len(data) == expected_size, f"{path.name}: bad length {len(data)}"
    assert blobsha(data) == expected_blob, f"{path.name}: Git blob hash mismatch"
    value = json.loads(data)
    assert isinstance(value, dict) and value.get("schema") == expected_schema, f"{path.name}: unexpected schema"
    if expected_schema == "fabhexagrogne-ai-pack":
        assert value.get("version") == 9 and value.get("gameVersion") == "3.1.1-t3"
        assert value.get("architectureId") == "fabhexabrain-v3-hybrid-r15-hexconv32-32-48"
        assert value.get("selfPlayLeague", {}).get("cycle") == 1341
        assert all(k in value.get("modules", {}) for k in ("core", "queenEscapeContext", "hexConv"))
    elif expected_schema == "fabhexabrain":
        assert value.get("version") == 2 and value.get("rulesVersion") == 15
        assert value.get("architectureId") == "fabhexabrain-v2-policy-value6-hex11-r15"
        assert len(value.get("samples", [])) == 640
    else:
        assert value.get("version") == 1 and value.get("encoding", {}).get("boardRadius") == 5
        assert len(value.get("games", [])) == 6
        assert sum(len(g.get("frames", [])) for g in value["games"]) == 240
    print(f"verified {path.name}: {len(data)} bytes, sha256={hashlib.sha256(data).hexdigest()}")
    return data

def main():
    args = argparse.ArgumentParser()
    args.add_argument("source_dir", type=pathlib.Path)
    args.add_argument("--check-packaged", action="store_true")
    cfg = args.parse_args()
    root = pathlib.Path(__file__).resolve().parents[1]
    package = root / "android/app/src/main/assets/public/fab-exports"
    output = root / "public/fab-exports"
    if not cfg.check_packaged: output.mkdir(parents=True, exist_ok=True)
    for name, (size, git_sha, schema) in EXPORTS.items():
        content = verify(cfg.source_dir/name, size, git_sha, schema)
        if cfg.check_packaged:
            for location in (root/"dist-mobile/fab-exports"/name, package/name):
                assert location.is_file() and location.read_bytes() == content, f"Bundle missing or mismatched: {location}"
        else:
            (output/name).write_bytes(content)
    print("3 Fab V3 exports bundled and verified" if cfg.check_packaged else "3 Fab V3 exports staged")

if __name__ == "__main__":
    try: main()
    except (OSError, ValueError, AssertionError, json.JSONDecodeError) as ex: sys.exit(str(ex))
