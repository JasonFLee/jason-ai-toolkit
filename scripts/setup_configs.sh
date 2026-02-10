#!/bin/bash

# Deploy configuration files to appropriate locations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLKIT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=================================================="
echo "Deploying Configurations"
echo "=================================================="

# Agent Deck
if [ -d "$TOOLKIT_ROOT/configs/agent-deck" ]; then
    echo "Deploying Agent Deck configuration..."
    mkdir -p ~/.agent-deck

    # Backup existing config
    if [ -f ~/.agent-deck/config.toml ]; then
        echo "  Backing up existing config to config.toml.backup..."
        cp ~/.agent-deck/config.toml ~/.agent-deck/config.toml.backup
    fi

    # Copy new config
    cp "$TOOLKIT_ROOT/configs/agent-deck/config.toml" ~/.agent-deck/

    # Copy profiles if they exist
    if [ -d "$TOOLKIT_ROOT/configs/agent-deck/profiles" ]; then
        cp -r "$TOOLKIT_ROOT/configs/agent-deck/profiles" ~/.agent-deck/
    fi

    echo "  ✓ Agent Deck configured"
else
    echo "  ✗ Agent Deck config not found"
fi

# OpenClaw
if [ -f "$TOOLKIT_ROOT/configs/openclaw/openclaw.json.example" ]; then
    echo "Deploying OpenClaw configuration..."
    mkdir -p ~/.openclaw

    # Backup existing config
    if [ -f ~/.openclaw/openclaw.json ]; then
        echo "  Backing up existing config to openclaw.json.backup..."
        cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.backup
    fi

    # Copy as example (user needs to customize)
    cp "$TOOLKIT_ROOT/configs/openclaw/openclaw.json.example" ~/.openclaw/openclaw.json.example

    echo "  ✓ OpenClaw example config created"
    echo "    Edit ~/.openclaw/openclaw.json.example and rename to openclaw.json"
else
    echo "  ✗ OpenClaw config not found"
fi

# Claude Desktop
if [ -f "$TOOLKIT_ROOT/configs/claude-desktop/claude_desktop_config.json.example" ]; then
    echo "Deploying Claude Desktop MCP configuration..."
    CLAUDE_DIR="$HOME/Library/Application Support/Claude"
    mkdir -p "$CLAUDE_DIR"

    # Backup existing config
    if [ -f "$CLAUDE_DIR/claude_desktop_config.json" ]; then
        echo "  Backing up existing config to claude_desktop_config.json.backup..."
        cp "$CLAUDE_DIR/claude_desktop_config.json" "$CLAUDE_DIR/claude_desktop_config.json.backup"
    fi

    # Copy as example
    cp "$TOOLKIT_ROOT/configs/claude-desktop/claude_desktop_config.json.example" "$CLAUDE_DIR/claude_desktop_config.json.example"

    echo "  ✓ Claude Desktop example config created"
    echo "    Edit '$CLAUDE_DIR/claude_desktop_config.json.example'"
    echo "    and rename to claude_desktop_config.json"
else
    echo "  ✗ Claude Desktop config not found"
fi

echo ""
echo "Configuration deployment complete!"
echo ""
echo "Important: Review and customize the .example files before using them."
echo ""
