#!/usr/bin/env python3
"""Validate post frontmatter — run by CI and optionally pre-commit."""
import sys, re
from pathlib import Path

REQUIRED = ['title', 'layout', 'tags', 'category', 'description']


def main():
    posts = sorted((Path(__file__).parent.parent / '_posts').glob('*.md'))
    if not posts:
        print("no posts found")
        sys.exit(0)

    errors = []
    warnings = []

    for f in posts:
        text = f.read_text(encoding='utf-8', errors='replace')

        if not text.startswith('---'):
            errors.append(f"{f.name}: no front matter block"); continue

        end = text.find('\n---', 3)
        if end == -1:
            errors.append(f"{f.name}: unclosed front matter"); continue

        fm = text[3:end]

        for field in REQUIRED:
            if not re.search(rf'^{field}:\s*.+', fm, re.MULTILINE):
                errors.append(f"{f.name}: missing required field '{field}'")

        if not re.match(r'^\d{4}-\d{2}-\d{2}-', f.name):
            errors.append(f"{f.name}: filename must start with YYYY-MM-DD-")

        m = re.search(r'^image:\s*(.+)$', fm, re.MULTILINE)
        if not m or 'placeholder' in m.group(1).strip() or m.group(1).strip() in ('', '/assets/img/logo.png'):
            warnings.append(f"{f.name}: missing or placeholder image")

        m2 = re.search(r'^description:\s*"?(.+)"?$', fm, re.MULTILINE)
        if m2 and len(m2.group(1)) < 40:
            warnings.append(f"{f.name}: description very short ({len(m2.group(1))} chars)")

    for w in warnings:
        print(f"WARN  {w}")

    if errors:
        for e in errors:
            print(f"ERROR {e}")
        sys.exit(1)

    print(f"OK    {len(posts)} posts validated, {len(warnings)} warnings")


if __name__ == "__main__":
    main()
