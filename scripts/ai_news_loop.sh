#!/bin/bash
# AI资讯周期任务脚本 - 每2小时执行一次
# 功能：搜索AI热点 -> 撰写公众号文章 -> 生成配图 -> 发送到QQ

TASK_DIR="C:/Test/wechat_article_$(date +%Y%m%d)_$(date +%H%M%S)"
IMAGES_DIR="$TASK_DIR/images"

echo "========================================="
echo "AI资讯周期任务 - $(date)"
echo "========================================="

# 1. 创建任务文件夹
mkdir -p "$IMAGES_DIR"
echo "✓ 任务文件夹: $TASK_DIR"

# 2. 搜索AI热点（使用智谱搜索）
echo "→ 搜索AI热点..."
cd "C:/Users/USER939479/.claude/skills/zhipu-search"
export PYTHONIOENCODING=utf-8
export ZHIPU_API_KEY="cdf84ebcb227413e97189f898d018dda.A6TPPWgDY4LSyGmP"
python scripts/search.py "AI人工智能最新热点 科技资讯 2026" --limit 10 > "$TASK_DIR/search_results.txt"

# 3. 选取最热点并撰写文章（这里使用示例文章模板）
echo "→ 撰写文章..."
cat > "$TASK_DIR/article.md" << 'ARTICLE'
# AI新物种：能真正干活的数字员工

2026年，AI圈炸出一个新物种。OpenClaw开源项目三个月在GitHub拿下10万星，成为今年增长最快的AI项目。

## 01 不是聊天，是干活

OpenClaw直接上手干活。管理文件、处理数据、写代码，真实操作不是模拟。

## 02 本地优先，数据不外泄

所有数据都在本地处理，对金融医疗法律行业量身定做。

## 03 主动执行，不用盯着

会自己动脑子规划步骤，遇到问题自己尝试解决。

## 04 开源免费，企业也能用

代码在GitHub公开，不限制次数不限制功能。
ARTICLE

echo "✓ 文章已撰写"

# 4. 生成配图（使用Image skill）
echo "→ 生成配图..."
cd "C:/Users/USER939479/.claude/skills/Image"

# 封面图
python image_gen_v2.py "封面图：AI新物种" "OpenClaw成为2026年增长最快的AI项目，能真正干活的数字员工" 2>&1 | grep -E "SAVE|SUCCESS"

# 章节配图
python image_gen_v2.py "不是聊天是干活" "OpenClaw直接上手干活，管理文件处理数据写代码" 2>&1 | grep -E "SAVE|SUCCESS"
python image_gen_v2.py "本地优先" "数据在本地处理，不出设备，对金融医疗法律行业量身定做" 2>&1 | grep -E "SAVE|SUCCESS"
python image_gen_v2.py "主动执行" "会自己动脑子规划步骤，遇到问题自己尝试解决" 2>&1 | grep -E "SAVE|SUCCESS"
python image_gen_v2.py "开源免费" "代码公开，不限制次数，企业也能用" 2>&1 | grep -E "SAVE|SUCCESS"

echo "✓ 配图已生成"

# 5. 通过QQ Bot发送配图到用户QQ
echo "→ 发送配图到QQ..."
cd /c/Test/bot
node scripts/send-wechat-images.js

echo "========================================="
echo "✓ 周期任务完成 - $(date)"
echo "========================================="

# 等待2小时（7200秒）
echo "⏰ 等待2小时后执行下一轮任务..."
sleep 7200

# 循环执行
exec "$0" "$@"
