// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { decode } from 'entities';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const route: Route = {
    path: '/developer/blog',
    categories: ['programming', 'cloud-computing'],
    example: '/aliyun/developer/blog',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
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
                    await sleep(Math.random() * 1500 + 500); // 随机等待 0.5-2 秒

                    const detailResponse = await ofetch(item.link);
                    const scriptMatch = detailResponse.match(/GLOBAL_CONFIG\.larkContent = '(.*?)';/s); // 使用 s 标志以匹配换行符

                    if (scriptMatch && scriptMatch[1]) {
                        let content = scriptMatch[1];

                        // 【最终修复】三步净化法，保证解码正确
                        // 1. 修复不合法的 JSON 转义：将 \' 替换为 '
                        content = content.replace(/\\'/g, "'");

                        // 2. 使用 JSON.parse 来处理所有合法的 JS/JSON 转义 (如 \uXXXX, \n, \\, \")
                        content = JSON.parse(`"${content}"`);

                        // 3. 解码 HTML 实体 (如 &lt;, &gt;)
                        content = decode(content);
                        
                        item.description = content;
                    }
                } catch (error) {
                    logger.error(`[Aliyun Blog] Failed to parse content for ${item.link}: ${error.message}. Falling back to summary.`);
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