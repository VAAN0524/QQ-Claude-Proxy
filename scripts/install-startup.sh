#!/bin/bash
#
# Linux/macOS Startup Installation Script
# This script installs the application as a systemd service (Linux) or launchd agent (macOS)
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo -e "${BLUE}"
echo "============================================"
echo "  QQ-Claude-Proxy Startup Installer"
echo "============================================"
echo -e "${NC}"
echo "Project Directory: $PROJECT_DIR"
echo

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
else
    echo -e "${RED}[ERROR] Unsupported OS: $OSTYPE${NC}"
    exit 1
fi

echo -e "${GREEN}[INFO] Detected OS: $OS${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js is not installed${NC}"
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}[ERROR] npm is not installed${NC}"
    exit 1
fi

# Build project if needed
if [ ! -f "$PROJECT_DIR/dist/index.js" ]; then
    echo -e "${YELLOW}[INFO] Building project...${NC}"
    npm run build
fi

# Install dependencies
echo -e "${YELLOW}[INFO] Installing dependencies...${NC}"
npm install

# Create data directories
mkdir -p "$PROJECT_DIR/data"
mkdir -p "$PROJECT_DIR/logs"

# Get absolute path to node and npm
NODE_PATH=$(command -v node)
NPM_PATH=$(command -v npm)

# Menu
show_menu() {
    echo
    echo "Please select startup method:"
    echo
    if [ "$OS" == "linux" ]; then
        echo "  1. Systemd Service (Recommended)"
        echo "  2. Crontab"
        echo "  3. RC.local (Legacy)"
    else
        echo "  1. Launchd Agent (Recommended)"
        echo "  2. Crontab"
    fi
    echo "  4. Uninstall"
    echo "  5. Exit"
    echo
    read -p "Enter your choice (1-5): " CHOICE
}

install_systemd() {
    echo
    echo -e "${YELLOW}[INFO] Installing systemd service...${NC}"

    SERVICE_FILE="/etc/systemd/system/qq-claude-proxy.service"

    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}[ERROR] This option requires root privileges${NC}"
        echo "Please run: sudo $0"
        return 1
    fi

    # Create service file
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=QQ-Claude-Proxy Bot
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$NODE_PATH $PROJECT_DIR/scripts/watchdog.js start
Restart=on-failure
RestartSec=5
StandardOutput=append:$PROJECT_DIR/logs/service.log
StandardError=append:$PROJECT_DIR/logs/service-error.log

# Environment
NODE_ENV=production
PATH=$PATH:/usr/bin:/usr/local/bin

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload

    # Enable service
    systemctl enable qq-claude-proxy.service

    echo -e "${GREEN}[SUCCESS] Systemd service installed${NC}"
    echo
    echo "Commands:"
    echo "  Start:   sudo systemctl start qq-claude-proxy"
    echo "  Stop:    sudo systemctl stop qq-claude-proxy"
    echo "  Status:  sudo systemctl status qq-claude-proxy"
    echo "  Logs:    sudo journalctl -u qq-claude-proxy -f"
    echo
}

install_launchd() {
    echo
    echo -e "${YELLOW}[INFO] Installing launchd agent...${NC}"

    PLIST_FILE="$HOME/Library/LaunchAgents/com.qqclaude.proxy.plist"

    # Create plist file
    cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.qqclaude.proxy</string>

    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$PROJECT_DIR/scripts/watchdog.js</string>
        <string>start</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>Crashed</key>
        <true/>
    </dict>

    <key>StandardOutPath</key>
    <string>$PROJECT_DIR/logs/service.log</string>

    <key>StandardErrorPath</key>
    <string>$PROJECT_DIR/logs/service-error.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
</dict>
</plist>
EOF

    # Load the agent
    launchctl load "$PLIST_FILE" 2>/dev/null || launchctl load -w "$PLIST_FILE"

    echo -e "${GREEN}[SUCCESS] Launchd agent installed${NC}"
    echo
    echo "Commands:"
    echo "  Start:   launchctl start com.qqclaude.proxy"
    echo "  Stop:    launchctl stop com.qqclaude.proxy"
    echo "  Unload:  launchctl unload $PLIST_FILE"
    echo
}

install_crontab() {
    echo
    echo -e "${YELLOW}[INFO] Installing crontab entry...${NC}"

    # Get current crontab
    CURRENT_CRON=$(crontab -l 2>/dev/null || true)

    # Check if already exists
    if echo "$CURRENT_CRON" | grep -q "qq-claude-proxy"; then
        echo -e "${YELLOW}[WARN] Crontab entry already exists${NC}"
        read -p "Replace? (y/N): " REPLACE
        if [[ ! "$REPLACE" =~ ^[Yy]$ ]]; then
            return 1
        fi
        # Remove existing entry
        CURRENT_CRON=$(echo "$CURRENT_CRON" | grep -v "qq-claude-proxy")
    fi

    # Add new crontab entry
    NEW_CRON="$CURRENT_CRON

# QQ-Claude-Proxy Watchdog - restart on reboot
@reboot cd \"$PROJECT_DIR\" && $NODE_PATH $PROJECT_DIR/scripts/watchdog.js start >> $PROJECT_DIR/logs/watchdog.log 2>&1"

    # Install new crontab
    echo "$NEW_CRON" | crontab -

    echo -e "${GREEN}[SUCCESS] Crontab entry installed${NC}"
    echo
    echo "To uninstall, edit crontab: crontab -e"
    echo
}

install_rc_local() {
    echo
    echo -e "${YELLOW}[INFO] Installing rc.local entry...${NC}"

    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}[ERROR] This option requires root privileges${NC}"
        echo "Please run: sudo $0"
        return 1
    fi

    RC_LOCAL_FILE="/etc/rc.local"

    # Create rc.local if it doesn't exist
    if [ ! -f "$RC_LOCAL_FILE" ]; then
        cat > "$RC_LOCAL_FILE" << EOF
#!/bin/sh -e
#
# rc.local - System startup script

exit 0
EOF
        chmod +x "$RC_LOCAL_FILE"
    fi

    # Check if already exists
    if grep -q "qq-claude-proxy" "$RC_LOCAL_FILE"; then
        echo -e "${YELLOW}[WARN] rc.local entry already exists${NC}"
        return 1
    fi

    # Add entry before 'exit 0'
    sed -i "/^exit 0/i # QQ-Claude-Proxy\nsu $USER -c \"cd \\\"$PROJECT_DIR\\\" && $NODE_PATH $PROJECT_DIR/scripts/watchdog.js start\" &\n" "$RC_LOCAL_FILE"

    echo -e "${GREEN}[SUCCESS] rc.local entry installed${NC}"
    echo
}

uninstall() {
    echo
    echo "Please select what to uninstall:"
    echo
    if [ "$OS" == "linux" ]; then
        echo "  1. Systemd Service"
        echo "  2. Crontab Entry"
        echo "  3. RC.local Entry"
    else
        echo "  1. Launchd Agent"
        echo "  2. Crontab Entry"
    fi
    echo "  3. All"
    echo "  4. Back to menu"
    echo
    read -p "Enter your choice: " UNINSTALL_CHOICE

    case $UNINSTALL_CHOICE in
        1)
            if [ "$OS" == "linux" ]; then
                if [ "$EUID" -eq 0 ]; then
                    systemctl stop qq-claude-proxy.service 2>/dev/null || true
                    systemctl disable qq-claude-proxy.service 2>/dev/null || true
                    rm -f /etc/systemd/system/qq-claude-proxy.service
                    systemctl daemon-reload
                    echo -e "${GREEN}[SUCCESS] Systemd service uninstalled${NC}"
                else
                    echo -e "${RED}[ERROR] Root privileges required${NC}"
                fi
            else
                launchctl unload "$HOME/Library/LaunchAgents/com.qqclaude.proxy.plist" 2>/dev/null || true
                rm -f "$HOME/Library/LaunchAgents/com.qqclaude.proxy.plist"
                echo -e "${GREEN}[SUCCESS] Launchd agent uninstalled${NC}"
            fi
            ;;
        2)
            # Remove from crontab
            CURRENT_CRON=$(crontab -l 2>/dev/null || true)
            echo "$CURRENT_CRON" | grep -v "qq-claude-proxy" | crontab -
            echo -e "${GREEN}[SUCCESS] Crontab entry removed${NC}"
            ;;
        3)
            if [ "$OS" == "linux" ]; then
                if [ "$EUID" -eq 0 ] && [ -f /etc/rc.local ]; then
                    sed -i '/qq-claude-proxy/d' /etc/rc.local
                    echo -e "${GREEN}[SUCCESS] RC.local entry removed${NC}"
                else
                    echo -e "${RED}[ERROR] Root privileges required or file not found${NC}"
                fi
            else
                # Remove all
                launchctl unload "$HOME/Library/LaunchAgents/com.qqclaude.proxy.plist" 2>/dev/null || true
                rm -f "$HOME/Library/LaunchAgents/com.qqclaude.proxy.plist"
                CURRENT_CRON=$(crontab -l 2>/dev/null || true)
                echo "$CURRENT_CRON" | grep -v "qq-claude-proxy" | crontab -
                echo -e "${GREEN}[SUCCESS] All startup methods uninstalled${NC}"
            fi
            ;;
        4)
            return 0
            ;;
    esac

    echo
    pause
}

pause() {
    read -p "Press Enter to continue..."
}

# Main loop
while true; do
    show_menu

    case $CHOICE in
        1)
            if [ "$OS" == "linux" ]; then
                install_systemd
            else
                install_launchd
            fi
            pause
            ;;
        2)
            install_crontab
            pause
            ;;
        3)
            if [ "$OS" == "linux" ]; then
                install_rc_local
            else
                uninstall
            fi
            pause
            ;;
        4)
            uninstall
            pause
            ;;
        5)
            echo "Goodbye!"
            exit 0
            ;;
        *)
            echo -e "${RED}[ERROR] Invalid choice${NC}"
            pause
            ;;
    esac
done
