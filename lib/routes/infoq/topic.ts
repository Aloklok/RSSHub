// 文件路径: lib/routes/infoq/topic.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';

export const route: Route = {
    path: '/topic/:id',
    categories: ['programming'],
    example: '/infoq/topic/architecture',
    parameters: { id: '话题ID，可在话题页URL中找到' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '话题',
    maintainers: ['your-name'],
    handler,
};

async function handler(ctx) {
    const topicId = ctx.req.param('id');
    const baseUrl = 'https://www.infoq.com';
    const topicUrl = `${baseUrl}/topic/${topicId}`;

    const response = await ofetch(topicUrl);
    const $ = load(response);

    const list = $('div.topic_div')
        .toArray()
        .map((item) => {
            const $item = $(item);
            const $link = $item.find('a[href]');
            const href = $link.attr('href');
            const title = $item.find('h2').text().trim();
            
            return {
                title,
                // 关键修复1：确保link始终为字符串，避免undefined
                link: typeof href === 'string' ? href.trim() : '',
                pubDate: parseDate($item.find('span.date').text().trim()),
                guid: $item.attr('data-articleid'),
            };
        })
        // 关键修复2：过滤掉无效链接
        .filter((item) => item.link && item.link.length > 0);

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                try {
                    // 关键修复3：确保link是字符串后再调用startsWith
                    const absoluteLink = item.link.startsWith('http') 
                        ? item.link 
                        : `${baseUrl}${item.link}`;
                    
                    const detailResponse = await ofetch(absoluteLink);
                    const $detail = load(detailResponse);
                    
                    // 提取正文内容
                    const content = $detail('div.article-content').html() || '';
                    
                    return {
                        ...item,
                        link: absoluteLink,
                        description: content,
                    };
                } catch (error) {
                    logger.error(`[InfoQ] 抓取失败 ${item.guid}: ${error.message}`);
                    return null; // 返回null以便后续过滤
                }
            })
        )
    );

    // 关键修复4：过滤掉抓取失败的项目
    const validItems = items.filter(Boolean);

    if (validItems.length === 0) {
        throw new Error('未能获取到有效内容，请检查话题ID是否正确或原始站点是否可访问');
    }

    return {
        title: `InfoQ - ${topicId}`,
        link: topicUrl,
        description: `InfoQ topic: ${topicId}`,
        item: validItems,
    };
}