// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
import { art } from '@/utils/render';
import * as path from 'node:path';
import config from '@/config'; // [修复] 导入全局 config

// 随机延迟函数
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const route: Route = {
    path: '/developer/blog',
    categories: ['programming', 'cloud-computing'],
    example: '/aliyun/developer/blog',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false, // 明确不需要 Puppeteer
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

    // 抓取列表页
    const response = await ofetch(currentUrl, {
        headers: {
            'User-Agent': config.ua, // [修复] 使用 config.ua
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
                description: item.find('p.blog-card-desc').text().trim(), // 先保留短描述作为后备
            };
        });

    // 使用 Promise.all 并行处理所有文章
    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                logger.debug(`Fetching full content for: ${item.link}`);
                try {
                    // [优化] 使用 1 到 4 秒的随机延迟，有效防止反爬虫
                    await sleep(Math.random() * 3000 + 1000);

                    const detailResponse = await ofetch(item.link, {
                        headers: {
                            'User-Agent': config.ua, // [修复] 使用 config.ua
                        },
                    });

                    // [核心] 使用正则表达式从 JS 变量中提取 HTML 内容
                    const scriptText = detailResponse.match(/GLOBAL_CONFIG\.larkContent = '(.*?)';/);

                    if (scriptText && scriptText[1]) {
                        
                        // [规范] 使用 art-template 渲染内容
                        item.description = art(path.join(__dirname, 'templates/article-inner.art'), {
                            larkContent: scriptText[1],
                        });
                    }
                    
                } catch (error) {
                    logger.error(`[Aliyun Blog] ofetch failed for ${item.link}: ${error.message}. Falling back to summary.`);
                }
                return item;
            })
        )
    );

    return {
        title: '阿里云开发者社区 - 技术博客 (nopuppteer)', // 你的版本号
        link: currentUrl,
        description: '阿里云开发者社区的技术博客，分享云计算、大数据、人工智能等前沿技术。',
        item: items,
    };
}