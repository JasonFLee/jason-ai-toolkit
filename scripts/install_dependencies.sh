#!/bin/bash

# Install all dependencies needed for Jason's AI Toolkit

set -e

echo "Installing dependencies..."

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add Homebrew to PATH for Apple Silicon Macs
    if [[ $(uname -m) == 'arm64' ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
else
    echo "Homebrew already installed."
fi

# Update Homebrew
echo "Updating Homebrew..."
brew update

# Install Python 3.11
if ! command -v python3 &> /dev/null; then
    echo "Installing Python 3.11..."
    brew install python@3.11
else
    echo "Python already installed: $(python3 --version)"
fi

# Install Node.js
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    brew install node
else
    echo "Node.js already installed: $(node --version)"
fi

# Install Git
if ! command -v git &> /dev/null; then
    echo "Installing Git..."
    brew install git
else
    echo "Git already installed: $(git --version)"
fi

# Install Calibre (for EPUB to PDF conversion)
if ! command -v ebook-convert &> /dev/null; then
    echo "Installing Calibre..."
    brew install --cask calibre
else
    echo "Calibre already installed."
fi

# Install Ollama (optional, for local LLMs)
if ! command -v ollama &> /dev/null; then
    echo "Installing Ollama (optional)..."
    read -p "Install Ollama for local LLMs? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        brew install ollama
        echo "Ollama installed. You may want to pull models:"
        echo "  ollama pull deepseek-r1:8b"
    fi
else
    echo "Ollama already installed."
fi

# Install gh CLI (GitHub)
if ! command -v gh &> /dev/null; then
    echo "Installing GitHub CLI..."
    brew install gh
else
    echo "GitHub CLI already installed."
fi

echo ""
echo "Dependencies installation complete!"
echo ""
echo "Installed:"
echo "  - Homebrew: $(brew --version | head -1)"
echo "  - Python: $(python3 --version)"
echo "  - Node.js: $(node --version)"
echo "  - npm: $(npm --version)"
echo "  - Git: $(git --version)"
if command -v ebook-convert &> /dev/null; then
    echo "  - Calibre: $(ebook-convert --version | head -1)"
fi
if command -v ollama &> /dev/null; then
    echo "  - Ollama: $(ollama --version)"
fi
if command -v gh &> /dev/null; then
    echo "  - GitHub CLI: $(gh --version | head -1)"
fi
