// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { decode } from 'entities'; // 【重要】引入 HTML 实体解码库
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
        requirePuppeteer: false, // 我们不再需要 Puppeteer!
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

    const response = await ofetch(currentUrl);
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
                description: item.find('p.blog-card-desc').text().trim(),
            };
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                try {
                    // 增加随机延迟，避免被限流
                    await sleep(Math.random() * 2000 + 500); // 随机等待 0.5-2.5 秒

                    const detailResponse = await ofetch(item.link);
                    
                    // 1. 用正则表达式精确提取 larkContent 的内容
                    const scriptMatch = detailResponse.match(/GLOBAL_CONFIG\.larkContent = '(.*?)';/);

                    if (scriptMatch && scriptMatch[1]) {
                        let content = scriptMatch[1];

                        // 2. 【关键步骤】解码过程
                        // 这是一个两层编码的字符串，需要“反向”解码
                        
                        // 第一层：解码 JavaScript 字符串转义 (比如 \\' -> ', \\" -> ")
                        // JSON.parse 是一个绝佳的工具来做这件事
                        // 我们需要先把它变成一个合法的 JSON 字符串
                        content = JSON.parse(`"${content}"`);

                        // 第二层：解码 HTML 实体 (比如 &lt; -> <)
                        content = decode(content);
                        
                        item.description = content;
                    }
                } catch (error) {
                    logger.error(`[Aliyun Blog] Failed to fetch/parse content for ${item.link}: ${error.message}. Falling back to summary.`);
                }
                return item;
            })
        )
    );

    return {
        title: '阿里云开发者社区 - 技术博客 (No-Puppeteer Final)',
        link: currentUrl,
        description: '阿里云开发者社区的技术博客，分享云计算、大数据、人工智能等前沿技术。',
        item: items,
    };
}