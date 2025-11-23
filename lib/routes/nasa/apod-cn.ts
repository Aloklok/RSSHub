import { Route } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import { load } from 'cheerio';

export const route: Route = {
    path: '/apod-cn',
    categories: ['picture'],
    example: '/nasa/apod-cn',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['apod.nasa.govundefined'],
        },
    ],
    name: 'NASA 中文',
    maintainers: ['nczitzk', 'williamgateszhao'],
    handler,
    url: 'apod.nasa.govundefined',
    description: `::: tip
  [NASA 中文](https://www.nasachina.cn/ ) 提供了每日天文图的中英双语图文说明，但在更新上偶尔略有一两天的延迟。
:::`,
};

async function handler(ctx) {
    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit'), 10) : 10;
    
    // API 地址
    const rootUrl = `https://www.nasachina.cn/wp-json/wp/v2/posts?categories=2&per_page=${limit}`;
    
    const { data } = await got({
        method: 'get',
        url: rootUrl,
    });

    const items = data.map((item) => {
        const $ = load(item.content.rendered, { xmlMode: false });
        
        // --- 核心修改：图片代理处理 ---
        $('img').each((_, el) => {
            const $el = $(el);
            let src = $el.attr('src');
            
            if (src) {
                src = src.trim();
                // 1. 使用 weserv.nl 代理图片
                const proxySrc = `https://images.weserv.nl/?url=${encodeURIComponent(src)}`;
                $el.attr('src', proxySrc);
                
                // 2. [关键] 移除 srcset 属性
                // 如果不移除，阅读器可能会忽略 src 而去加载 srcset 里的原始高防盗链链接，导致裂图
                $el.removeAttr('srcset');
            }
            
            // 依然加上 no-referrer 作为双重保险
            $el.attr('referrerpolicy', 'no-referrer');
            
            // 修复图片宽度过大导致的排版问题（可选，weserv 会自动处理，但为了保险）
            $el.removeAttr('width');
            $el.removeAttr('height');
        });
        // -------------------------
        
        // 清理所有a标签的href属性
        $('a').each((_, el) => {
            const $el = $(el);
            const href = $el.attr('href');
            if (href) {
                $el.attr('href', href.trim());
            }
        });

        return {
            title: item.title.rendered,
            description: $.html(),
            pubDate: parseDate(item.date_gmt),
            link: item.link.trim(),
        };
    });

    return {
        title: 'NASA中文 - 天文·每日一图',
        link: 'https://www.nasachina.cn/nasa-image-of-the-day',
        item: items,
    };
}
