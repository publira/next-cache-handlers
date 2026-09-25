#!/usr/bin/env bash

set -euo pipefail

sudo chown -R vscode:vscode \
  /home/vscode/.claude \
  /home/vscode/.codex \
  /home/vscode/.config \
  /home/vscode/.gemini \
  /home/vscode/.grok

pnpm install
