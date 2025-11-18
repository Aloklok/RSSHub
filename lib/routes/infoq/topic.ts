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
    parameters: { id: '话题ID，可以是slug（如architecture）或数字ID' },
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
    const baseUrl = 'https://www.infoq.cn'; // 修复：使用infoq.cn域名
    const topicUrl = `${baseUrl}/topic/${topicId}`;

    logger.info(`[InfoQ] 开始抓取话题: ${topicUrl}`);

    // 修复1: 捕获404等HTTP错误
    let response;
    try {
        response = await ofetch(topicUrl);
    } catch (error: any) {
        if (error?.response?.status === 404) {
            throw new Error(`话题 "${topicId}" 不存在（404），请检查话题ID是否正确。请访问 ${baseUrl}/topic 查看所有可用话题`);
        }
        logger.error(`[InfoQ] HTTP请求失败: ${error.message}`);
        throw new Error(`获取话题页面失败: ${error.message}`);
    }
    
    const $ = load(response);

    // 修复2: 多选择器兼容 - 支持多种页面结构
    // 根据实际HTML，主要选择器是 div.article-item
    // 但保留备用选择器以兼容旧版或其他页面
    const articleSelectors = [
        'div.article-item',           // 新版页面结构（主要）
        'div.topic_div',              // 旧版或备用结构
        '.cards .card',               // 卡片式布局
        '.article-card',              // 通用文章卡片
        'article[data-articleid]'     // 基于article标签
    ];

    // 记录选择器调试信息
    for (const selector of articleSelectors) {
        const count = $(selector).length;
        if (count > 0) {
            logger.debug(`[InfoQ] 选择器 "${selector}" 找到 ${count} 个元素`);
        }
    }

    const list = $(articleSelectors.join(', '))
        .toArray()
        .map((item) => {
            const $item = $(item);
            
            // 修复3: 多角度提取链接和标题
            // 主要方式：查找文章标题链接
            let $link = $item.find('a.com-article-title');
            if ($link.length === 0) {
                $link = $item.find('a[href*="/article/"]'); // 包含/article/的链接
            }
            if ($link.length === 0) {
                $link = $item.find('a[href*="/news/"]');    // 包含/news/的链接
            }
            if ($link.length === 0) {
                $link = $item.find('a[href]').first();      // 兜底：第一个链接
            }
            
            const href = $link.attr('href');
            // 从span或标题标签提取标题
            let title = $link.find('span').first().text().trim();
            if (!title) {
                title = $link.attr('title') || $link.text().trim();
            }
            
            // 必须有标题和链接才视为有效文章
            if (!title || !href) {
                logger.debug(`[InfoQ] 跳过无效项: 标题="${title}", 链接="${href}"`);
                return null;
            }
            
            // 修复4: 从href中提取文章ID
            const articleId = href.split('/').pop() || href;
            
            // 修复5: 多角度提取日期
            let pubDate = new Date();
            // 1. 尝试从时间标签提取
            const $time = $item.find('time[datetime]');
            if ($time.length > 0) {
                pubDate = parseDate($time.attr('datetime')!);
            } else {
                // 2. 尝试从作者栏文本提取日期模式
                const authorText = $item.find('p.editor').text().trim();
                const dateMatch = authorText.match(/\d{4}-\d{2}-\d{2}/);
                if (dateMatch) {
                    pubDate = parseDate(dateMatch[0]);
                } else {
                    // 3. 尝试从元数据提取
                    const metaDate = $item.find('span.date, .date').text().trim();
                    if (metaDate) {
                        pubDate = parseDate(metaDate);
                    }
                }
            }
            
            return {
                title,
                link: href.trim(),
                pubDate,
                guid: articleId,
            };
        })
        // 过滤无效项
        .filter((item): item is NonNullable<typeof item> => item !== null && Boolean(item.link));

    // 修复6: 如果列表为空，抛出详细错误
    if (list.length === 0) {
        logger.error(`[InfoQ] 在 ${topicUrl} 未找到任何文章`);
        logger.error(`[InfoQ] 页面标题: ${$('title').text()}`);
        logger.error(`[InfoQ] 页面主要容器: ${$('.article-list, .list, main').first().attr('class')}`);
        logger.error(`[InfoQ] 请检查选择器是否匹配页面结构`);
        
        throw new Error(`话题 "${topicId}" 暂无文章或页面结构已变更。请访问 ${baseUrl}/topic/${topicId} 确认页面是否正常`);
    }

    logger.info(`[InfoQ] 成功提取 ${list.length} 篇文章`);

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                try {
                    // 修复7: 确保链接是绝对路径
                    const absoluteLink = item.link.startsWith('http') 
                        ? item.link 
                        : `${baseUrl}${item.link}`;
                    
                    logger.debug(`[InfoQ] 抓取详情页: ${absoluteLink}`);
                    
                    const detailResponse = await ofetch(absoluteLink);
                    const $detail = load(detailResponse);
                    
                    // 修复8: 从详情页提取完整内容（多选择器兼容）
                    const contentSelectors = [
                        'div.article-content',
                        '.article-content',
                        '.content',
                        '.article-body',
                        'article'
                    ];
                    
                    let content = '';
                    for (const selector of contentSelectors) {
                        const $content = $detail(selector);
                        if ($content.length > 0) {
                            content = $content.html() || '';
                            if (content) break;
                        }
                    }
                    
                    // 提取作者信息
                    const author = $detail('meta[name="author"]').attr('content') || 
                                 $detail('.author-name').text().trim() ||
                                 $detail('.author').text().trim() ||
                                 '';
                    
                    return {
                        ...item,
                        link: absoluteLink,
                        description: content,
                        author: author || undefined,
                    };
                } catch (error) {
                    logger.error(`[InfoQ] 抓取详情页失败 ${item.guid}: ${error.message}`);
                    return null; // 返回null以便后续过滤
                }
            })
        )
    );

    // 修复9: 过滤抓取失败的项目，并记录统计
    const validItems = items.filter(Boolean);
    
    if (validItems.length === 0) {
        logger.error(`[InfoQ] 所有 ${list.length} 篇文章详情页抓取失败`);
        throw new Error('所有文章详情页抓取失败，请检查详情页结构是否变更或反爬机制');
    }
    
    if (validItems.length < list.length) {
        logger.warn(`[InfoQ] 成功抓取 ${validItems.length}/${list.length} 篇文章`);
    }

    return {
        title: `InfoQ - ${topicId}`,
        link: topicUrl,
        description: `InfoQ话题: ${topicId}`,
        item: validItems,
    };
}