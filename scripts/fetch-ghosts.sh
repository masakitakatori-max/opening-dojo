#!/bin/sh
# Download the GM game collections (PGN Mentor) into a temp folder and build public/ghosts.
# Usage: sh scripts/fetch-ghosts.sh
set -e
DIR="$(mktemp -d)"
for n in Fischer Kasparov Carlsen Capablanca Morphy Tal Karpov Alekhine Petrosian; do
  curl -sS -L -A "opening-dojo-personal/0.1" -o "$DIR/$n.zip" "https://www.pgnmentor.com/players/$n.zip"
  unzip -o -q "$DIR/$n.zip" -d "$DIR"
done
node scripts/build-ghosts.ts "$DIR" public/ghosts
