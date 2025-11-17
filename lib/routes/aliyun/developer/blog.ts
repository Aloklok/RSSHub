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
                    await sleep(Math.random() * 1500 + 500);

                    const detailResponse = await ofetch(item.link);
                    const scriptMatch = detailResponse.match(/GLOBAL_CONFIG\.larkContent = '(.*?)';/s);

                    if (scriptMatch && scriptMatch[1]) {
                        const rawContent = scriptMatch[1]; // 获取最原始的字符串

                        try {
                            // 我们依然尝试之前的净化流程
                            let content = rawContent.replace(/\\'/g, "'");
                            content = JSON.parse(`"${content}"`);
                            content = decode(content);
                            item.description = content;
                        } catch (e) {
                            // 【法医取证】如果净化失败，打印出最原始的、导致失败的字符串！
                            logger.error(`[Aliyun Blog - FORENSIC] JSON parsing failed for: ${item.link}`);
                            logger.error(`[Aliyun Blog - FORENSIC] Error message: ${e.message}`);
                            logger.error(`[Aliyun Blog - FORENSIC] RAW STRING THAT FAILED:`);
                            logger.error(rawContent); // 打印完整的原始物证
                        }
                    }
                } catch (error) {
                    logger.error(`[Aliyun Blog] Top-level error for ${item.link}: ${error.message}. Falling back to summary.`);
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