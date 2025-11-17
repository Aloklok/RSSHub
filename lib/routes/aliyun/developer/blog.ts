// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
// 【终极武器】直接从 puppeteer-extra 导入，它会自动加载隐身插件
import puppeteer from 'puppeteer-extra';

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

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                let browser;
                try {
                    // 【关键改动】使用 puppeteer.launch() 启动一个带隐身插件的浏览器
                    browser = await puppeteer.launch({
                        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, // RSSHub Docker 镜像会设置好这个环境变量
                        headless: true,
                        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-infobars', '--window-size=1280,720'],
                    });
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

                    if (fullText && fullText.trim().length > 0) {
                        item.description = fullText;
                    }
                } catch (error) {
                    logger.error(`[Aliyun Blog] Puppeteer (stealth) failed for ${item.link}: ${error.message}`);
                } finally {
                    if (browser) {
                        await browser.close();
                    }
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