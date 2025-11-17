// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
import { art } from '@/utils/render'; // 确保 art 模板工具被引入
import * as path from 'node:path'; // 确保 path 被引入

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const route: Route = {
    // ... (你路由的其他定义保持不变) ...
    path: '/developer/blog',
    categories: ['programming', 'cloud-computing'],
    example: '/aliyun/developer/blog',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false, // 明确不需要 Puppeteer
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

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                logger.debug(`Fetching full content for: ${item.link}`);
                try {
                    // [反爬优化] 随机休眠 1 到 4 秒
                    await sleep(Math.random() * 3000 + 1000); 

                    const detailResponse = await ofetch(item.link, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                        },
                    });
                    const content = load(detailResponse);
                    
                    // [核心修复] 在 script 标签中寻找 GLOBAL_CONFIG.larkContent
                    const scriptText = content('script')
                        .filter((i, el) => {
                            return content(el).html()?.includes('GLOBAL_CONFIG.larkContent') ?? false;
                        })
                        .html();
                    
                    // 使用正则表达式从 JS 变量中提取 HTML 内容
                    const regex = /GLOBAL_CONFIG\.larkContent = '(.*?)';/;
                    const match = scriptText?.match(regex);

                    if (match && match[1]) {
                        // 找到了！match[1] 就是那段完整的 HTML
                        // 注意：这里的内容是语雀的格式，我们用 art 模板渲染一下
                        // 这会把它包裹在一个 div.article-inner 中，和原网页结构一致
                        item.description = art(path.join(__dirname, 'templates/article-inner.art'), {
                            larkContent: match[1],
                        });
                    }
                    // 如果没找到，item.description 会保持为短描述

                } catch (error) {
                    logger.error(`Failed to fetch article detail for ${item.link}: ${error.message}`);
                }
                return item;
            })
        )
    );

    return {
        title: '阿里云开发者社区 - 技术博客 (no puppter)', // 你的标题
        link: currentUrl,
        description: '阿里云开发者社区的技术博客，分享云计算、大数据、人工智能等前沿技术。',
        item: items,
    };
}