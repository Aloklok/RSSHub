import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import cache from '@/utils/cache';
import utils from './utils';

export const route: Route = {
    path: '/topic/:id',
    categories: ['programming'],
    example: '/infoq/topic/1174',
    parameters: { id: '话题ID，如 1174 (后端)' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '话题',
    maintainers: ['your-name'],
    handler,
};

async function handler(ctx) {
    const paramId = ctx.req.param('id');
    
    // API 端点
    const apiUrl = 'https://www.infoq.cn/public/v1/article/getList';
    const infoUrl = 'https://www.infoq.cn/public/v1/topic/getInfo';
    const pageUrl = `https://www.infoq.cn/topic/${paramId}`;

    // 通用 Headers，解决 415/403
    const commonHeaders = {
        'Referer': pageUrl,
        'Origin': 'https://www.infoq.cn',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    // 1. 获取话题元数据
    // paramId 可能是数字ID，也可能是别名(alias)
    const infoBody = Number.isNaN(Number(paramId)) ? { alias: paramId } : { id: Number.parseInt(paramId) };

    const infoResp = await ofetch(infoUrl, {
        method: 'POST',
        headers: commonHeaders,
        body: infoBody,
    });
    
    const infoData = infoResp.data;
    if (!infoData) {
        throw new Error(`话题 ${paramId} 不存在或 API 变动`);
    }
    
    const topicName = infoData.name;

    // 2. 获取文章列表
    // 注意：size 不要设太大，避免触发风控
    const limit = ctx.req.query('limit') ? Number(ctx.req.query('limit')) : 15;

    const listResp = await ofetch(apiUrl, {
        method: 'POST',
        headers: commonHeaders,
        body: {
            id: infoData.id,
            ptype: 0,
            size: limit,
            type: 0,
        },
    });

    const listData = listResp.data;
    
    // 3. 交给 utils 进行并发处理和详情抓取
    const items = await utils.ProcessFeed(listData, cache);

    return {
        title: `InfoQ 话题 - ${topicName}`,
        description: infoData.desc,
        image: infoData.cover,
        link: pageUrl,
        item: items,
    };
}