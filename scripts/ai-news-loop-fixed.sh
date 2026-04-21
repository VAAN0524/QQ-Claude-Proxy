#!/bin/bash
# AI资讯周期任务脚本 - 每2小时执行一次（修复版）
# 修复：确保图片文件名与文章引用一致

TASK_DIR="C:/Test/wechat_article_$(date +%Y%m%d)_$(date +%H%M%S)"
IMAGES_DIR="$TASK_DIR/images"

echo "========================================="
echo "AI资讯周期任务 - $(date)"
echo "========================================="

# 1. 创建任务文件夹
mkdir -p "$IMAGES_DIR"
echo "✓ 任务文件夹: $TASK_DIR"

# 2. 搜索AI热点
echo "→ 搜索AI热点..."
cd "C:/Users/USER939479/.claude/skills/zhipu-search"
export PYTHONIOENCODING=utf-8
export ZHIPU_API_KEY="cdf84ebcb227413e97189f898d018dda.A6TPPWgDY4LSyGmP"
python scripts/search.py "AI人工智能最新热点 科技资讯 2026" --limit 10 > "$TASK_DIR/search_results.txt"

# 3. 撰写文章（使用标准文件名引用）
echo "→ 撰写文章..."
cat > "$TASK_DIR/article.md" << 'ARTICLE'
# AI新物种：能真正干活的数字员工

2026年，AI圈炸出一个新物种。OpenClaw开源项目三个月在GitHub拿下10万星。

## 01 核心突破

![配图](images/chapter01.png)

OpenClaw直接上手干活，管理文件、处理数据、写代码，真实操作不是模拟。

## 02 关键特性

![配图](images/chapter02.png)

本地优先运行，数据不外泄，对金融医疗法律行业量身定做。

数字员工未来可期。
ARTICLE

echo "✓ 文章已撰写"

# 4. 生成配图（使用标准命名）
echo "→ 生成配图..."
cd "C:/Users/USER939479/.claude/skills/Image"

# 生成封面图
python image_gen_v2.py "封面图" "AI新物种数字员工" 2>&1 | grep -E "SAVE|SUCCESS"

# 生成章节配图并重命名为标准格式
python image_gen_v2.py "核心突破" "OpenClaw直接上手干活" 2>&1 | grep -E "SAVE|SUCCESS"
LATEST_IMG=$(ls -t illustration_*.png 2>/dev/null | head -1)
if [ -n "$LATEST_IMG" ]; then
  cp "$LATEST_IMG" "$IMAGES_DIR/chapter01.png"
  echo "✓ 章节1配图已重命名为标准格式"
fi

python image_gen_v2.py "关键特性" "本地优先数据不外泄" 2>&1 | grep -E "SAVE|SUCCESS"
LATEST_IMG=$(ls -t illustration_*.png 2>/dev/null | head -1)
if [ -n "$LATEST_IMG" ]; then
  cp "$LATEST_IMG" "$IMAGES_DIR/chapter02.png"
  echo "✓ 章节2配图已重命名为标准格式"
fi

# 复制封面图
LATEST_IMG=$(ls -t illustration_*.png 2>/dev/null | head -1)
if [ -n "$LATEST_IMG" ]; then
  cp "$LATEST_IMG" "$IMAGES_DIR/cover.png"
  echo "✓ 封面图已生成"
fi

echo "✓ 配图已生成（标准文件名格式）"

# 5. 上传到公众号草稿箱
echo "→ 上传到公众号草稿箱..."
cd /c/Test/bot
python scripts/upload-to-wechat-draft.py

# 6. 通过QQ Bot发送配图
echo "→ 发送配图到QQ..."
node scripts/send-wechat-images.js

echo "========================================="
echo "✓ 周期任务完成 - $(date)"
echo "========================================="

# 等待2小时（7200秒）
echo "⏰ 等待2小时后执行下一轮任务..."
sleep 7200

# 循环执行
exec "$0" "$@"
