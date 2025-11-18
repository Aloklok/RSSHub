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
    parameters: { id: '话题ID，如architecture、AI&amp;LLM' },
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
    const baseUrl = 'https://www.infoq.cn';
    const topicUrl = `${baseUrl}/topic/${topicId}`;

    logger.info(`[InfoQ] 抓取话题页: ${topicUrl}`);

    const response = await ofetch(topicUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
    });

    const $ = load(response, { xmlMode: false });

    // 核心修复：双选择器兼容策略
    // 优先尝试新结构，再回退到旧结构
    const selectors = [
        { name: '新结构', selector: 'div.article-list div.list > div.article-item' },
        { name: '旧结构', selector: 'div.topic_div' },
        { name: '通用结构', selector: '[class*="article-item"]' }
    ];

    let articles: any[] = [];
    let usedSelector = '';

    for (const { name, selector } of selectors) {
        const elements = $(selector);
        if (elements.length > 0) {
            logger.info(`[InfoQ] 使用${name}: ${selector} (找到${elements.length}个)`);
            articles = elements.toArray();
            usedSelector = selector;
            break;
        }
    }

    if (articles.length === 0) {
        logger.error(`[InfoQ] 所有选择器均失败`);
        throw new Error(`话题 "${topicId}" 未找到文章`);
    }

    // 根据使用的选择器采用不同的解析策略
    const list = articles
        .map((item) => {
            const $item = $(item);
            
            // 新结构解析
            if (usedSelector.includes('article-item')) {
                const $link = $item.find('a.com-article-title').first();
                const href = $link.attr('href');
                const title = $link.find('span').first().text().trim();
                if (!title || !href) return null;

                const authorText = $item.find('p.editor').text().trim();
                const dateMatch = authorText.match(/\d{4}-\d{2}-\d{2}/);
                
                return {
                    title,
                    link: href.trim(),
                    pubDate: dateMatch ? parseDate(dateMatch[0]) : new Date(),
                    guid: href.split('/').pop() || href,
                };
            } 
            // 旧结构解析
            else {
                const $link = $item.find('a[href]');
                const href = $link.attr('href');
                const title = $item.find('h2').text().trim();
                if (!title || !href) return null;

                return {
                    title,
                    link: href.trim(),
                    pubDate: parseDate($item.find('span.date').text().trim()),
                    guid: $item.attr('data-articleid'),
                };
            }
        })
        .filter(Boolean);

    if (list.length === 0) {
        throw new Error(`话题 "${topicId}" 解析后无有效文章`);
    }

    logger.info(`[InfoQ] 解析到 ${list.length} 篇文章`);

    // 详情页抓取（保持不变）
    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                try {
                    const absoluteLink = item.link.startsWith('http') 
                        ? item.link 
                        : `${baseUrl}${item.link}`;
                    
                    const detailResponse = await ofetch(absoluteLink, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                    });
                    
                    const $detail = load(detailResponse, { xmlMode: false });
                    
                    const content = $detail('.ProseMirror').html() || 
                                  $detail('div.article-content').html() || 
                                  '<p>内容提取失败</p>';
                    
                    const author = $detail('p.author-detail').text().trim() || undefined;
                    
                    return {
                        ...item,
                        link: absoluteLink,
                        description: content,
                        author,
                    };
                } catch (error) {
                    logger.error(`[InfoQ] 详情页失败: ${error.message}`);
                    return null;
                }
            })
        )
    );

    const validItems = items.filter(Boolean);

    return {
        title: `InfoQ - ${topicId}`,
        link: topicUrl,
        description: `InfoQ话题: ${topicId} (${validItems.length}篇文章)`,
        item: validItems,
    };
}