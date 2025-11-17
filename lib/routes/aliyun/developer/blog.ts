// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
import puppeteer from '@/utils/puppeteer'; // 【重要】引入 Puppeteer

export const route: Route = {
    path: '/developer/blog',
    categories: ['programming', 'cloud-computing'],
    example: '/aliyun/developer/blog',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: true, // 【重要】告诉 RSSHub 这个路由需要浏览器环境
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

    // 列表页内容是静态的，用 ofetch 速度更快
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
                description: item.find('p.blog-card-desc').text().trim(), // 先用摘要填充
            };
        });

    // 【重要改动】使用 Puppeteer 获取全文
    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                // 启动一个浏览器页面
                const browser = await puppeteer();
                const page = await browser.newPage();
                
                logger.debug(`Puppeteer navigating to: ${item.link}`);
                try {
                    // 访问文章链接
                    await page.goto(item.link, {
                        waitUntil: 'domcontentloaded', // 等待基本DOM加载完成
                    });

                    // 等待正文容器被JS填充好，设置30秒超时
                    await page.waitForSelector('div.article-inner div.lake-engine-view', { timeout: 30000 });

                    // 获取最终渲染好的页面HTML
                    const html = await page.content();
                    const content = load(html);

                    const fullText = content('div.article-inner').html();
                    if (fullText) {
                        item.description = fullText;
                    }
                } catch (error) {
                    logger.error(`Puppeteer failed for ${item.link}: ${error.message}`);
                } finally {
                    // 关闭页面和浏览器
                    await page.close();
                    await browser.close();
                }
                
                return item;
            })
        )
    );

    return {
        title: '阿里云开发者社区 - 技术博客5.0',
        link: currentUrl,
        description: '阿里云开发者社区的技术博客，分享云计算、大数据、人工智能等前沿技术。',
        item: items,
    };
}