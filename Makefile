.PHONY: menu new htb draft write list import batch-import serve deploy open setup convert

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

serve: convert
	bundle exec jekyll serve --livereload --incremental

deploy:
	@if [ -z "$(MSG)" ]; then bash scripts/blog deploy; else \
	  git add -A && git commit -m "$(MSG)" && git push origin main --force; fi

open:
	@bash scripts/blog open

import:
	@bash scripts/blog import $(FILE)

setup:
	@bash scripts/setup.sh

batch-import:
	@bash scripts/blog batch-import

admin:
	@cd ../admin-server && node server.js
