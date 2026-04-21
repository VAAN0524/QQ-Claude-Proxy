#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试智谱 AI CogView-3-flash 图像生成
"""

import requests
import json
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv('/c/Test/bot/.env')

# 智谱 API key
ZHIPU_API_KEY = os.getenv('GLM_API_KEY', 'cdf84ebcb227413e97189f898d018dda.A6TPPWgDY4LSyGmP')

url = "https://open.bigmodel.cn/api/paas/v4/images/generations"

payload = {
    "model": "cogview-3-flash",
    "prompt": "一只可爱的小猫咪，坐在阳光明媚的窗台上，背景是蓝天白云，温馨治愈风格，高清画质",
    "size": "1280x1280"
}

headers = {
    "Authorization": f"Bearer {ZHIPU_API_KEY}",
    "Content-Type": "application/json"
}

print("=" * 60)
print("智谱 AI CogView-3-flash 图像生成测试")
print("=" * 60)
print(f"\nAPI Key: {ZHIPU_API_KEY[:20]}...")
print(f"模型: {payload['model']}")
print(f"尺寸: {payload['size']}")
print(f"提示词: {payload['prompt']}")
print("\n正在发送请求...")

try:
    response = requests.post(url, json=payload, headers=headers, timeout=60)

    print(f"\n状态码: {response.status_code}")

    if response.status_code == 200:
        result = response.json()

        if 'data' in result and len(result['data']) > 0:
            image_url = result['data'][0]['url']
            print(f"\n✅ 图像生成成功！")
            print(f"\n图片 URL: {image_url}")

            # 保存响应信息
            with open('/tmp/zhipu_image_test_result.json', 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"\n完整响应已保存到: /tmp/zhipu_image_test_result.json")
        else:
            print(f"\n❌ 响应格式异常")
            print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"\n❌ 请求失败")
        print(f"响应内容: {response.text}")

except requests.exceptions.Timeout:
    print("\n❌ 请求超时（60秒）")
except Exception as e:
    print(f"\n❌ 发生错误: {str(e)}")

print("\n" + "=" * 60)
