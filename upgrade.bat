@echo off
REM ========================================
REM QQ-Claude-Proxy 一键升级脚本
REM ========================================

chcp 65001 >nul 2>&1
echo.
echo ========================================
echo    QQ-Claude-Proxy 升级向导
echo ========================================
echo.

REM 1. 获取最新代码
echo [1/5] 获取最新代码...
git fetch origin
if errorlevel 1 (
    echo [错误] Git fetch 失败，请检查网络连接
    pause
    exit /b 1
)
git pull origin main
if errorlevel 1 (
    echo [警告] Git pull 可能有冲突，请手动解决
    pause
)
echo [完成] 代码已更新
echo.

REM 2. 检查并安装依赖
echo [2/5] 检查依赖...

REM 检查 mcporter
where mcporter >nul 2>&1
if errorlevel 1 (
    echo [安装] mcporter...
    npm install -g mcporter
    if errorlevel 1 (
        echo [警告] mcporter 安装失败，请手动安装: npm install -g mcporter
    ) else (
        echo [完成] mcporter 已安装
    )
) else (
    echo [跳过] mcporter 已安装
)

REM 检查 yt-dlp (尝试多种方式)
where yt-dlp >nul 2>&1
if errorlevel 1 (
    echo [安装] yt-dlp...
    REM 尝试 pip
    pip install yt-dlp --quiet
    if errorlevel 1 (
        REM 尝试 pip3
        pip3 install yt-dlp --quiet
        if errorlevel 1 (
            REM 尝试 python -m pip
            python -m pip install yt-dlp --quiet
            if errorlevel 1 (
                echo [警告] yt-dlp 安装失败，请手动安装: pip install yt-dlp
            ) else (
                echo [完成] yt-dlp 已安装 (python -m pip)
            )
        ) else (
            echo [完成] yt-dlp 已安装 (pip3)
        )
    ) else (
        echo [完成] yt-dlp 已安装 (pip)
    )
) else (
    echo [跳过] yt-dlp 已安装
)
echo.

REM 3. 更新 .env 配置
echo [3/5] 更新 .env 配置...

REM 检查 .env 是否存在 Agent Reach 配置
findstr /C:"AGENT_REACH_MCPORTER_PATH" .env >nul 2>&1
if errorlevel 1 (
    echo [添加] Agent Reach 配置到 .env...
    (
        echo.
        echo # Agent Reach 配置
        echo AGENT_REACH_MCPORTER_PATH=mcporter
        echo AGENT_REACH_YTDLP_PATH=yt-dlp
        echo AGENT_REACH_ENABLE_SOCIAL=true
    ) >> .env
    echo [完成] .env 已更新
) else (
    echo [跳过] .env 已包含 Agent Reach 配置
)
echo.

REM 4. 创建配置文件
echo [4/5] 创建配置文件...

REM 确保 config 目录存在
if not exist "config" mkdir config

REM 创建 agent-reach.json
echo {> config\agent-reach.json
echo   "version": "1.0.0",>> config\agent-reach.json
echo   "mcporter": {>> config\agent-reach.json
echo     "configured": true,>> config\agent-reach.json
echo     "path": "mcporter",>> config\agent-reach.json
echo     "servers": ["exa"]>> config\agent-reach.json
echo   },>> config\agent-reach.json
echo   "ytDlp": {>> config\agent-reach.json
echo     "installed": true,>> config\agent-reach.json
echo     "path": "yt-dlp">> config\agent-reach.json
echo   }>> config\agent-reach.json
echo }>> config\agent-reach.json
echo [完成] config\agent-reach.json 已创建

REM 创建 mcporter.json
echo {> config\mcporter.json
echo   "exa": "https://mcp.exa.ai/mcp">> config\mcporter.json
echo }>> config\mcporter.json
echo [完成] config\mcporter.json 已创建
echo.

REM 5. 重新编译
echo [5/5] 重新编译项目...
call npm run build
if errorlevel 1 (
    echo [警告] 编译失败，请检查错误信息
) else (
    echo [完成] 编译成功
)
echo.

echo ========================================
echo    升级完成！
echo ========================================
echo.
echo 运行以下命令启动服务:
echo   npm start
echo.
echo 或者使用快速启动:
echo   quick-start.bat
echo.
pause
