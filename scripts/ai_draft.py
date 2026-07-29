#!/usr/bin/env python3
"""Generate HTB writeup draft using Claude API."""

import os, sys, re, json, argparse
from pathlib import Path
from datetime import date


def load_env():
    env = Path(__file__).parent.parent / ".env"
    if env.exists():
        for line in env.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


def get_style_examples() -> str:
    posts_dir = Path(__file__).parent.parent / "_posts"
    examples = []
    for p in sorted(posts_dir.glob("*.md"), reverse=True)[:3]:
        lines = p.read_text(encoding='utf-8', errors="replace").splitlines()[:60]
        examples.append("\n".join(lines))
    return "\n\n---NEXT EXAMPLE---\n\n".join(examples)


SYSTEM_PROMPT = """\
You are a cybersecurity blogger writing HackTheBox machine writeups.

Style rules:
- Technical, concise prose. First person where natural.
- Start enumeration with: As usual we start off with an `nmap` port scan
- Describing web: "Visiting the web server we're greeted with..."
- Use inline backticks for commands, filenames, ports: `nmap`, `80`, `admin`
- Code blocks use triple backticks; append {{:filename="name.txt"}} after blocks showing file/tool output
- Images: ![Description](/assets/img/img_SLUG/SLUG-TIMESTAMP.png) — use 13-digit placeholder timestamps
- Section order: # Enumeration → ## Scans → ## PORT - Service → # Foothold → # Privilege Escalation → # Root
- Explain WHY each step was taken, not just the command
- Do NOT include YAML frontmatter
- No padding, no "in conclusion", no meta-commentary

Style examples from this blog:
{examples}
"""


def draft(title: str, os_: str, diff: str, creators: str, notes: str, description: str) -> str:
    try:
        import anthropic
    except ImportError:
        sys.exit("error: pip3 install anthropic")

    load_env()
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key or key.startswith("sk-ant-your"):
        sys.exit("error: set ANTHROPIC_API_KEY in .env")

    examples = get_style_examples()
    system = SYSTEM_PROMPT.format(examples=examples)
    slug = re.sub(r"[^a-z0-9-]", "", title.lower().replace(" ", "-"))

    user_msg = (
        f'Write a full HTB writeup for the machine "{title}".\n\n'
        f"OS: {os_} | Difficulty: {diff} | Creators: {creators}\n"
        f"Description: {description}\n\n"
        f"My notes / key steps:\n{notes}\n\n"
        f"Use image placeholder slug: {slug}\n"
        "Generate the full writeup body only (no frontmatter). "
        "Make tool output realistic and consistent with the steps described."
    )

    client = anthropic.Anthropic(api_key=key)
    print(f"drafting '{title}' with Claude...\n", file=sys.stderr)

    result = ""
    with client.messages.stream(
        model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6"),
        max_tokens=8000,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    ) as stream:
        for text in stream.text_stream:
            print(text, end="", flush=True)
            result += text

    print(file=sys.stderr)
    return result


def build_frontmatter(meta: dict) -> str:
    slug = re.sub(r"[^a-z0-9-]", "", meta["title"].lower().replace(" ", "-"))
    image = f"/assets/img/img_{slug}/{slug}.png"
    lines = [
        "---",
        f"title: {json.dumps(meta['title'])}",
        "layout: post",
    ]
    if meta.get("released"):
        lines.append(f"released: {meta['released']}")
    if meta.get("creators"):
        lines.append(f"creators: {json.dumps(meta['creators'])}")
    lines += [
        "pwned: true",
        "tags:",
        "  - boxes",
        f"  - os/{meta['os']}",
        f"  - diff/{meta['diff']}",
        "category:",
        "  - HTB",
        f"description: {json.dumps(meta.get('description', ''))}",
        f"image: {image}",
        "cssclasses:",
        "  - custom_htb",
        "---",
        "",
        f"![HTB]({image})",
        "",
    ]
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--json",       required=True, help="JSON string with post metadata")
    p.add_argument("--notes-file", required=True, help="path to file containing notes")
    p.add_argument("--out",        required=True, help="output .md file path")
    args = p.parse_args()

    meta  = json.loads(args.json)
    notes = Path(args.notes_file).read_text(errors="replace").strip()

    if not notes:
        sys.exit("error: notes file is empty")

    body = draft(
        title=meta["title"],
        os_=meta["os"],
        diff=meta["diff"],
        creators=meta.get("creators", ""),
        notes=notes,
        description=meta.get("description", ""),
    )

    out = Path(args.out)
    out.write_text(build_frontmatter(meta) + body)
    print(f"\nsaved: {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
