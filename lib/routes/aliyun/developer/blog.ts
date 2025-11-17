// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
// 【重要升级】我们不再直接使用 puppeteer，而是使用一个更强大的封装
import { puppeteerGet } from '@/utils/puppeteer-utils';

export const route: Route = {
    path: '/developer/blog',
    categories: ['programming', 'cloud-computing'],
    example: '/aliyun/developer/blog',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: true,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '开发者社区 - 技术博客',
    maintainers: ['Aloklok'],
    handler,
};

async function handler() {
    logger.info('[Aliyun Blog DEBUG] Route handler started.');
    const rootUrl = 'https://developer.aliyun.com';
    const currentUrl = `${rootUrl}/blog`;

    const response = await ofetch(currentUrl);
    const $ = load(response);
    logger.info('[Aliyun Blog DEBUG] List page fetched successfully.');

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

    logger.info(`[Aliyun Blog DEBUG] Found ${list.length} items. Starting to process one by one.`);

    const items = [];
    for (const item of list) {
        const cachedItem = await cache.tryGet(item.link, async () => {
            try {
                logger.info(`[Aliyun Blog DEBUG] ---> Step 1: About to call puppeteerGet for "${item.title}"`);
                
                // 【重要升级】使用 puppeteerGet，它内置了反-反爬虫能力
                const detailHtml = await puppeteerGet(item.link, {
                    // 我们可以在这里传入 puppeteer 的 launch 和 goto 选项
                    waitUntil: 'networkidle0',
                    timeout: 60000,
                });
                logger.info(`[Aliyun Blog DEBUG] ---> Step 2: puppeteerGet successful for "${item.title}"`);

                const content = load(detailHtml);
                const fullText = content('div.article-inner').html();

                if (fullText && fullText.trim().length > 0) {
                    item.description = fullText;
                    logger.info(`[Aliyun Blog DEBUG] ---> Step 3: Full content extracted for "${item.title}"`);
                } else {
                    logger.warn(`[Aliyun Blog DEBUG] ---> Step 3: Full content was empty for "${item.title}"`);
                }
            } catch (error) {
                logger.error(`[Aliyun Blog DEBUG] !!! CRITICAL ERROR for "${item.title}": ${error.message}`);
            }
            return item;
        });
        items.push(cachedItem);
    }

    logger.info('[Aliyun Blog DEBUG] All items processed. Returning final feed.');
    return {
        title: '阿里云开发者社区 - 技术博客 (Puppeteer Real Browser Debug)',
        link: currentUrl,
        description: '阿里云开发者社区的技术博客，分享云计算、大数据、人工智能等前沿技术。',
        item: items,
    };
}