#!/bin/bash
# 特医食品和功能性食品相关法规批量下载脚本

BASE_DIR="C:/Test/bot/法规下载/特医食品功能性食品"
cd "$BASE_DIR" || exit 1

echo "======================================"
echo "开始下载特医食品功能性食品相关法规"
echo "======================================"

# 创建分类目录
mkdir -p "GSP规范"
mkdir -p "GMP标准"
mkdir -p "厂房设计"
mkdir -p "质量体系"
mkdir -p "生产许可"
mkdir -p "注册管理"

# 统计变量
total=0
success=0
failed=0

# 函数：下载单个文件
download_file() {
    local url="$1"
    local output="$2"
    local name="$3"
    
    total=$((total + 1))
    echo ""
    echo "[$total] 下载: $name"
    echo "    URL: $url"
    echo "    输出: $output"
    
    if curl -L -f -A "Mozilla/5.0" --connect-timeout 30 --max-time 120 \
        -o "$output" "$url" 2>/dev/null; then
        # 检查文件大小
        size=$(stat -c%s "$output" 2>/dev/null || stat -f%z "$output" 2>/dev/null || echo "0")
        if [ "$size" -gt 1000 ]; then
            echo "    ✓ 成功 (大小: $size bytes)"
            success=$((success + 1))
            return 0
        else
            echo "    ✗ 文件过小，可能下载失败"
            failed=$((failed + 1))
            rm -f "$output"
            return 1
        fi
    else
        echo "    ✗ 下载失败"
        failed=$((failed + 1))
        return 1
    fi
}

echo ""
echo "======================================"
echo "下载统计"
echo "======================================"
echo "总计: $total"
echo "成功: $success"
echo "失败: $failed"
echo "======================================"
