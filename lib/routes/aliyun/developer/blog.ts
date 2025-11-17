// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
import puppeteer from '@/utils/puppeteer';

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

// 【重要调试】定义一个函数来获取单个文章的全文
async function getFullContent(item) {
    return await cache.tryGet(item.link, async () => {
        const browser = await puppeteer();
        const page = await browser.newPage();
        
        logger.info(`[Aliyun Blog] Puppeteer starting for: ${item.link}`);
        try {
            await page.goto(item.link, {
                waitUntil: 'domcontentloaded',
            });
            logger.info(`[Aliyun Blog] Page loaded for: ${item.link}`);

            await page.waitForSelector('div.article-inner div.lake-engine-view', { timeout: 30000 });
            logger.info(`[Aliyun Blog] Selector found for: ${item.link}`);

            const html = await page.content();
            const content = load(html);

            const fullText = content('div.article-inner').html();
            if (fullText) {
                item.description = fullText;
                logger.info(`[Aliyun Blog] Full content fetched successfully for: ${item.link}`);
            } else {
                logger.warn(`[Aliyun Blog] Full content is empty for: ${item.link}`);
            }
        } catch (error) {
            logger.error(`[Aliyun Blog] Puppeteer failed for ${item.link}: ${error.message}`);
        } finally {
            await page.close();
            await browser.close();
            logger.info(`[Aliyun Blog] Puppeteer closed for: ${item.link}`);
        }
        
        return item;
    });
}


async function handler() {
    logger.info('[Aliyun Blog] Route started');
    const rootUrl = 'https://developer.aliyun.com';
    const currentUrl = `${rootUrl}/blog`;

    const response = await ofetch(currentUrl);
    const $ = load(response);
    logger.info('[Aliyun Blog] List page fetched');

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
    
    logger.info(`[Aliyun Blog] Found ${list.length} items in list page`);

    // 【重要调试】将 Promise.all 拆成串行循环，并增加大量日志
    const items = [];
    for (const item of list) {
        logger.info(`[Aliyun Blog] Processing item: ${item.title}`);
        const detailedItem = await getFullContent(item);
        items.push(detailedItem);
        logger.info(`[Aliyun Blog] Finished processing item: ${item.title}`);
    }

    logger.info('[Aliyun Blog] All items processed, returning result');
    return {
        title: '阿里云开发者社区 - 技术博客6.0',
        link: currentUrl,
        description: '阿里云开发者社区的技术博客，分享云计算、大数据、人工智能等前沿技术。',
        item: items,
    };
}