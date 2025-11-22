import { parseDate } from '@/utils/parse-date';
import logger from '@/utils/logger';
import ofetch from '@/utils/ofetch';

// 并发控制配置
const CONCURRENCY_LIMIT = 3;
const REQUEST_DELAY = [800, 1200, 1500];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 基础请求函数
const fetchArticleDetail = async (uuid, link) => {
    const detailUrl = 'https://www.infoq.cn/public/v1/article/getDetail';
    
    const delay = REQUEST_DELAY[Math.floor(Math.random() * REQUEST_DELAY.length)];
    await sleep(delay);

    try {
        const resp = await ofetch(detailUrl, {
            method: 'POST',
            headers: {
                'Referer': link,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://www.infoq.cn'
            },
            body: { uuid },
        });
        return resp.data;
    } catch (e) {
        if (e.response?.status === 404) return null;
        throw e;
    }
};

// 递归解析内容
const parseToSimpleText = (content) => {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map(parseToSimpleText).join('');
    }
    
    switch (content.type) {
        case 'doc':
            return parseToSimpleText(content.content);
        case 'text':
            return content.text || '';
        case 'heading':
            const level = content.attrs?.level || 3;
            return `<h${level}>${parseToSimpleText(content.content)}</h${level}>`;
        case 'blockquote':
            return `<blockquote>${parseToSimpleText(content.content)}</blockquote>`;
            
        // --- 图片处理核心修改 ---
        case 'image':
            const originalSrc = content.attrs?.src;
            if (!originalSrc) return '';

            // 使用 weserv.nl 代理图片，解决防盗链和跨域问题
            // encodeURIComponent 是必须的，防止 url 参数解析错误
            const proxySrc = `https://images.weserv.nl/?url=${encodeURIComponent(originalSrc)}`;

            const caption = content.attrs?.title || content.attrs?.alt;
            return `<figure><img src="${proxySrc}" referrerpolicy="no-referrer"><figcaption>${caption || ''}</figcaption></figure>`;
        // -----------------------

        case 'codeblock':
            const lang = content.attrs?.lang || '';
            return `<pre><code class="language-${lang}">${parseToSimpleText(content.content)}</code></pre>`;
        case 'link':
            const href = content.attrs?.href || '';
            return `<a href="${href}" target="_blank">${parseToSimpleText(content.content)}</a>`;
        case 'paragraph':
        case 'p':
            return `<p>${parseToSimpleText(content.content)}</p>`;
        case 'bullet_list':
            return `<ul>${parseToSimpleText(content.content)}</ul>`;
        case 'ordered_list':
            return `<ol>${parseToSimpleText(content.content)}</ol>`;
        case 'list_item':
            return `<li>${parseToSimpleText(content.content)}</li>`;
        default:
            return Array.isArray(content.content) ? parseToSimpleText(content.content) : '';
    }
};

// 解析入口
const parseContent = (content) => {
    try {
        if (typeof content === 'string' && content.trim().startsWith('{')) {
            return parseToSimpleText([JSON.parse(content)]);
        }
        return parseToSimpleText(content);
    } catch (e) {
        return content;
    }
};

const ProcessFeed = async (list, cache) => {
    const items = [];

    for (let i = 0; i < list.length; i += CONCURRENCY_LIMIT) {
        const batch = list.slice(i, i + CONCURRENCY_LIMIT);
        logger.debug(`[InfoQ] 处理批次 ${i / CONCURRENCY_LIMIT + 1}, 数量: ${batch.length}`);

        const batchPromises = batch.map((e) => {
            const uuid = e.uuid;
            const link = `https://www.infoq.cn/article/${uuid}`;

            return cache.tryGet(`infoq:${uuid}`, async () => {
                try {
                    const data = await fetchArticleDetail(uuid, link);
                    if (!data) return null;

                    let finalContentRaw;

                    // 处理 content_url (CDN json) 的情况
                    if (data.content_url) {
                        try {
                            finalContentRaw = await ofetch(data.content_url);
                        } catch (err) {
                            logger.error(`[InfoQ] CDN fetch failed for ${uuid}: ${err}`);
                            finalContentRaw = `<a href="${data.content_url}">内容加载失败，点击查看原文</a>`;
                        }
                    } else {
                        finalContentRaw = data.content;
                    }

                    const content = parseContent(finalContentRaw);

                    return {
                        title: data.article_title,
                        description: content,
                        pubDate: parseDate(e.publish_time, 'x'),
                        category: [
                            ...(e.topic?.map((t) => t.name) || []),
                            ...(e.label?.map((l) => l.name) || [])
                        ],
                        author: data.author?.map((p) => p.nickname).join(', ') || data.no_author || 'InfoQ',
                        link,
                        guid: uuid,
                    };
                } catch (error) {
                    logger.error(`[InfoQ] 抓取失败 ${uuid}: ${error.message}`);
                    return null;
                }
            });
        });

        const batchResults = await Promise.all(batchPromises);
        items.push(...batchResults.filter(Boolean));

        if (i + CONCURRENCY_LIMIT < list.length) {
            await sleep(1000);
        }
    }

    return items;
};

export default { ProcessFeed };