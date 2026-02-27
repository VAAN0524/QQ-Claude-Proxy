#!/bin/bash
# ========================================
# QQ-Claude-Proxy 一键升级脚本
# ========================================

set -e

echo ""
echo "========================================"
echo "   QQ-Claude-Proxy 升级向导"
echo "========================================"
echo ""

# 1. 获取最新代码
echo "[1/5] 获取最新代码..."
git fetch origin
git pull origin main
echo "[完成] 代码已更新"
echo ""

# 2. 检查并安装依赖
echo "[2/5] 检查依赖..."

# 检查 mcporter
if command -v mcporter &> /dev/null; then
    echo "[跳过] mcporter 已安装"
else
    echo "[安装] mcporter..."
    npm install -g mcporter
    echo "[完成] mcporter 已安装"
fi

# 检查 yt-dlp (尝试多种方式)
if command -v yt-dlp &> /dev/null; then
    echo "[跳过] yt-dlp 已安装"
else
    echo "[安装] yt-dlp..."
    # 尝试 pip
    if command -v pip &> /dev/null; then
        pip install yt-dlp -q
        echo "[完成] yt-dlp 已安装 (pip)"
    # 尝试 pip3
    elif command -v pip3 &> /dev/null; then
        pip3 install yt-dlp -q
        echo "[完成] yt-dlp 已安装 (pip3)"
    # 尝试 python -m pip
    elif command -v python &> /dev/null; then
        python -m pip install yt-dlp -q
        echo "[完成] yt-dlp 已安装 (python -m pip)"
    # 尝试 python3 -m pip
    elif command -v python3 &> /dev/null; then
        python3 -m pip install yt-dlp -q
        echo "[完成] yt-dlp 已安装 (python3 -m pip)"
    else
        echo "[警告] yt-dlp 安装失败，请手动安装: pip install yt-dlp"
    fi
fi
echo ""

# 3. 更新 .env 配置
echo "[3/5] 更新 .env 配置..."

# 检查 .env 是否存在 Agent Reach 配置
if grep -q "AGENT_REACH_MCPORTER_PATH" .env 2>/dev/null; then
    echo "[跳过] .env 已包含 Agent Reach 配置"
else
    echo "[添加] Agent Reach 配置到 .env..."
    cat >> .env << 'EOF'

# Agent Reach 配置
AGENT_REACH_MCPORTER_PATH=mcporter
AGENT_REACH_YTDLP_PATH=yt-dlp
AGENT_REACH_ENABLE_SOCIAL=true
EOF
    echo "[完成] .env 已更新"
fi
echo ""

# 4. 创建配置文件
echo "[4/5] 创建配置文件..."

# 确保 config 目录存在
mkdir -p config

# 创建 agent-reach.json
cat > config/agent-reach.json << 'EOF'
{
  "version": "1.0.0",
  "mcporter": {
    "configured": true,
    "path": "mcporter",
    "servers": ["exa"]
  },
  "ytDlp": {
    "installed": true,
    "path": "yt-dlp"
  }
}
EOF
echo "[完成] config/agent-reach.json 已创建"

# 创建 mcporter.json
cat > config/mcporter.json << 'EOF'
{
  "exa": "https://mcp.exa.ai/mcp"
}
EOF
echo "[完成] config/mcporter.json 已创建"
echo ""

# 5. 重新编译
echo "[5/5] 重新编译项目..."
npm run build
echo "[完成] 编译成功"
echo ""

echo "========================================"
echo "   升级完成！"
echo "========================================"
echo ""
echo "运行以下命令启动服务:"
echo "  npm start"
echo ""
echo "或使用开发模式:"
echo "  npm run dev"
echo ""
