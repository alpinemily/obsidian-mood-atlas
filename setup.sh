#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ID="mood-atlas"
PLUGIN_FILES=("main.js" "manifest.json" "styles.css")

# Prompt for vault path
read -rp "Enter the path to your Obsidian vault: " VAULT_PATH

# Expand ~ if present
VAULT_PATH="${VAULT_PATH/#\~/$HOME}"

if [[ ! -d "$VAULT_PATH" ]]; then
  echo "Error: Directory '$VAULT_PATH' does not exist." >&2
  exit 1
fi

# Install dependencies and build
echo "Installing dependencies..."
npm install

echo "Building plugin..."
npm run build

# Create plugin directory
PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/$PLUGIN_ID"
mkdir -p "$PLUGIN_DIR"

# Copy files
echo "Installing plugin to $PLUGIN_DIR..."
for file in "${PLUGIN_FILES[@]}"; do
  if [[ -f "$file" ]]; then
    cp "$file" "$PLUGIN_DIR/$file"
    echo "  Copied $file"
  else
    echo "  Warning: $file not found, skipping." >&2
  fi
done

echo "Done. Enable 'Mood Atlas' in Obsidian Settings > Community Plugins."
