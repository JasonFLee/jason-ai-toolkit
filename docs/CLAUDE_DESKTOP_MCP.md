# Claude Desktop MCP Configuration

Model Context Protocol (MCP) extends Claude Desktop with custom tools and integrations.

## What is MCP?

MCP (Model Context Protocol) allows Claude Desktop to:
- Access external tools and APIs
- Read from local filesystems
- Integrate with databases
- Connect to web services
- Run custom scripts

## Configuration File

MCP servers are configured in:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

## Example Configuration

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/jasonlee"],
      "env": {}
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "{{env:BRAVE_API_KEY}}"
      }
    },
    "n8n-mcp": {
      "command": "npx",
      "args": ["n8n-mcp"],
      "env": {
        "MCP_MODE": "stdio",
        "LOG_LEVEL": "error",
        "N8N_API_URL": "http://localhost:5678",
        "N8N_API_KEY": "{{env:N8N_API_KEY}}"
      }
    }
  }
}
```

## Available MCP Servers

### Official Servers

1. **Filesystem**
   - Access local files and directories
   - Read, write, search files
   ```json
   "filesystem": {
     "command": "npx",
     "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"]
   }
   ```

2. **Brave Search**
   - Web search capabilities
   - Requires Brave Search API key
   ```json
   "brave-search": {
     "command": "npx",
     "args": ["-y", "@modelcontextprotocol/server-brave-search"],
     "env": { "BRAVE_API_KEY": "{{env:BRAVE_API_KEY}}" }
   }
   ```

3. **GitHub**
   - Repository operations
   - Issue and PR management
   ```json
   "github": {
     "command": "npx",
     "args": ["-y", "@modelcontextprotocol/server-github"],
     "env": { "GITHUB_TOKEN": "{{env:GITHUB_TOKEN}}" }
   }
   ```

4. **Slack**
   - Send messages
   - Read channels
   ```json
   "slack": {
     "command": "npx",
     "args": ["-y", "@modelcontextprotocol/server-slack"],
     "env": { "SLACK_BOT_TOKEN": "{{env:SLACK_BOT_TOKEN}}" }
   }
   ```

5. **PostgreSQL**
   - Database queries
   - Schema inspection
   ```json
   "postgres": {
     "command": "npx",
     "args": ["-y", "@modelcontextprotocol/server-postgres"],
     "env": { "DATABASE_URL": "{{env:DATABASE_URL}}" }
   }
   ```

### Community Servers

1. **N8N MCP**
   - Workflow automation
   - Trigger n8n workflows
   ```bash
   npm install -g n8n-mcp
   ```

2. **Chrome Browser**
   - Browser automation
   - Web scraping
   ```bash
   npm install -g @modelcontextprotocol/server-chrome
   ```

## Setup Instructions

### 1. Find Your Config File

```bash
# macOS
code ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Windows
code %APPDATA%\Claude\claude_desktop_config.json

# Linux
code ~/.config/Claude/claude_desktop_config.json
```

### 2. Add MCP Servers

Edit the JSON file to add servers:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "API_KEY": "{{env:MY_API_KEY}}"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

Close and reopen Claude Desktop for changes to take effect.

### 4. Verify Installation

In Claude Desktop, type:
```
What MCP servers are available?
```

Claude will list all connected servers and their capabilities.

## Environment Variables

MCP servers can use environment variables:

### Set Environment Variables

```bash
# Add to ~/.zshrc or ~/.bashrc
export BRAVE_API_KEY="your_api_key_here"
export GITHUB_TOKEN="ghp_your_token_here"
export N8N_API_KEY="your_n8n_key"

# Reload shell
source ~/.zshrc
```

### Reference in Config

Use the `{{env:VAR_NAME}}` syntax:

```json
"env": {
  "API_KEY": "{{env:MY_API_KEY}}"
}
```

## Creating Custom MCP Servers

You can create custom MCP servers for your own tools:

### Simple Example (JavaScript)

```javascript
// server.js
const { Server } = require('@modelcontextprotocol/sdk');

const server = new Server({
  name: 'my-custom-server',
  version: '1.0.0'
});

server.tool('hello', async ({ name }) => {
  return { message: `Hello, ${name}!` };
});

server.listen();
```

### Add to Config

```json
"my-custom": {
  "command": "node",
  "args": ["/path/to/server.js"]
}
```

## Troubleshooting

### MCP Server Not Loading

1. Check JSON syntax:
   ```bash
   jq . ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. Check command exists:
   ```bash
   which npx
   which node
   ```

3. Test server manually:
   ```bash
   npx -y @modelcontextprotocol/server-filesystem /tmp
   ```

### Permission Errors

Give Claude Desktop necessary permissions:
- **macOS**: System Preferences → Security & Privacy → Full Disk Access

### Environment Variables Not Working

1. Verify variables are set:
   ```bash
   echo $BRAVE_API_KEY
   ```

2. Restart Claude Desktop completely

3. Check the variable name matches exactly

### Server Crashes

Check logs:
```bash
# macOS
tail -f ~/Library/Application\ Support/Claude/logs/*

# Look for MCP-related errors
grep -i mcp ~/Library/Application\ Support/Claude/logs/*.log
```

## Best Practices

1. **Security**: Never commit API keys to git
2. **Paths**: Use absolute paths for filesystem access
3. **Testing**: Test MCP servers manually before adding to Claude
4. **Permissions**: Grant minimal necessary permissions
5. **Updates**: Keep MCP servers updated with `npx -y`

## Resources

- [MCP Documentation](https://modelcontextprotocol.io/)
- [Official MCP Servers](https://github.com/modelcontextprotocol/servers)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Claude Desktop Docs](https://claude.ai/desktop)
