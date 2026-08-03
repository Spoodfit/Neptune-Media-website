from pathlib import Path

path = Path('neptune-tv-media-cloudflare/src/entry-v16.js')
text = path.read_text(encoding='utf-8')
old = "const PERMANENT_ENGINE_UI_JS = '/studio/video-ai-engine-v73.js?v=1';"
new = "const PERMANENT_ENGINE_UI_JS = '/studio/video-ai-engine-v73.js?v=74';"
if text.count(old) != 1:
    raise SystemExit(f'Expected exactly one stale runtime injection, found {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Updated permanent engine runtime injection to v74.')
