// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
import { art } from '@/utils/render'; // [新增] 导入 art 模板引擎
import * as path from 'node:path'; // [新增] 导入 path 模块

// [新增] 随机延迟函数
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const route: Route = {
    path: '/developer/blog',
    categories: ['programming', 'cloud-computing'],
    example: '/aliyun/developer/blog',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false, // [修改] 明确不需要 Puppeteer
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['developer.aliyun.com/blog'],
            target: '/developer/blog',
        },
    ],
    name: '开发者社区 - 技术博客',
    maintainers: ['Aloklok'],
    handler,
};

async function handler() {
    const rootUrl = 'https://developer.aliyun.com';
    const currentUrl = `${rootUrl}/blog`;

    // [优化] 抓取列表页时也带上 User-Agent
    const response = await ofetch(currentUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        },
    });
    const $ = load(response);

    const list = $('li.blog-home-main-box-card')
        .toArray()
        .map((item) => {
            item = $(item);
            const titleElement = item.find('a.blog-card-title');
            const link = titleElement.attr('href');

            return {
                title: titleElement.find('h2').text().trim(),
                link: link.startsWith('http') ? link : `${rootUrl}${link}`,
                author: item.find('a.blog-card-author-item').first().text().trim(),
                pubDate: parseDate(item.find('div.blog-card-time').text().trim()),
                description: item.find('p.blog-card-desc').text().trim(), // 先保留短描述作为后备
            };
        });

    // [优化] 使用 Promise.all 并行处理所有文章，性能远高于 for 循环
    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                logger.debug(`Fetching full content for: ${item.link}`);
                try {
                    // [优化] 使用 1 到 4 秒的随机延迟，有效防止反爬虫
                    await sleep(Math.random() * 3000 + 1000);

                    const detailResponse = await ofetch(item.link, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                        },
                    });

                    // [核心修复] 在 script 标签中寻找 GLOBAL_CONFIG.larkContent
                    // 我们不再关心 'div.article-inner'，因为我们知道它是空的
                    const scriptText = detailResponse.match(/GLOBAL_CONFIG\.larkContent = '(.*?)';/);

                    if (scriptText && scriptText[1]) {
                        // 找到了！scriptText[1] 就是那段完整的、被转义的 HTML 字符串
                        
                        // [注意] 从 JS 变量中提取的字符串是转义过的，但 art 模板的 '{{{' 会自动反转义
                        // 我们用模板把它包回 div.article-inner，使其与原网页结构一致
                        item.description = art(path.join(__dirname, 'templates/article-inner.art'), {
                            larkContent: scriptText[1],
                        });
                    }
                    // 如果没找到，item.description 会保持为短描述
                    
                } catch (error) {
                    logger.error(`[Aliyun Blog] ofetch failed for ${item.link}: ${error.message}. Falling back to summary.`);
                    // 失败时，item.description 保持为短描述
                }
                return item; // 无论成功失败，都返回 item
            })
        )
    );

    return {
        title: '阿里云开发者社区 - 技术博客 (nopuppteer)', // 你可以改成你想要的版本号
        link: currentUrl,
        description: '阿里云开发者社区的技术博客，分享云计算、大数据、人工智能等前沿技术。',
        item: items,
    };
}