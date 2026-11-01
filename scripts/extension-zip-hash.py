import hashlib
import json
import stat
import sys
import zipfile


def fingerprint(path):
    entries = {}
    with zipfile.ZipFile(path) as archive:
        for entry in archive.infolist():
            name = entry.filename
            if entry.is_dir():
                continue
            if name in entries or name.startswith("/") or "\\" in name or ".." in name.split("/"):
                raise ValueError("Unsafe or duplicate ZIP entry: " + name)
            if stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError("Symlink in extension ZIP: " + name)
            data = archive.read(entry)
            if name == "manifest.json":
                manifest = json.loads(data)
                if manifest.get("manifest_version") != 3 or manifest.get("name") != "mdbase Reader":
                    raise ValueError("Only production MV3 extension ZIPs may be compared")
                manifest.pop("version", None)
                manifest.pop("version_name", None)
                data = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
            entries[name] = hashlib.sha256(data).hexdigest()
    if "manifest.json" not in entries:
        raise ValueError("Extension ZIP has no manifest")
    return hashlib.sha256(json.dumps(sorted(entries.items()), separators=(",", ":")).encode()).hexdigest()


if __name__ == "__main__":
    print(fingerprint(sys.argv[1]))
