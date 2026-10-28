# frozen_string_literal: true

source "https://rubygems.org"

ruby "~> 3.3"

gem "jekyll",         "~> 4.4"
gem "webrick",        "~> 1.9"
gem "jekyll-sitemap", "~> 1.4"
gem "jekyll-feed",    "~> 0.17"
gem "jekyll-seo-tag", "~> 2.9"

# Transitive deps pinned above jekyll's own floor — CVE-2026-54904/54905/54906
# (concurrent-ruby) and CVE-2026-54696 (json) were unpatched in what jekyll
# 4.4's own constraints would otherwise resolve to.
gem "concurrent-ruby", ">= 1.3.8"
gem "json", ">= 2.19.9"
