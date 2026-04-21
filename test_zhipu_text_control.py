#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
智谱 CogView-3-flash 文字控制测试
测试在复杂构图和文字密集场景下的表现
"""

from zhipuai import ZhipuAI
import requests
import json
import time
from datetime import datetime

# 初始化客户端
client = ZhipuAI(api_key='cdf84ebcb227413e97189f898d018dda.A6TPPWgDY4LSyGmP')

# 测试用例
test_cases = [
    {
        "name": "测试1: 流程图（多步骤文字标签）",
        "prompt": """Professional process flowchart displaying these steps: 1. Data Collection, 2. Model Training, 3. Validation, 4. Deployment.

The layout features a horizontal glowing timeline extending from left to right through the center, marked with 'Process Flow' in large white letters. The timeline displays 4 distinct story moments connected by elegant glowing arrows. Each step features a prominent blue rounded rectangular node label with clear white font inside, displaying the specific step content in bold text.

Nodes are arranged from left to right in sequential order, each surrounded by significant glowing halo effect. Between nodes, precise connection elements link each step. All labels use clear white font on dark semi-transparent backgrounds for readability. Frame-filling composition with no empty negative space, fully utilized canvas with rich visual storytelling elements.""",
        "size": "1280x720",
        "expected_text_ratio": "高（>30%）"
    },
    {
        "name": "测试2: 对比图表（带数据标签）",
        "prompt": """Professional infographic comparison chart displaying 'AI Model Performance Comparison'.

Overall layout divides canvas into left and right panels separated by a thin glowing cyan line. Left panel title 'GPT-4' displayed inside a prominent light blue rounded rectangular header box with soft glowing edges, centered at the top of left panel, using bold white modern font with subtitle 'Accuracy: 95.8%, Speed: 45ms'.

Right panel title 'Claude 3' displayed inside a prominent beige rounded rectangular header box with soft warm glow, centered at the top of right panel, using bold dark slate gray modern font with subtitle 'Accuracy: 94.2%, Speed: 32ms'.

All performance metrics displayed with detailed photographic realism. All text labels use clear white font in large readable sizes. Visual indicators such as green checkmarks and red X marks feature vibrant colors with soft glowing effects for emphasis. Overall style is modern minimalist design with strong color contrast, frame-filling composition with no empty negative space.""",
        "size": "1024x1024",
        "expected_text_ratio": "高（>25%）"
    },
    {
        "name": "测试3: 海报（大标题+副标题）",
        "prompt": """Cinematic movie poster promoting 'The Future of AI Technology'.

The title 'The Future of AI Technology' occupies the upper third of the canvas, rendered in extra large artistic font (150px height) with golden color and glowing effect, font style is modern bold. The title prominently features the text 'AI TECHNOLOGY' in capital letters filling the width of the image.

Below the main title, subtitle 'How Artificial Intelligence Will Transform Our World' is positioned centrally, displayed in medium white font (60px) as neon sign style, with additional text 'Coming 2026' at the bottom in large letters.

The central area showcases futuristic cityscapes with holographic displays showing text and data. Bottom third displays event details: 'Premiere Date: December 2025', 'Location: Global Streaming', 'Rating: PG-13' displayed as clear white font on dark semi-transparent backgrounds. The poster features dramatic lighting creating atmospheric mood, frame-filling composition with rich visual elements.""",
        "size": "1024x1024",
        "expected_text_ratio": "极高（>40%）"
    },
    {
        "name": "测试4: 社交卡片（引语文字）",
        "prompt": """Social media card featuring a motivational quote prominently displayed in the center.

The quote 'Innovation distinguishes between a leader and a follower - Steve Jobs' is rendered in large elegant typography (80px font size) occupying the center 60% of the image. The text features gradient color from gold to orange and includes a drop shadow effect for emphasis.

The author attribution 'Steve Jobs, Apple Co-founder' appears below in medium font (40px) with a decorative line separator. Background shows a subtle gradient with small decorative elements. The quote text is the main visual element, clearly readable and prominently positioned with no other competing visual elements. Frame-filling composition with the text as the central focal point.""",
        "size": "1024x1024",
        "expected_text_ratio": "极高（>50%）"
    },
    {
        "name": "测试5: 极简文字控制（对比测试）",
        "prompt": """Chapter illustration for: 'The Race to AGI'

Core concept: Tech giants racing toward Artificial General Intelligence. Visual metaphor: horse race with futuristic riders.

Visual Elements:
- Three runners representing USA, China, Europe
- Each runner wears tech-enhanced racing gear with glowing circuits
- Racing track with mile markers showing years: 2025, 2027, 2030, AGI
- Background shows futuristic cityscape with AI research facilities
- Dynamic composition showing intense competition

Text Control (CRITICAL):
- NO text blocks or paragraphs
- If absolutely necessary, maximum 1-3 words at edges only
- Text must not exceed 10% of image area
- Prioritize visual symbols and metaphors over words
- NO labels, NO descriptions, NO explanations
- Let the visual imagery tell the story

Art Style: Cyberpunk with neon lights and dramatic lighting
Colors: Cool tones (blue, purple, cyan) with warm accents (orange, gold)
Mood: Intense, competitive, futuristic
Image size: 1280x720, high quality, detailed rendering with rich visual storytelling""",
        "size": "1280x720",
        "expected_text_ratio": "低（<10%）"
    }
]

# 输出目录
output_dir = "C:/Test/bot/zhipu_text_control_tests"
import os
os.makedirs(output_dir, exist_ok=True)

# 测试结果
results = []

print("=" * 80)
print("智谱 CogView-3-flash 文字控制测试")
print("=" * 80)
print(f"\n测试用例数量: {len(test_cases)}")
print(f"输出目录: {output_dir}")
print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

for i, test_case in enumerate(test_cases, 1):
    print(f"\n{'=' * 80}")
    print(f"[{i}/{len(test_cases)}] {test_case['name']}")
    print(f"{'=' * 80}")
    print(f"尺寸: {test_case['size']}")
    print(f"预期文字占比: {test_case['expected_text_ratio']}")
    print(f"\n提示词长度: {len(test_case['prompt'])} 字符")
    print(f"\n正在生成...")

    start_time = time.time()

    try:
        # 调用 API
        response = client.images.generations(
            model="cogview-3-flash",
            prompt=test_case['prompt'],
            size=test_case['size']
        )

        elapsed = time.time() - start_time

        # 获取图片 URL
        image_url = response.data[0].url

        # 下载图片
        img_response = requests.get(image_url, timeout=30)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"test_{i}_{timestamp}.png"
        local_path = os.path.join(output_dir, filename)

        with open(local_path, 'wb') as f:
            f.write(img_response.content)

        file_size = len(img_response.content)

        print(f"✓ 生成成功！")
        print(f"  耗时: {elapsed:.2f} 秒")
        print(f"  文件大小: {file_size / 1024:.2f} KB")
        print(f"  图片 URL: {image_url[:80]}...")
        print(f"  本地路径: {local_path}")

        # 记录结果
        results.append({
            "test": i,
            "name": test_case['name'],
            "success": True,
            "elapsed": elapsed,
            "file_size": file_size,
            "local_path": local_path,
            "url": image_url
        })

    except Exception as e:
        print(f"✗ 生成失败: {str(e)}")
        results.append({
            "test": i,
            "name": test_case['name'],
            "success": False,
            "error": str(e)
        })

# 保存测试结果
result_file = os.path.join(output_dir, "test_results.json")
with open(result_file, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print(f"\n{'=' * 80}")
print("测试完成")
print(f"{'=' * 80}")
print(f"结束时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"\n结果统计:")
print(f"  成功: {sum(1 for r in results if r['success'])} / {len(results)}")
print(f"  失败: {sum(1 for r in results if not r['success'])} / {len(results)}")
print(f"  平均耗时: {sum(r['elapsed'] for r in results if r['success']) / max(1, sum(1 for r in results if r['success'])):.2f} 秒")
print(f"\n结果文件: {result_file}")
print(f"\n请查看生成的图片，评估：")
print(f"  1. 文字是否按 prompt 显示？")
print(f"  2. 文字占比是否符合预期？")
print(f"  3. 图片质量如何？")
print(f"  4. 与 wanx-v1 和 Qwen 的对比？")
