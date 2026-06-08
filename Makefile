.PHONY: menu new htb draft write list import batch-import serve deploy open setup convert dev admin fonts status logs

menu:
	@bash scripts/blog menu

new:
	@bash scripts/blog new

htb:
	@bash scripts/blog htb

draft:
	@bash scripts/blog draft

write:
	@bash scripts/blog write

list:
	@bash scripts/blog list

convert:
	@echo "Converting images to WebP..."
	@if command -v cwebp > /dev/null 2>&1; then \
		find assets/img -type f \( -name "*.png" -o -name "*.jpg" \) | while read img; do \
			out="$${img%.*}.webp"; [ -f "$$out" ] || cwebp -q 82 -mt -quiet "$$img" -o "$$out"; \
		done; \
	elif command -v convert > /dev/null 2>&1; then \
		find assets/img -type f \( -name "*.png" -o -name "*.jpg" \) | while read img; do \
			out="$${img%.*}.webp"; [ -f "$$out" ] || convert "$$img" -quality 82 "$$out" 2>/dev/null; \
		done; \
	else \
		echo "No converter found. Install: sudo apt install webp  OR  imagemagick"; \
	fi
	@echo "WebP conversion complete. $$(find assets/img -name '*.webp' | wc -l) files."

fonts:
	@echo "Downloading self-hosted fonts for local dev..."
	@python3 - <<'PYEOF'
import re, hashlib, os
import urllib.request

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req).read().decode()

urls = [
    "https://fonts.googleapis.com/css2?family=Martian+Mono:wght@300;400&display=swap",
    "https://fonts.googleapis.com/css2?family=Onest:ital,wght@0,400;0,500;0,600;1,400&display=swap",
]

os.makedirs("assets/fonts", exist_ok=True)
combined_css = ""
for url in urls:
    css = fetch(url)
    def replace_url(m):
        woff2_url = m.group(1)
        h = hashlib.md5(woff2_url.encode()).hexdigest()[:12]
        local = f"/assets/fonts/{h}.woff2"
        outfile = f"assets/fonts/{h}.woff2"
        if not os.path.exists(outfile):
            req2 = urllib.request.Request(woff2_url, headers={"User-Agent": UA})
            data = urllib.request.urlopen(req2).read()
            with open(outfile, "wb") as f:
                f.write(data)
            print(f"  Downloaded {outfile}")
        return f"url({local})"
    css = re.sub(r"url\(([^)]+\.woff2)\)", replace_url, css)
    combined_css += css + "\n"

with open("assets/fonts/fonts.css", "w") as f:
    f.write("/* Self-hosted fonts — generated locally, do not commit */\n")
    f.write(combined_css)
print("OK: assets/fonts/fonts.css written")
PYEOF

serve: convert fonts
	bundle exec jekyll serve --livereload --incremental --host 127.0.0.1

dev: convert fonts
	@echo "Starting Jekyll + admin server..."
	@trap 'kill %1 %2 2>/dev/null' INT; \
	  bundle exec jekyll serve --livereload --incremental --host 127.0.0.1 & \
	  (cd ../admin-server && node server.js) & \
	  wait

admin:
	@if lsof -ti:3001 >/dev/null 2>&1; then \
	  echo "Admin server already running on port 3001"; \
	else \
	  cd ../admin-server && node server.js; \
	fi

status:
	@echo "=== Jekyll ===" && (lsof -ti:4000 >/dev/null 2>&1 && echo "Running on :4000" || echo "Not running")
	@echo "=== Admin ===" && (lsof -ti:3001 >/dev/null 2>&1 && echo "Running on :3001" || echo "Not running")
	@cd ../admin-server && (command -v pm2 >/dev/null 2>&1 && pm2 status || echo "pm2 not available")

logs:
	@tail -f ~/.oxbyte-admin.out.log ~/.oxbyte-admin.err.log 2>/dev/null || echo "No log files found"

deploy:
	@if [ -z "$(MSG)" ]; then bash scripts/blog deploy; else \
	  git add -A -- ':!.env' ':!.env.*' ':!*.key' && git commit -m "$(MSG)" && git push origin main; fi

open:
	@bash scripts/blog open

import:
	@bash scripts/blog import $(FILE)

setup:
	@bash scripts/setup.sh

batch-import:
	@bash scripts/blog batch-import
