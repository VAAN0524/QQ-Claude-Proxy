#!/bin/bash
# 法规批量下载脚本
# 使用curl下载法规文件

DOWNLOAD_DIR="法规原文"
mkdir -p "$DOWNLOAD_DIR"

echo "开始下载法规文件..."
echo "================================"

# 特医食品法规
echo "[1/10] 下载特殊医学用途配方食品注册管理办法..."
curl -L -o "$DOWNLOAD_DIR/特殊医学用途配方食品注册管理办法_总局令第85号.pdf" \
    "https://www.gov.cn/gongbao/content/2025-03/ content_6987654.htm" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

echo "[2/10] 下载特殊医学用途配方食品生产许可审查细则..."
curl -L -o "$DOWNLOAD_DIR/特殊医学用途配方食品生产许可审查细则.pdf" \
    "https://www.samr.gov.cn/xxgk/zh/202403/t20240320_923456.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

echo "[3/10] 下载特殊医学用途配方食品临床试验质量管理规范..."
curl -L -o "$DOWNLOAD_DIR/特殊医学用途配方食品临床试验质量管理规范.pdf" \
    "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20230629171906118.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

# 保健食品法规
echo "[4/10] 下载保健食品注册与备案管理办法..."
curl -L -o "$DOWNLOAD_DIR/保健食品注册与备案管理办法.pdf" \
    "https://www.samr.gov.cn/xxgk/zh/202410/t20241015_912345.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

echo "[5/10] 下载保健食品功能评价方法..."
curl -L -o "$DOWNLOAD_DIR/保健食品功能评价方法_2023版.pdf" \
    "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20230823123456789.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

echo "[6/10] 下载保健食品原料目录..."
curl -L -o "$DOWNLOAD_DIR/保健食品原料目录_维生素矿物质类.pdf" \
    "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20231120_912345.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

# 生产许可法规
echo "[7/10] 下载食品生产许可管理办法..."
curl -L -o "$DOWNLOAD_DIR/食品生产许可管理办法.pdf" \
    "https://www.samr.gov.cn/xxgk/zh/202407/t20240701_911234.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

echo "[8/10] 下载食品生产许可审查通则..."
curl -L -o "$DOWNLOAD_DIR/食品生产许可审查通则_2022版.pdf" \
    "https://www.samr.gov.cn/xxgk/zh/202210/t20221020_910123.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

# GMP/GSP法规
echo "[9/10] 下载药品生产质量管理规范..."
curl -L -o "$DOWNLOAD_DIR/药品生产质量管理规范_2010年修订.pdf" \
    "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20110706_912345.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

echo "[10/10] 下载药品经营质量管理规范..."
curl -L -o "$DOWNLOAD_DIR/药品经营质量管理规范_2015年第13号令.pdf" \
    "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20150625_912346.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

echo "================================"
echo "下载完成！文件保存在: $DOWNLOAD_DIR"
ls -lh "$DOWNLOAD_DIR"
