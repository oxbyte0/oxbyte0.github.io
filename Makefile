.PHONY: menu new htb draft write list import batch-import serve deploy open setup

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

serve:
	bundle exec jekyll serve --livereload --incremental

deploy:
	@if [ -z "$(MSG)" ]; then bash scripts/blog deploy; else \
	  git add -A && git commit -m "$(MSG)" && git push origin main; fi

open:
	@bash scripts/blog open

import:
	@bash scripts/blog import $(FILE)

setup:
	@bash scripts/setup.sh

batch-import:
	@bash scripts/blog batch-import
