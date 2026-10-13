from pathlib import Path

root = Path(__file__).resolve().parents[1] / "public" / "models"
created = []

for entry in root.iterdir():
    if not entry.is_dir():
        continue
    info = entry / "info.json"
    if info.exists():
        continue
    info.write_text("{}\n", encoding="utf-8")
    created.append(entry.name)

print(f"created {len(created)}")
for name in created:
    print(name)
