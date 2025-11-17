// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
import puppeteer from '@/utils/puppeteer'; // 重新使用官方推荐的 puppeteer 工具

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

    logger.info(`[Aliyun Blog DEBUG] Found ${list.length} items. Preparing Puppeteer.`);

    // 【最终方案】只启动一次浏览器实例，串行处理每个页面，以最大限度保证稳定性和避免内存溢出
    const browser = await puppeteer();
    logger.info('[Aliyun Blog DEBUG] ---> Browser instance created successfully.');

    const items = [];
    for (const item of list) {
        logger.info(`[Aliyun Blog DEBUG] ------> Processing item: "${item.title}"`);
        const cachedItem = await cache.tryGet(item.link, async () => {
            let page;
            try {
                logger.info(`[Aliyun Blog DEBUG] ---------> Creating new page for "${item.title}"`);
                page = await browser.newPage();

                logger.info(`[Aliyun Blog DEBUG] ---------> Setting up request interception.`);
                await page.setRequestInterception(true);
                page.on('request', (request) => {
                    if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
                        request.abort();
                    } else {
                        request.continue();
                    }
                });

                logger.info(`[Aliyun Blog DEBUG] ---------> Navigating to ${item.link}`);
                await page.goto(item.link, {
                    waitUntil: 'networkidle0', // 等待网络空闲，确保JS执行完毕
                    timeout: 60000,
                });

                logger.info(`[Aliyun Blog DEBUG] ---------> Waiting for selector on ${item.link}`);
                await page.waitForSelector('div.article-inner div.lake-engine-view p', { timeout: 30000 });

                logger.info(`[Aliyun Blog DEBUG] ---------> Extracting content from ${item.link}`);
                const html = await page.content();
                const content = load(html);
                const fullText = content('div.article-inner').html();

                if (fullText && fullText.trim().length > 0) {
                    item.description = fullText;
                    logger.info(`[Aliyun Blog DEBUG] ---------> Full content extracted for "${item.title}"`);
                } else {
                    logger.warn(`[Aliyun Blog DEBUG] ---------> Full content was empty for "${item.title}"`);
                }
            } catch (error) {
                logger.error(`[Aliyun Blog DEBUG] !!! CRITICAL ERROR for "${item.title}": ${error.message}`);
            } finally {
                if (page) {
                    await page.close();
                    logger.info(`[Aliyun Blog DEBUG] ---------> Page closed for "${item.title}"`);
                }
            }
            return item;
        });
        items.push(cachedItem);
    }

    await browser.close();
    logger.info('[Aliyun Blog DEBUG] ---> Final browser instance closed.');

    logger.info('[Aliyun Blog DEBUG] All items processed. Returning final feed.');
    return {
        title: '阿里云开发者社区 - 技术博客 (Puppeteer Final Debug)',
        link: currentUrl,
        description: '阿里云开发者社区的技术博客，分享云计算、大数据、人工智能等前沿技术。',
        item: items,
    };
}