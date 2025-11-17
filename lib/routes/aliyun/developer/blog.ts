// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { decode } from 'entities';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';

// 随机延迟函数，模拟人类行为，避免被限流
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const route: Route = {
    path: '/developer/blog',
    categories: ['programming', 'cloud-computing'],
    example: '/aliyun/developer/blog',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false, // 确认不需要 Puppeteer
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
                description: item.find('p.blog-card-desc').text().trim(), // 先用列表页的摘要作为临时 description
            };
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                try {
                    // 增加随机延迟，避免被服务器限流
                    await sleep(Math.random() * 1500 + 500); // 随机等待 0.5-2 秒

                    const detailResponse = await ofetch(item.link, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                        },
                    });
                    
                    // 用正则表达式精确提取 larkContent 的内容
                    const scriptMatch = detailResponse.match(/GLOBAL_CONFIG\.larkContent = '(.*?)';/s);

                    if (scriptMatch && scriptMatch[1]) {
                        let content = scriptMatch[1];

                        // 【最终修复方案】三步净化法
                        // 1. 预处理：修复不符合 JSON 规范的转义字符，比如 \'
                        content = content.replace(/\\'/g, "'");

                        // 2. 核心解码：手动包装成 JSON 字符串，然后用 JSON.parse 处理所有合法的 JS 转义
                        content = JSON.parse(`"${content}"`);

                        // 3. 后处理：解码可能存在的 HTML 实体，比如 &lt;
                        content = decode(content);
                        
                        item.description = content;
                    }
                } catch (error) {
                    logger.error(`[Aliyun Blog] Failed to parse content for ${item.link}: ${error.message}. Falling back to summary.`);
                    // 如果解析失败，item.description 依然是列表页的摘要，不会为空
                }
                return item;
            })
        )
    );

    return {
        title: '阿里云开发者社区 - 技术博客',
        link: currentUrl,
        description: '阿里云开发者社区的技术博客，分享云计算、大数据、人工智能等前沿技术。',
        item: items,
    };
}