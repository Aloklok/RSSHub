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
        
        // --- 核心修改开始 ---
        $('img').each((_, el) => {
            const $el = $(el);
            let src = $el.attr('src');
            
            // 1. 处理 img 标签本身：使用 weserv 代理
            if (src) {
                src = src.trim();
                const proxySrc = `https://images.weserv.nl/?url=${encodeURIComponent(src)}`;
                $el.attr('src', proxySrc);
            }

            // 2. 暴力移除所有可能导致阅读器解析错误的属性
            // 移除 srcset 和 sizes 防止阅读器尝试加载原图
            $el.removeAttr('srcset');
            $el.removeAttr('sizes');
            $el.removeAttr('class');
            $el.removeAttr('style');
            $el.removeAttr('width');
            $el.removeAttr('height');
            $el.removeAttr('fetchpriority');
            $el.removeAttr('decoding');
            
            // 加上 no-referrer 作为保险
            $el.attr('referrerpolicy', 'no-referrer');

            // 3. [关键修复] 处理包裹图片的 <a> 标签
            // 如果图片被 <a> 包裹，且 <a> 指向的是一张图片，那么这个链接也必须走代理
            // 否则在 FreshRSS 点击预览时会触发 403
            const $parent = $el.parent();
            if ($parent.prop('tagName') === 'A') {
                let parentHref = $parent.attr('href');
                // 判断链接后缀是否为图片格式 (jpg, png, webp 等)
                if (parentHref && /\.(jpg|jpeg|png|gif|webp|bmp|tif)$/i.test(parentHref.trim())) {
                    parentHref = parentHref.trim();
                    const proxyHref = `https://images.weserv.nl/?url=${encodeURIComponent(parentHref)}`;
                    $parent.attr('href', proxyHref);
                    $parent.attr('target', '_blank'); // 强制新标签页打开
                    $parent.attr('referrerpolicy', 'no-referrer');
                }
            }
        });
        // --- 核心修改结束 ---
        
        // 清理其他文本链接的空格
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
