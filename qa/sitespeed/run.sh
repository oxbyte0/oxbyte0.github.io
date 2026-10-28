#!/usr/bin/env bash
# sitespeed.io via the official Docker image — always pulls `:latest` so the
# tool itself, Browsertime, and the bundled browsers stay current. Runs
# Chrome + Firefox, Coach advice on, one video-backed visual-metrics pass per
# engine. No local Node deps needed beyond Docker.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

OUT="../reports/sitespeed"
mkdir -p "$OUT"

docker run --rm \
  --shm-size=1g \
  -v "$(pwd)/urls.txt:/urls.txt:ro" \
  -v "$(pwd)/budget.json:/budget.json:ro" \
  -v "$(pwd)/../reports/sitespeed:/sitespeed.io" \
  sitespeedio/sitespeed.io:latest \
  --multi \
  --browsertime.browser chrome --browsertime.browser firefox \
  --browsertime.videoParams.createFilmstrip true \
  --visualMetrics true \
  --coach true \
  --budget.configPath /budget.json \
  /urls.txt

echo "Report written to $OUT"
