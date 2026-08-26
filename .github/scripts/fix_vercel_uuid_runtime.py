from pathlib import Path

root = Path('backend/server')
needle = "const { v4: uuidv4 } = require('uuid');"
replacement = "const { randomUUID: uuidv4 } = require('crypto');"

changed = []
for path in sorted(root.rglob('*.js')):
    text = path.read_text(encoding='utf-8')
    count = text.count(needle)
    if count:
        path.write_text(text.replace(needle, replacement), encoding='utf-8')
        changed.append((str(path), count))

if not changed:
    raise SystemExit('No CommonJS uuid v4 imports found to replace')

remaining = []
for path in sorted(root.rglob('*.js')):
    text = path.read_text(encoding='utf-8')
    if "require('uuid')" in text or 'require("uuid")' in text:
        remaining.append(str(path))

if remaining:
    raise SystemExit('Remaining CommonJS uuid imports: ' + ', '.join(remaining))

print(f'Replaced uuid v4 CommonJS imports in {len(changed)} files:')
for path, count in changed:
    print(f'  {path}: {count}')
