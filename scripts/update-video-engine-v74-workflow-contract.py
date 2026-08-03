from pathlib import Path

root = Path('.github/workflows')
old = "/studio/video-ai-engine-v73.js?v=1"
new = "/studio/video-ai-engine-v73.js?v=74"
changed = []
for path in sorted([*root.glob('*.yml'), *root.glob('*.yaml')]):
    text = path.read_text(encoding='utf-8')
    if old not in text:
        continue
    path.write_text(text.replace(old, new), encoding='utf-8')
    changed.append(str(path))
if not changed:
    raise SystemExit('No workflow contract containing the v73 bridge query was found')
print('\n'.join(changed))
