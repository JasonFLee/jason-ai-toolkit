# OpenClaw Setup Guide

OpenClaw is an AI agent orchestration platform that supports multi-agent workflows, local and cloud LLMs, and advanced automation.

## What is OpenClaw?

OpenClaw provides:
- Multi-agent collaboration
- Local LLM support (via Ollama)
- Cloud LLM integration (Anthropic, OpenAI)
- Task scheduling and cron jobs
- Device management
- Workspace isolation

## Installation

### Install OpenClaw

```bash
# Download and install from releases
# https://github.com/openclaw/openclaw/releases

# Or use the installer script
curl -fsSL https://openclaw.ai/install.sh | bash
```

### Deploy Configuration

```bash
cd ~/jason-ai-toolkit
./scripts/setup_configs.sh
```

This copies the example config to `~/.openclaw/openclaw.json.example`

## Configuration

Edit `~/.openclaw/openclaw.json`:

```json
{
  "meta": {
    "lastTouchedVersion": "2026.2.3-1",
    "lastTouchedAt": "2026-02-08T06:05:55.356Z"
  },
  "auth": {
    "profiles": {
      "anthropic:manual": {
        "provider": "anthropic",
        "mode": "token"
      }
    }
  },
  "agents": {
    "defaults": {
      "workspace": "/Users/YOUR_USERNAME/.openclaw/workspace",
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8
      },
      "model": {
        "primary": "ollama/deepseek-r1:8b"
      }
    }
  },
  "gateway": {
    "mode": "local",
    "auth": {
      "token": "YOUR_GATEWAY_TOKEN"
    }
  }
}
```

### Key Configuration Options

**Workspace**: Where agents store their data
```json
"workspace": "/Users/jasonlee/.openclaw/workspace"
```

**Model Selection**: Choose primary model
```json
"model": {
  "primary": "ollama/deepseek-r1:8b"
}
```

**Concurrency**: Max parallel agents
```json
"maxConcurrent": 4,
"subagents": {
  "maxConcurrent": 8
}
```

## Using Local LLMs with Ollama

### Install Ollama

```bash
brew install ollama

# Start Ollama service
brew services start ollama
```

### Pull Models

```bash
# DeepSeek R1 (8B parameters, fast)
ollama pull deepseek-r1:8b

# DeepSeek R1 (70B parameters, more capable)
ollama pull deepseek-r1:70b

# Llama 3.1 (8B)
ollama pull llama3.1:8b

# Qwen 2.5 Coder (great for coding)
ollama pull qwen2.5-coder:7b
```

### Configure OpenClaw to Use Ollama

In `openclaw.json`:

```json
"model": {
  "primary": "ollama/deepseek-r1:8b"
},
"models": {
  "ollama/deepseek-r1:8b": {}
}
```

## Usage

### Start OpenClaw

```bash
openclaw
```

### Basic Commands

```bash
# Check status
openclaw status

# List agents
openclaw agents list

# Run a task
openclaw run "analyze this codebase"

# Use specific model
openclaw run --model ollama/deepseek-r1:8b "task here"
```

### Cron Jobs

Set up recurring tasks in `~/.openclaw/cron/`:

```bash
# Example: Daily backup
echo "0 2 * * * /path/to/backup.sh" > ~/.openclaw/cron/daily-backup
```

## Device Management

OpenClaw can manage multiple devices/machines:

```bash
# Register a device
openclaw device register --name "macbook-pro"

# List devices
openclaw device list

# Sync workspace across devices
openclaw device sync
```

## Troubleshooting

### OpenClaw won't start

```bash
# Check logs
tail -f ~/.openclaw/logs/*

# Reset configuration
mv ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.backup
openclaw doctor
```

### Ollama connection issues

```bash
# Check Ollama is running
brew services list | grep ollama

# Test Ollama
ollama list
curl http://localhost:11434/api/version

# Restart Ollama
brew services restart ollama
```

### Permission issues

```bash
# Fix workspace permissions
chmod -R 755 ~/.openclaw/workspace
```

### Model not found

```bash
# List available models
ollama list

# Pull the model
ollama pull deepseek-r1:8b

# Verify in OpenClaw
openclaw models list
```

## Best Practices

1. **Use local models for quick tasks**: DeepSeek R1 8B is fast and capable
2. **Use cloud models for complex tasks**: Claude Sonnet 4 for sophisticated reasoning
3. **Set up workspaces per project**: Isolate agent data
4. **Monitor resource usage**: Local LLMs can be memory-intensive
5. **Keep models updated**: `ollama pull <model>` to update

## Resources

- [OpenClaw Documentation](https://openclaw.ai/docs)
- [Ollama Model Library](https://ollama.ai/library)
- [DeepSeek R1 Model Card](https://huggingface.co/deepseek-ai/DeepSeek-R1)
