// lib/routes/infoq/utils.ts
import { parseDate } from '@/utils/parse-date';
import logger from '@/utils/logger';
import ofetch from '@/utils/ofetch';

// 并发控制：每批最多3个请求
const CONCURRENCY_LIMIT = 3;
// 随机延迟范围（ms）
const REQUEST_DELAY = [1000, 1500, 2000, 2500];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 基础请求函数（单次，失败即记录）
const fetchArticleDetail = async (uuid: string, link: string) => {
    const detailUrl = 'https://www.infoq.cn/public/v1/article/getDetail';
    
    // 请求前随机延迟
    await sleep(REQUEST_DELAY[Math.floor(Math.random() * REQUEST_DELAY.length)]);
    
    const resp = await ofetch(detailUrl, {
        method: 'POST',
        headers: {
            Referer: link,
        },
        body: { uuid },
    });
    
    return resp.data;
};

const parseContent = (content: string) => {
    const isRichContent = content.startsWith('{');
    if (!isRichContent) {
        return content;
    }
    return parseToSimpleText([JSON.parse(content)]);
};

const parseToSimpleText = (content: any): string => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map(parseToSimpleText).join('');
    }
    if (!content.type) return '';
    
    switch (content.type) {
        case 'doc':
            return parseToSimpleText(content.content);
        case 'text':
            return content.text || '';
        case 'heading':
            const level = content.attrs?.level || 1;
            return `<h${level}>${parseToSimpleText(content.content)}</h${level}>`;
        case 'blockquote':
            return `<blockquote>${parseToSimpleText(content.content)}</blockquote>`;
        case 'image':
            return `<img src="${content.attrs?.src || ''}" referrerpolicy="no-referrer">`;
        case 'codeblock':
            const lang = content.attrs?.lang || '';
            return `<pre><code class="language-${lang}">${parseToSimpleText(content.content)}</code></pre>`;
        case 'link':
            const href = content.attrs?.href || '';
            const linkText = parseToSimpleText(content.content);
            return `<a href="${href}" target="_blank">${linkText}</a>`;
        case 'paragraph':
        case 'p':
            return `<p>${parseToSimpleText(content.content)}</p>`;
        default:
            return Array.isArray(content.content) ? parseToSimpleText(content.content) : '';
    }
};

// 优化ProcessFeed：控制并发和延迟
export const ProcessFeed = async (list: any[], cache: any) => {
    const items = [];
    
    // 分批处理
    for (let i = 0; i < list.length; i += CONCURRENCY_LIMIT) {
        const batch = list.slice(i, i + CONCURRENCY_LIMIT);
        
        const batchPromises = batch.map(async (e) => {
            const uuid = e.uuid;
            const link = `https://www.infoq.cn/article/${uuid}`;
            
            return await cache.tryGet(`infoq:${uuid}`, async () => {
                try {
                    const data = await fetchArticleDetail(uuid, link);
                    if (!data) return null;
                    
                    const author = data.author ? data.author.map((p: any) => p.nickname).join(',') : data.no_author;
                    const category = [...e.topic.map((t: any) => t.name), ...e.label.map((l: any) => l.name)];
                    const content = data.content_url ? await ofetch(data.content_url) : data.content;
                    
                    return {
                        title: data.article_title,
                        description: parseContent(content),
                        pubDate: parseDate(e.publish_time, 'x'),
                        category,
                        author,
                        link,
                        guid: uuid,
                    };
                } catch (error: any) {
                    logger.error(`InfoQ 抓取失败 ${uuid}: ${error.message}`);
                    return null; // 失败不影响整体
                }
            });
        });
        
        const batchResults = await Promise.all(batchPromises);
        items.push(...batchResults.filter(Boolean));
        
        // 批次间延迟
        if (i + CONCURRENCY_LIMIT < list.length) {
            await sleep(1000);
        }
    }
    
    return items;
};