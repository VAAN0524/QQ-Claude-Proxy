"""
搜索最新AI科技资讯
"""
from playwright.sync_api import sync_playwright
import json

search_keywords = "最新AI科技资讯 2026 人工智能 ChatGPT Claude"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # 访问百度搜索
    print(f"搜索: {search_keywords}")
    page.goto(f'https://www.baidu.com/s?wd={search_keywords}')
    page.wait_for_timeout(3000)

    # 截图查看结果
    page.screenshot(path='C:/Test/bot/workspace/search_results.png', full_page=True)

    # 提取搜索结果
    try:
        results = page.locator('.c-container').all()
        print(f"\n找到 {len(results)} 个结果")

        for i, result in enumerate(results[:10]):
            try:
                title = result.locator('.c-container .t').first.inner_text() if result.locator('.c-container .t').count() > 0 else ""
                link = result.locator('a').first.get_attribute('href') if result.locator('a').count() > 0 else ""
                snippet = result.locator('.c-abstract').first.inner_text() if result.locator('.c-abstract').count() > 0 else ""

                print(f"\n{i+1}. {title}")
                print(f"   链接: {link}")
                if snippet:
                    print(f"   摘要: {snippet[:100]}...")
            except:
                pass
    except Exception as e:
        print(f"提取结果时出错: {e}")

    browser.close()
    print("\n截图已保存到: C:/Test/bot/workspace/search_results.png")
