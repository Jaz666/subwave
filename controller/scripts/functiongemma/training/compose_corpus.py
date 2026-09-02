#!/usr/bin/env python3
"""Append correction JSONL files to a validated base corpus without rewriting it."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base', type=Path, required=True)
parser.add_argument('--correction', type=Path, action='append', required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()

args.output.mkdir(parents=True, exist_ok=True)
counts: dict[str, int] = {}
for split, filename in [('train', 'train.jsonl'), ('development', 'development.jsonl')]:
    seen: set[str] = set()
    rows: list[str] = []
    for source in [args.base, *args.correction]:
        path = source / filename
        if not path.is_file():
            raise ValueError(f'missing {path}')
        for number, raw in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            row = json.loads(raw)
            identifier = row.get('id')
            if not isinstance(identifier, str) or identifier in seen:
                raise ValueError(f'{path}:{number}: missing or duplicate id {identifier!r}')
            seen.add(identifier)
            rows.append(json.dumps(row, separators=(',', ':')))
    target = args.output / filename
    target.write_text('\n'.join(rows) + '\n', encoding='utf-8')
    counts[split] = len(rows)
manifest = {'format': 'subwave.functiongemma-routing.v20-composed', 'base': str(args.base), 'corrections': [str(path) for path in args.correction], 'counts': counts}
(args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(f"composed train={counts['train']} development={counts['development']}")
