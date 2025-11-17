// 文件路径: lib/routes/aliyun/developer/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { decode } from 'entities'; // [正确] 导入 'entities' 用于 HTML 解码
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
import { art } from '@/utils/render';
import path from 'node:path';

// 随机延迟函数
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

    // RSSHub 的 ofetch 包装器会自动处理 User-Agent
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
                logger.debug(`Fetching full content for: ${item.link}`);
                try {
                    await sleep(Math.random() * 3000 + 1000);
                    
                    const detailResponse = await ofetch(item.link);
                    const scriptText = detailResponse.match(/GLOBAL_CONFIG\.larkContent = '(.*?)';/);

                    if (scriptText && scriptText[1]) {
                        
                        // [修复] 开始：三步清理法
                        // 1. 将 JS 字符串字面量转换为 "JSON 安全" 的字符串
                        //    必须先转义 \，再转义 "
                        const safeJsonString = '"' + scriptText[1].replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

                        // 2. 用 JSON.parse "反转义" JavaScript 字符串 (处理 \uXXXX, \', \n 等)
                        const unescapedJsString = JSON.parse(safeJsonString);
                        
                        // 3. 用 entities.decode "反转义" HTML 实体 (处理 &lt;, &gt;, &quot; 等)
                        const cleanedHtml = decode(unescapedJsString);

                        item.description = art(path.join(__dirname, 'templates/article-inner.art'), {
                            larkContent: cleanedHtml, // 传入最终清理后的 HTML
                        });
                    }
                    
                } catch (error) {
                    // 现在的 error 会是 "Bad escaped character in JSON..."
                    logger.error(`[Aliyun Blog] ofetch failed for ${item.link}: ${error.message}. Falling back to summary.`);
                }
                return item;
            })
        )
    );

    return {
        title: '阿里云开发者社区 - 技术博客 (nopuppteer)', 
        link: currentUrl,
        description: '阿里云开发者社区的技术博客，分享云计算、大数据、人工智能等前沿技术。',
        item: items,
    };
}