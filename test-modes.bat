@echo off
REM 模式对比测试脚本

echo ========================================
echo   模式对比测试
echo ========================================
echo.
echo 这个脚本将测试三种模式的效果:
echo   1. CLI 模式    - Claude Code CLI
echo   2. Team 模式   - GLM Coordinator + Agents
echo   3. Simple 模式 - 极简协调 Agent
echo.
echo ========================================
echo.

REM 检查 tsx 是否可用
where tsx >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] tsx 未安装，正在安装...
    npm install -g tsx
)

REM 运行测试
echo [运行测试] 执行模式对比测试...
tsx scripts/test-modes.ts

REM 查看报告
echo.
echo [完成] 测试报告已保存到 docs/mode-comparison-report.md
echo.
echo ========================================
echo   快速切换模式命令:
echo ========================================
echo.
echo   /mode cli      - 切换到 CLI 模式
echo   /mode team     - 切换到团队模式
echo   /mode simple   - 切换到简单模式
echo.

pause
