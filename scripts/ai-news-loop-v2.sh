#!/bin/bash
# AI资讯周期任务脚本 - 每2小时执行一次（优化版）
# 优化：自动使用最新任务目录、改进图片生成逻辑、清理旧图片

set -e  # 遇到错误立即退出

# 自动生成唯一任务ID（时间戳+随机数）
TASK_ID="$(date +%Y%m%d_%H%M%S)_$$"
TASK_DIR="C:/Test/wechat_article_${TASK_ID}"
IMAGES_DIR="$TASK_DIR/images"

echo "========================================="
echo "AI资讯周期任务 - $(date)"
echo "任务ID: ${TASK_ID}"
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

# 3. 动态撰写文章（基于搜索结果）
echo "→ 撰写文章..."
# 这里可以接入LLM根据搜索结果生成文章
# 暂时使用模板，后续可以改为调用LLM API
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

# 4. 生成配图（改进：确保每次获取最新图片）
echo "→ 生成配图..."
cd "C:/Users/USER939479/.claude/skills/Image"

# 记录开始时间戳，用于识别本次生成的图片
GENERATE_START_TIME=$(date +%s)

# 生成封面图
echo "[1/3] 生成封面图..."
python image_gen_v2.py "封面图" "AI新物种数字员工" 2>&1 | grep -E "SAVE|SUCCESS" || true

# 生成章节1配图
echo "[2/3] 生成章节1配图..."
python image_gen_v2.py "核心突破" "OpenClaw直接上手干活" 2>&1 | grep -E "SAVE|SUCCESS" || true

# 生成章节2配图
echo "[3/3] 生成章节2配图..."
python image_gen_v2.py "关键特性" "本地优先数据不外泄" 2>&1 | grep -E "SAVE|SUCCESS" || true

# 智能复制最新生成的图片
echo "→ 复制最新配图..."

# 找到所有在开始时间之后生成的图片，按时间排序
NEW_IMAGES=$(find . -name "illustration_*.png" -newermt "$(date -d @$GENERATE_START_TIME +%Y-%m-%d\ %H:%M:%S)" 2>/dev/null | sort -r | head -3)

# 如果按时间查找失败，使用传统的ls排序方式
if [ -z "$NEW_IMAGES" ]; then
    NEW_IMAGES=$(ls -t illustration_*.png 2>/dev/null | head -3)
fi

# 按顺序复制图片
i=1
for img in $NEW_IMAGES; do
    if [ "$i" -eq 1 ]; then
        # 第一张作为封面图
        cp "$img" "$IMAGES_DIR/cover.png"
        echo "✓ 封面图: $(basename $img)"
    elif [ "$i" -eq 2 ]; then
        # 第二张作为章节1
        cp "$img" "$IMAGES_DIR/chapter01.png"
        echo "✓ 章节1配图: $(basename $img)"
    elif [ "$i" -eq 3 ]; then
        # 第三张作为章节2
        cp "$img" "$IMAGES_DIR/chapter02.png"
        echo "✓ 章节2配图: $(basename $img)"
    fi
    i=$((i + 1))
done

echo "✓ 配图已生成并复制"

# 5. 清理旧图片（可选：保留最近20张）
echo "→ 清理旧图片..."
OLD_COUNT=$(find . -name "illustration_*.png" | wc -l)
if [ "$OLD_COUNT" -gt 20 ]; then
    # 删除除最新20张外的所有图片
    find . -name "illustration_*.png" -type f | sort -r | tail -n +21 | xargs rm -f
    echo "✓ 已清理旧图片（保留最新20张）"
else
    echo "✓ 图片数量合理（$OLD_COUNT张），无需清理"
fi

# 6. 上传到公众号草稿箱（自动使用最新任务目录）
echo "→ 上传到公众号草稿箱..."
cd /c/Test/bot
python scripts/upload-to-wechat-draft.py

# 7. 通过QQ Bot发送配图
echo "→ 发送配图到QQ..."
node scripts/send-wechat-images.js

echo "========================================="
echo "✓ 周期任务完成 - $(date)"
echo "任务目录: $TASK_DIR"
echo "========================================="

# 等待2小时（7200秒）
echo "⏰ 等待2小时后执行下一轮任务..."
sleep 7200

# 循环执行
exec "$0" "$@"
