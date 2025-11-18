import { parseDate } from '@/utils/parse-date';
import logger from '@/utils/logger';
import ofetch from '@/utils/ofetch';

// 并发控制配置
const CONCURRENCY_LIMIT = 3; // 稍微保守一点，3个并发
const REQUEST_DELAY = [800, 1200, 1500]; // 毫秒延迟

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 基础请求函数
const fetchArticleDetail = async (uuid, link) => {
    const detailUrl = 'https://www.infoq.cn/public/v1/article/getDetail';

    // 请求前随机延迟，模拟人类行为
    const delay = REQUEST_DELAY[Math.floor(Math.random() * REQUEST_DELAY.length)];
    await sleep(delay);

    try {
        const resp = await ofetch(detailUrl, {
            method: 'POST',
            headers: {
                'Referer': link,
                'Content-Type': 'application/json', // 关键：防止 415 错误
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://www.infoq.cn'
            },
            body: { uuid },
        });
        return resp.data;
    } catch (e) {
        // 如果是 404 或文章被删，忽略错误
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
    
    // 处理 InfoQ 特有的文档结构
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
        case 'image':
            const src = content.attrs?.src;
            const caption = content.attrs?.title || content.attrs?.alt;
            return src ? `<figure><img src="${src}" referrerpolicy="no-referrer"><figcaption>${caption || ''}</figcaption></figure>` : '';
        case 'codeblock':
            const lang = content.attrs?.lang || '';
            return `<pre><code class="language-${lang}">${parseToSimpleText(content.content)}</code></pre>`;
        case 'link':
            const href = content.attrs?.href || '';
            return `<a href="${href}" target="_blank">${parseToSimpleText(content.content)}</a>`;
        case 'paragraph':
        case 'p':
            return `<p>${parseToSimpleText(content.content)}</p>`;
        // 处理列表
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

const parseContent = (content) => {
    // InfoQ 有时返回 JSON 字符串，有时直接是对象
    try {
        if (typeof content === 'string' && content.trim().startsWith('{')) {
            return parseToSimpleText([JSON.parse(content)]);
        }
        return parseToSimpleText(content);
    } catch (e) {
        return content; // 降级处理
    }
};

// 核心处理函数
const ProcessFeed = async (list, cache) => {
    const items = [];

    // 分批处理循环
    for (let i = 0; i < list.length; i += CONCURRENCY_LIMIT) {
        const batch = list.slice(i, i + CONCURRENCY_LIMIT);
        logger.debug(`[InfoQ] 处理批次 ${i / CONCURRENCY_LIMIT + 1}, 数量: ${batch.length}`);

        const batchPromises = batch.map((e) => {
            const uuid = e.uuid;
            // InfoQ 的 link 结构
            const link = `https://www.infoq.cn/article/${uuid}`;

            return cache.tryGet(`infoq:${uuid}`, async () => {
                try {
                    const data = await fetchArticleDetail(uuid, link);
                    if (!data) return null;

                    let content;
                    // 有些文章内容是 URL (比如 PDF 或者外链)
                    if (data.content_url) {
                        content = `<a href="${data.content_url}">点击查看原文内容</a>`;
                    } else {
                        content = parseContent(data.content);
                    }

                    return {
                        title: data.article_title,
                        description: content,
                        pubDate: parseDate(e.publish_time, 'x'), // 时间戳解析
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

        // 等待当前批次完成
        const batchResults = await Promise.all(batchPromises);
        items.push(...batchResults.filter(Boolean));

        // 批次之间额外休息一下，进一步降低 RPS
        if (i + CONCURRENCY_LIMIT < list.length) {
            await sleep(1000);
        }
    }

    return items;
};

export default { ProcessFeed };