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

    // 【最终修复】使用 for...of 串行循环，一次只处理一篇文章，避免内存爆炸
    const items = [];
    for (const item of list) {
        const cachedItem = await cache.tryGet(item.link, async () => {
            let browser;
            try {
                browser = await puppeteer();
                const page = await browser.newPage();

                await page.setRequestInterception(true);
                page.on('request', (request) => {
                    if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
                        request.abort();
                    } else {
                        request.continue();
                    }
                });

                await page.goto(item.link, { waitUntil: 'networkidle0', timeout: 60000 });
                await page.waitForSelector('div.article-inner div.lake-engine-view p', { timeout: 30000 });

                const html = await page.content();
                const content = load(html);
                const fullText = content('div.article-inner').html();

                if (fullText) {
                    item.description = fullText;
                }
            } catch (error) {
                logger.error(`[Aliyun Blog] Puppeteer failed for ${item.link}: ${error.message}. Falling back to summary.`);
            } finally {
                if (browser) {
                    await browser.close();
                }
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