---
name: auto_error_resolver
description: 自动错误解决技能。使用此技能当遇到 TypeScript 编译错误、测试失败、运行时错误或需要系统化调试时。自动分析错误、定位根因、应用修复、验证结果。
---

# 自动错误解决技能

## 概述

此技能提供系统化的错误诊断和修复流程，支持 TypeScript 编译错误、测试失败、运行时错误等各种问题。

## 使用场景

- TypeScript 编译错误
- 测试失败
- 运行时错误
- API 调用失败
- 依赖问题

## 错误处理流程

### 阶段 1：错误信息收集

**编译错误**
```bash
# 获取详细错误信息
npx tsc --noEmit
```

**运行时错误**
```bash
# 查看日志
tail -n 50 logs/error.log
```

**API 错误**
```bash
# 查看 API 响应
curl -v https://api.example.com/endpoint
```

### 阶段 2：根因分析

1. **错误分类**
   - 类型错误
   - 导入错误
   - 配置错误
   - 依赖错误
   - 逻辑错误

2. **定位问题**
   - 查看错误堆栈
   - 检查相关代码
   - 分析依赖关系

3. **确定影响范围**
   - 单文件问题
   - 多文件影响
   - 系统级问题

### 阶段 3：应用修复

**类型错误修复**
```typescript
// 问题：类型不匹配
const value: string = getNumber();

// 修复：类型断言或转换
const value: string = String(getNumber());
// 或
const value: string = getNumber() as unknown as string;
```

**导入错误修复**
```typescript
// 问题：模块未找到
import { Something } from './module';

// 修复：检查路径、添加扩展名
import { Something } from './module.js';
// 或
import { Something } from './module/index.js';
```

**依赖问题修复**
```bash
# 安装缺失依赖
npm install missing-package
# 或
npm install --save-dev @types/package-name
```

### 阶段 4：验证结果

```bash
# 重新编译
npx tsc --noEmit

# 运行测试
npm test

# 启动服务
npm start
```

## 常见错误模式

### 1. 类型不匹配

**错误信息**: `Type 'X' is not assignable to type 'Y'`

**解决方案**:
- 检查类型定义
- 添加类型转换
- 修正接口定义

### 2. 属性不存在

**错误信息**: `Property 'X' does not exist on type 'Y'`

**解决方案**:
- 检查对象结构
- 添加类型定义
- 使用可选链 `?.`

### 3. 模块未找到

**错误信息**: `Cannot find module 'X'`

**解决方案**:
- 检查导入路径
- 安装缺失依赖
- 配置模块解析

### 4. Promise 未处理

**错误信息**: `Promise returned from function must be handled`

**解决方案**:
- 添加 `await`
- 使用 `.then()` / `.catch()`
- 添加 `void` 关键字

## 调试技巧

### 1. 日志输出

```typescript
console.log('Debug point 1:', variable);
console.error('Error details:', error);
console.table(dataArray);
```

### 2. 断点调试

```typescript
debugger; // 暂停执行
```

### 3. 条件日志

```typescript
if (process.env.DEBUG) {
  console.log('Debug info:', data);
}
```

## 最佳实践

1. **先理解后修复**
   - 不要盲目修改代码
   - 理解错误原因
   - 选择正确的修复方案

2. **最小改动原则**
   - 只修改必要的部分
   - 避免引入新问题
   - 保持代码简洁

3. **验证修复**
   - 重新编译/测试
   - 确认错误已解决
   - 检查是否有新错误

4. **记录经验**
   - 记录常见错误
   - 总结解决方案
   - 更新技能文档

## 错误预防

1. **使用 TypeScript**
   - 启用严格模式
   - 定义明确的类型
   - 避免 `any` 类型

2. **代码审查**
   - 定期审查代码
   - 使用 ESLint
   - 运行类型检查

3. **编写测试**
   - 单元测试
   - 集成测试
   - 端到端测试

4. **持续集成**
   - 自动化测试
   - 自动化构建
   - 早期发现问题
