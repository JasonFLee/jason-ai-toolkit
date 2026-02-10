# Agent Deck Setup Guide

Agent Deck is a multi-agent orchestration platform that manages AI agents with different capabilities.

## What is Agent Deck?

Agent Deck allows you to:
- Run multiple AI agents in parallel
- Configure different tools and capabilities per agent
- Manage MCP (Model Context Protocol) servers
- Set up agent profiles with specific configurations

## Installation

### Install Agent Deck

```bash
# Using Homebrew (recommended)
brew install agent-deck

# Or download from releases
# https://github.com/agent-deck/agent-deck/releases
```

### Deploy Configuration

```bash
cd ~/jason-ai-toolkit
./scripts/setup_configs.sh
```

This will copy the configuration to `~/.agent-deck/`

## Configuration Files

### config.toml

Main configuration file located at `~/.agent-deck/config.toml`

Key settings:
```toml
default_tool = "claude"
theme = "dark"

[claude]
  command = ""
  config_dir = ""
  dangerous_mode = false

[global_search]
  enabled = true
  tier = "auto"
  recent_days = 90

[updates]
  auto_update = false
  check_enabled = true
  check_interval_hours = 24
```

### Profiles

Agent profiles are stored in `~/.agent-deck/profiles/`

Each profile can have:
- Custom system prompts
- Specific tool configurations
- MCP server integrations
- Model preferences

## Usage

### Start Agent Deck

```bash
agent-deck
```

### Create a New Profile

```bash
# Inside Agent Deck
# Press 'P' to manage profiles
# Select "New Profile"
```

### Common Commands

- `S` - Settings
- `P` - Profiles
- `M` - MCP Servers
- `Q` - Quit

## MCP Server Configuration

MCP servers extend agent capabilities. Add them in the `[mcps]` section:

```toml
[mcps]
[mcps.filesystem]
  command = "npx"
  args = ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allow"]

[mcps.brave-search]
  command = "npx"
  args = ["-y", "@modelcontextprotocol/server-brave-search"]
  env = { BRAVE_API_KEY = "{{env:BRAVE_API_KEY}}" }
```

## Troubleshooting

### Agent Deck won't start

```bash
# Check installation
which agent-deck

# Check config file syntax
cat ~/.agent-deck/config.toml
```

### MCP server errors

```bash
# Check logs
tail -f ~/.agent-deck/logs/*

# Test MCP server manually
npx -y @modelcontextprotocol/server-filesystem /tmp
```

### Permission issues

```bash
# Fix permissions
chmod 755 ~/.agent-deck
chmod 644 ~/.agent-deck/config.toml
```

## Resources

- [Agent Deck Documentation](https://github.com/agent-deck/agent-deck)
- [MCP Protocol Spec](https://modelcontextprotocol.io/)
- [Available MCP Servers](https://github.com/modelcontextprotocol/servers)
