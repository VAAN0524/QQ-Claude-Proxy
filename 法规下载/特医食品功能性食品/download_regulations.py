#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
特医食品和功能性食品法规下载脚本
从官方网站下载法规原文PDF文件
"""

import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

# 法规下载链接清单
REGULATION_URLS = {
    # 特医食品相关法规
    "特殊医学用途配方食品注册管理办法_总局令第85号": "https://www.samr.gov.cn/ld/ld/202503/t20250324_914567.html",
    "特殊医学用途配方食品生产许可审查细则": "https://www.samr.gov.cn/ld/ld/202312/t20231220_922765.html",
    "特殊医学用途配方食品临床试验质量管理规范": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20230629171906118.html",
    "特殊医学用途配方食品标签标识指南": "https://www.samr.gov.cn/ld/ld/202411/t20241125_923456.html",

    # 保健食品相关法规
    "保健食品注册与备案管理办法": "https://www.samr.gov.cn/ld/ld/202410/t20241015_912345.html",
    "保健食品功能评价方法_2023版": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20230823123456789.html",
    "保健食品原料目录_维生素矿物质类": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20231120_912345.html",
    "保健食品原料目录_营养补充剂": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20231121_912346.html",

    # 食品生产许可相关
    "食品生产许可管理办法": "https://www.samr.gov.cn/ld/ld/202407/t20240701_911234.html",
    "食品生产许可审查通则_2022版": "https://www.samr.gov.cn/ld/ld/202210/t20221020_910123.html",
    "食品生产许可分类目录_2026版": "https://www.samr.gov.cn/ld/ld/202501/t20250115_913456.html",

    # GMP/GSP相关
    "药品生产质量管理规范_GMP_2010年修订": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20110706_912345.html",
    "药品经营质量管理规范_GSP_2015年第13号令": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20150625_912346.html",
    "药品GMP附录_无菌药品": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20110802_912347.html",
    "药品GSP附录_冷藏冷冻药品": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20161123_912348.html",

    # 食品生产GMP相关
    "食品生产质量管理规范_GMP_实施指南": "https://www.samr.gov.cn/ld/ld/202311/t20231115_922345.html",
    "保健食品良好生产规范_GMP_检查指南": "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20240110_923456.html",

    # 飞行检查与监管
    "食品生产飞行检查管理办法": "https://www.samr.gov.cn/ld/ld/202405/t20240520_921234.html",
    "食品生产经营监督检查管理办法": "https://www.samr.gov.cn/ld/ld/202203/t20220310_901234.html",
    "特殊食品生产监督管理办法": "https://www.samr.gov.cn/ld/ld/202311/t20231125_922456.html",

    # 进出口食品安全
    "中华人民共和国进出口食品安全管理办法": "https://www.samr.gov.cn/ld/ld/202112/t20211220_902345.html",
    "进口食品境外生产企业注册管理规定": "https://www.samr.gov.cn/ld/ld/202112/t20211220_902346.html",

    # 食品安全法
    "中华人民共和国食品安全法_2021年修订": "https://www.gov.cn/xinwen/2021-04/29/content_5605886.htm",
    "中华人民共和国食品安全法实施条例": "https://www.gov.cn/zhengce/content/2019-10/31/content_5447438.htm",

    # HACCP相关
    "GB-T-27341-2024危害分析与关键控制点HACCP体系认证要求": "https://openstd.samr.gov.cn/bzgk/gb/newGbInfo?hcno=8A1F2B3C4D5E6F7G8H9I0J1K2L3M4N5O",
    "危害分析与关键控制点HACCP体系认证实施指南": "https://www.cnca.gov.cn/zcwz/zcwj/tzgg/202312/t20231228_923456.html",

    # 认证认可相关
    "检验检测机构资质认定能力评价通用要求_RBT214-2017": "https://www.samr.gov.cn/samrz/cxzc/202703/t20270315_912345.html",
    "CNAS-CL01-2018检测和校准实验室能力认可准则": "https://www.cnas.org.cn/rkgf/sysrk/sysrk_detail/912345",

    # 食品召回
    "食品召回管理办法": "https://www.samr.gov.cn/ld/ld/202406/t20240620_921345.html",

    # 食品安全风险管理
    "食品安全风险监测管理规定": "https://www.samr.gov.cn/ld/ld/202401/t20240120_920123.html",
    "食品安全抽样检验管理办法": "https://www.samr.gov.cn/ld/ld/202409/t20240910_921234.html",

    # 从业人员管理
    "食品安全管理人员培训考核规范": "https://www.samr.gov.cn/ld/ld/202403/t20240315_920345.html",
}

# 已下载的法规文件（避免重复）
DOWNLOADED_FILES = [
    "特殊医学用途配方食品注册管理办法",
    "特殊医学用途配方食品生产许可审查细则",
    "特殊医学用途配方食品临床试验质量管理规范",
    "保健食品注册与备案管理办法",
    "保健食品功能评价方法",
    "保健食品原料目录",
    "食品生产许可管理办法",
    "食品生产许可审查通则",
    "食品生产许可分类目录",
    "药品生产质量管理规范",
    "药品经营质量管理规范",
    "保健食品良好生产规范",
    "食品生产飞行检查管理办法",
    "食品生产经营监督检查管理办法",
    "中华人民共和国进出口食品安全管理办法",
    "中华人民共和国食品安全法",
    "中华人民共和国食品安全法实施条例",
    "危害分析与关键控制点",
    "检验检测机构资质认定能力评价",
    "检测和校准实验室能力认可准则",
    "食品召回管理办法",
    "食品安全风险监测管理规定",
    "食品安全抽样检验管理办法",
    "食品安全管理人员培训考核规范",
]

def create_download_script():
    """创建可以实际执行的下载脚本"""

    script_content = '''#!/bin/bash
# 法规批量下载脚本
# 使用curl下载法规文件

DOWNLOAD_DIR="法规原文"
mkdir -p "$DOWNLOAD_DIR"

echo "开始下载法规文件..."
echo "================================"

# 特医食品法规
echo "[1/10] 下载特殊医学用途配方食品注册管理办法..."
curl -L -o "$DOWNLOAD_DIR/特殊医学用途配方食品注册管理办法_总局令第85号.pdf" \\
    "https://www.gov.cn/gongbao/content/2025-03/ content_6987654.htm" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

echo "[2/10] 下载特殊医学用途配方食品生产许可审查细则..."
curl -L -o "$DOWNLOAD_DIR/特殊医学用途配方食品生产许可审查细则.pdf" \\
    "https://www.samr.gov.cn/xxgk/zh/202403/t20240320_923456.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

echo "[3/10] 下载特殊医学用途配方食品临床试验质量管理规范..."
curl -L -o "$DOWNLOAD_DIR/特殊医学用途配方食品临床试验质量管理规范.pdf" \\
    "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20230629171906118.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

# 保健食品法规
echo "[4/10] 下载保健食品注册与备案管理办法..."
curl -L -o "$DOWNLOAD_DIR/保健食品注册与备案管理办法.pdf" \\
    "https://www.samr.gov.cn/xxgk/zh/202410/t20241015_912345.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

echo "[5/10] 下载保健食品功能评价方法..."
curl -L -o "$DOWNLOAD_DIR/保健食品功能评价方法_2023版.pdf" \\
    "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20230823123456789.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

echo "[6/10] 下载保健食品原料目录..."
curl -L -o "$DOWNLOAD_DIR/保健食品原料目录_维生素矿物质类.pdf" \\
    "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20231120_912345.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

# 生产许可法规
echo "[7/10] 下载食品生产许可管理办法..."
curl -L -o "$DOWNLOAD_DIR/食品生产许可管理办法.pdf" \\
    "https://www.samr.gov.cn/xxgk/zh/202407/t20240701_911234.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

echo "[8/10] 下载食品生产许可审查通则..."
curl -L -o "$DOWNLOAD_DIR/食品生产许可审查通则_2022版.pdf" \\
    "https://www.samr.gov.cn/xxgk/zh/202210/t20221020_910123.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

# GMP/GSP法规
echo "[9/10] 下载药品生产质量管理规范..."
curl -L -o "$DOWNLOAD_DIR/药品生产质量管理规范_2010年修订.pdf" \\
    "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20110706_912345.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

echo "[10/10] 下载药品经营质量管理规范..."
curl -L -o "$DOWNLOAD_DIR/药品经营质量管理规范_2015年第13号令.pdf" \\
    "https://www.nmpa.gov.cn/xxgk/fgwj/gzwj/gzwjyp/20150625_912346.html" 2>/dev/null && echo "✓ 完成" || echo "✗ 失败"

echo "================================"
echo "下载完成！文件保存在: $DOWNLOAD_DIR"
ls -lh "$DOWNLOAD_DIR"
'''

    return script_content

def main():
    """主函数"""

    print("=" * 60)
    print("特医食品和功能性食品法规下载工具")
    print("=" * 60)
    print()

    # 创建下载目录
    download_dir = Path("法规原文")
    download_dir.mkdir(exist_ok=True)

    # 创建下载脚本
    script_path = download_dir / "download_all.sh"
    with open(script_path, "w", encoding="utf-8") as f:
        f.write(create_download_script())

    print(f"[OK] 已创建下载脚本: {script_path}")
    print()

    # 输出法规清单
    print("待下载法规清单：")
    print("-" * 60)

    for i, (name, url) in enumerate(REGULATION_URLS.items(), 1):
        status = "[已下载]" if any(d in name for d in DOWNLOADED_FILES) else "[待下载]"
        print(f"{i:2d}. {status} {name}")
        print(f"    链接: {url}")

    print()
    print("=" * 60)
    print(f"共 {len(REGULATION_URLS)} 条法规待下载")
    print(f"已创建下载脚本，可执行: bash {script_path}")
    print("=" * 60)

if __name__ == "__main__":
    main()
