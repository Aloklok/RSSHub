// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';

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
                // 先用列表页的摘要作为临时 description
                description: item.find('p.blog-card-desc').text().trim(),
            };
        });

    // 【重要优化】使用 for...of 循环代替 Promise.all，将并行请求改为串行请求
    // 这样可以避免因瞬间请求过多而被目标网站屏蔽
    const items = [];
    for (const item of list) {
        const cachedItem = await cache.tryGet(item.link, async () => {
            logger.debug(`Fetching full content for: ${item.link}`);
            try {
                const detailResponse = await ofetch(item.link, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                    },
                });
                const content = load(detailResponse);
                const fullText = content('div.article-inner').html();
                
                if (fullText) {
                    item.description = fullText; // 如果获取到全文，就替换掉临时摘要
                }
            } catch (error) {
                logger.error(`Failed to fetch article detail for ${item.link}: ${error.message}`);
                // 如果获取失败，item.description 依然是列表页的摘要，不会为空
            }
            return item;
        });
        items.push(cachedItem);
    }

    return {
        title: '阿里云开发者社区 - 技术博客',
        link: currentUrl,
        description: '阿里云开发者社区的技术博客，分享云计算、大数据、人工智能等前沿技术。',
        item: items,
    };
}