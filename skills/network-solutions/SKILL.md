---
name: network_solutions
description: 网络问题解决方案技能。使用此技能当遇到 GitHub 下载失败、npm 安装超时、API 调用被限制、git clone 失败等网络问题时。提供 CDN 镜像、代理配置、DNS 优化等多种解决方案。
---

# 网络问题解决方案技能

## 概述

解决中国大陆访问海外资源时的网络问题，包括 GitHub、npm、API 等服务的访问问题。

## 常见问题诊断

| 错误类型 | 典型信息 | 解决方案 |
|---------|---------|---------|
| 连接超时 | `Connection timed out` | 使用 CDN 镜像 |
| 连接拒绝 | `Connection refused` (Exit code 35) | 使用代理或镜像 |
| SSL错误 | `SSL certificate problem` | 使用 HTTPS 镜像 |
| DNS污染 | `Could not resolve host` | 修改 DNS 或使用镜像 |
| 速度极慢 | 下载几KB/s | 使用国内镜像 |

## CDN 镜像方案

### 1. jsDelivr（推荐）

**GitHub 文件镜像**

```bash
# 原始 URL
https://github.com/{owner}/{repo}/blob/{branch}/{path}

# 转换为 jsDelivr
https://fastly.jsdelivr.net/gh/{owner}/{repo}@{branch}/{path}

# 示例
curl -sL "https://fastly.jsdelivr.net/gh/vercel-labs/agent-skills@main/skills/react-best-practices/SKILL.md"
```

**特点**：
- 稳定可靠
- 支持特定 commit: `@abc1234`
- 支持标签: `@v1.0.0`
- 缓存时间约 12 小时

### 2. ghproxy

```bash
# 格式
https://ghproxy.com/{original-github-url}

# 示例
curl -sL "https://ghproxy.com/https://github.com/owner/repo/archive/refs/heads/main.zip"
```

**适用场景**：
- 下载 release 文件
- 下载仓库 zip
- 克隆仓库

### 3. GitClone 加速

```bash
# git clone 加速
git clone https://gitclone.com/github.com/{owner}/{repo}.git

# 或使用 ghproxy
git clone https://ghproxy.com/https://github.com/{owner}/{repo}.git
```

## npm 镜像配置

### 使用淘宝镜像

```bash
# 临时使用
npm install --registry=https://registry.npmmirror.com

# 永久配置
npm config set registry https://registry.npmmirror.com
```

### .npmrc 配置

```ini
registry=https://registry.npmmirror.com
@types:registry=https://registry.npmmirror.com
sass_binary_site=https://npmmirror.com/mirrors/node-sass/
```

### pnpm 配置

```bash
pnpm config set registry https://registry.npmmirror.com
```

### yarn 配置

```bash
yarn config set registry https://registry.npmmirror.com
```

## Git 配置优化

### 代理设置

```bash
# 设置代理
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890

# 取消代理
git config --global --unset http.proxy
git config --global --unset https.proxy
```

### 使用 GitHub 加速

```bash
# 方法 1: 使用 ghproxy
git clone https://ghproxy.com/https://github.com/{owner}/{repo}.git

# 方法 2: 使用 GitClone
git clone https://gitclone.com/github.com/{owner}/{repo}.git

# 方法 3: 手动修改 URL
git clone https://github.com.cnpmjs.org/{owner}/{repo}.git
```

### 加速 git submodule

```bash
# 使用镜像初始化 submodule
git submodule add https://ghproxy.com/https://github.com/{owner}/{repo}.git
```

## Docker 镜像加速

### 配置镜像加速器

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.ccs.tencentyun.com"
  ]
}
```

### 使用阿里云镜像

```bash
# 拉取镜像
docker pull registry.cn-hangzhou.aliyuncs.com/{namespace}/{image}:tag

# 标记后推送
docker tag {image}:tag registry.cn-hangzhou.aliyuncs.com/{namespace}/{image}:tag
docker push registry.cn-hangzhou.aliyuncs.com/{namespace}/{image}:tag
```

## API 调用优化

### 使用代理

```typescript
// 使用 HTTP 代理
const agent = new HttpsProxyAgent('http://127.0.0.1:7890');

const response = await fetch('https://api.example.com', {
  agent: agent,
});
```

### 重试机制

```typescript
async function fetchWithRetry(url: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * (i + 1)); // 指数退避
    }
  }
}
```

### 超时设置

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);

try {
  const response = await fetch(url, {
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('请求超时');
  }
}
```

## 常用镜像列表

### GitHub 文件

- `https://fastly.jsdelivr.net/gh/`
- `https://ghproxy.com/`

### npm 包

- `https://registry.npmmirror.com`
- `https://registry.npm.taobao.org`

### Docker 镜像

- `https://docker.mirrors.ustc.edu.cn`
- `https://hub-mirror.c.163.com`
- `https://mirror.ccs.tencentyun.com`

## 故障排查

### 问题：镜像也无法访问

**解决方案**：
1. 检查本地网络
2. 尝试使用 VPN
3. 更换镜像源

### 问题：速度仍然很慢

**解决方案**：
1. 检查网络带宽
2. 尝试其他镜像
3. 使用下载工具（如 aria2）

### 问题：SSL 证书错误

**解决方案**：
1. 更换 HTTPS 镜像
2. 禁用 SSL 验证（不推荐）
3. 安装最新证书

## 工具推荐

### 下载工具

```bash
# aria2 - 多线程下载
aria2c -x 16 -s 16 [URL]

# axel - 进度显示
axel [URL]

# wget - 断点续传
wget -c [URL]
```

### Git 工具

```bash
# ghproxy-cli
npm install -g ghproxy-cli

# 使用
ghproxy https://github.com/{owner}/{repo}
```

## 最佳实践

1. **优先使用镜像**
   - 配置 npm 镜像
   - 使用 GitHub CDN
   - 配置 Docker 镜像

2. **合理设置超时**
   - 连接超时：30 秒
   - 读取超时：60 秒
   - 总超时：120 秒

3. **实现重试机制**
   - 自动重试
   - 指数退避
   - 最大重试次数：3-5 次

4. **监控和日志**
   - 记录网络错误
   - 监控请求时间
   - 统计成功率
