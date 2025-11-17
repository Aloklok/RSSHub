// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
import puppeteer from '@/utils/puppeteer'; // 引入 Puppeteer

export const route: Route = {
    path: '/developer/blog',
    categories: ['programming', 'cloud-computing'],
    example: '/aliyun/developer/blog',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: true, // 明确需要 Puppeteer
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

    // 1. 获取列表页
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

    // 2. 【性能优化】只启动一次浏览器实例
    let browser;
    try {
        logger.info('[Aliyun Blog DEBUG] ---> Step 1: About to call puppeteer()');
        browser = await puppeteer();
        logger.info('[Aliyun Blog DEBUG] ---> Step 2: puppeteer() successful. Browser instance created.');

        // 3. 并发处理所有文章
        const items = await Promise.all(
            list.map((item) =>
                cache.tryGet(item.link, async () => {
                    let page;
                    try {
                        logger.info(`[Aliyun Blog DEBUG] ------> Step 3: Creating new page for "${item.title}"`);
                        page = await browser.newPage();

                        logger.info(`[Aliyun Blog DEBUG] ------> Step 4: Setting up request interception for "${item.title}"`);
                        await page.setRequestInterception(true);
                        page.on('request', (request) => {
                            if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
                                request.abort();
                            } else {
                                request.continue();
                            }
                        });

                        logger.info(`[Aliyun Blog DEBUG] ------> Step 5: Navigating to ${item.link}`);
                        await page.goto(item.link, { waitUntil: 'networkidle0', timeout: 60000 }); // 等待网络空闲，超时延长到60秒

                        logger.info(`[Aliyun Blog DEBUG] ------> Step 6: Waiting for selector on ${item.link}`);
                        await page.waitForSelector('div.article-inner div.lake-engine-view p', { timeout: 30000 });

                        logger.info(`[Aliyun Blog DEBUG] ------> Step 7: Extracting content from ${item.link}`);
                        const html = await page.content();
                        const content = load(html);
                        const fullText = content('div.article-inner').html();

                        if (fullText) {
                            item.description = fullText;
                        }
                    } catch (error) {
                        logger.error(`[Aliyun Blog DEBUG] !!! CRITICAL ERROR for "${item.title}": ${error.message}`);
                    } finally {
                        if (page) {
                            await page.close();
                            logger.info(`[Aliyun Blog DEBUG] ------> Step 8: Page closed for "${item.title}"`);
                        }
                    }
                    return item;
                })
            )
        );

        return {
            title: '阿里云开发者社区 - 技术博客 (Puppeteer Debug)',
            link: currentUrl,
            description: '阿里云开发者社区的技术博客，分享云计算、大数据、人工智能等前沿技术。',
            item: items,
        };
    } catch (error) {
        logger.error(`[Aliyun Blog DEBUG] !!! CATASTROPHIC FAILURE: Could not even start the browser or process items: ${error.message}`);
        // 如果连浏览器都启动失败，抛出一个错误让 RSSHub 显示
        throw new Error(`Catastrophic failure in Puppeteer process: ${error.message}`);
    } finally {
        if (browser) {
            await browser.close();
            logger.info('[Aliyun Blog DEBUG] ---> Step 9: Final browser instance closed.');
        }
    }
}