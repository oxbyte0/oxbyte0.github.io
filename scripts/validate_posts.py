#!/usr/bin/env python3
"""Validate post frontmatter — run by CI and optionally pre-commit."""
import sys, re
from pathlib import Path

REQUIRED = ['title', 'layout', 'tags', 'category', 'description']
DATE_RE   = re.compile(r'^\d{4}-\d{2}-\d{2}$')


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

        # released date must be YYYY-MM-DD if present
        m_rel = re.search(r'^released:\s*(.+)$', fm, re.MULTILINE)
        if m_rel:
            rel_val = m_rel.group(1).strip().strip('"\'')
            if not DATE_RE.match(rel_val):
                errors.append(f"{f.name}: released '{rel_val}' must be YYYY-MM-DD")

        # HTB posts must have a type/ tag so the archive filter shows them
        tags_block = re.findall(r'^\s+-\s+(.+)$', fm, re.MULTILINE)
        is_htb = any('HTB' in t for t in tags_block) or bool(re.search(r'category:.*\n.*HTB', fm, re.DOTALL))
        has_type = any(t.strip().startswith('type/') for t in tags_block)
        if is_htb and not has_type:
            warnings.append(f"{f.name}: HTB post missing type/ tag (filter tab will hide it)")

        m = re.search(r'^image:\s*(.+)$', fm, re.MULTILINE)
        if not m or 'placeholder' in m.group(1).strip() or m.group(1).strip() in ('', '/assets/img/logo.png'):
            warnings.append(f"{f.name}: missing or placeholder image")
        elif m.group(1).strip().startswith('/assets/img/'):
            img_path = Path(__file__).parent.parent / m.group(1).strip().lstrip('/')
            if not img_path.exists():
                errors.append(f"{f.name}: image file not found: {m.group(1).strip()}")

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
