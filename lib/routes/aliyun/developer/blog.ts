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

    // 【最终优化】只启动一次浏览器实例，大幅提升性能
    const browser = await puppeteer();

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const page = await browser.newPage(); // 每个任务只创建一个新页面
                
                await page.setRequestInterception(true);
                page.on('request', (request) => {
                    if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
                        request.abort();
                    } else {
                        request.continue();
                    }
                });

                try {
                    await page.goto(item.link, {
                        waitUntil: 'domcontentloaded',
                    });

                    await page.waitForSelector('div.article-inner div.lake-engine-view', { timeout: 30000 });

                    const html = await page.content();
                    const content = load(html);

                    const fullText = content('div.article-inner').html();
                    if (fullText) {
                        item.description = fullText; // 直接修改 item 的 description
                    }
                } catch (error) {
                    logger.error(`[Aliyun Blog] Puppeteer failed for ${item.link}: ${error.message}. Falling back to summary.`);
                } finally {
                    await page.close(); // 只关闭页面，不关闭浏览器
                }
                
                return item; // 返回修改后的 item
            })
        )
    );

    await browser.close(); // 所有任务完成后，关闭浏览器实例

    return {
        title: '阿里云开发者社区 - 技术博客v8',
        link: currentUrl,
        description: '阿里云开发者社区的技术博客，分享云计算、大数据、人工智能等前沿技术。',
        item: items,
    };
}