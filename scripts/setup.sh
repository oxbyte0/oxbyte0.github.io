#!/usr/bin/env bash
set -euo pipefail

BLOG_DIR="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
ENV_FILE="${BLOG_DIR}/.env"

echo "=== oxbyte blog setup ==="

# deps
echo "[*] installing fzf..."
sudo apt-get install -y fzf > /dev/null 2>&1 && echo "    fzf ok" || echo "    fzf failed — install manually"

echo "[*] installing python anthropic sdk..."
pip3 install anthropic > /dev/null 2>&1 && echo "    anthropic ok" || echo "    anthropic failed — run: pip3 install anthropic"

echo "[*] configuring bundler (local gem path)..."
cd "$BLOG_DIR"
bundle config set --local path vendor/bundle > /dev/null 2>&1 && echo "    bundle path ok"

echo "[*] installing ruby gems (this may take a minute)..."
bundle install 2>&1 | tail -3 && echo "    gems ok" || echo "    bundle install failed — check errors above"

# .env
if [[ ! -f "$ENV_FILE" ]]; then
  cp "${BLOG_DIR}/.env.example" "$ENV_FILE"
  echo ""
  echo "[!] created .env — add your Anthropic API key:"
  echo "    ANTHROPIC_API_KEY=sk-ant-..."
  echo ""
  read -rp "paste API key now (or press enter to skip): " KEY
  if [[ -n "$KEY" ]]; then
    sed -i "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${KEY}|" "$ENV_FILE"
    echo "    key saved"
  fi
else
  echo "[*] .env exists, skipping"
fi

# obsidian vault: init .obsidian dir so blog dir is a valid vault
if [[ ! -d "${BLOG_DIR}/.obsidian" ]]; then
  mkdir -p "${BLOG_DIR}/.obsidian"
  cat > "${BLOG_DIR}/.obsidian/app.json" <<'JSON'
{
  "legacyEditor": false,
  "livePreview": true,
  "defaultViewMode": "source"
}
JSON
  echo "[*] obsidian vault initialized at blog root"
  echo "    open Obsidian → 'Open folder as vault' → pick: $BLOG_DIR"
else
  echo "[*] obsidian vault exists"
fi

# pre-commit hook
HOOK_SRC="${BLOG_DIR}/scripts/pre-commit.hook"
HOOK_DST="${BLOG_DIR}/.git/hooks/pre-commit"
if [[ -f "$HOOK_SRC" ]]; then
  cp "$HOOK_SRC" "$HOOK_DST"
  chmod +x "$HOOK_DST"
  echo "[*] pre-commit hook installed"
else
  echo "[!] pre-commit.hook not found — skipping"
fi

# symlink blog CLI to PATH
LINK_TARGET="/usr/local/bin/blog"
if [[ ! -L "$LINK_TARGET" ]]; then
  sudo ln -sf "${BLOG_DIR}/scripts/blog" "$LINK_TARGET"
  echo "[*] 'blog' command linked to /usr/local/bin/blog"
else
  echo "[*] 'blog' command already linked"
fi

echo ""
echo "=== setup complete ==="
echo "run: blog"
