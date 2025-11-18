// 文件路径: lib/routes/nasa/apod-cn.ts
import { Route } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import { load } from 'cheerio'; // 新增：用于清理HTML

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
    // 修复1：移除URL中的多余空格
    const rootUrl = `https://www.nasachina.cn/wp-json/wp/v2/posts?categories=2&per_page=${limit}`;
    
    const { data } = await got({
        method: 'get',
        url: rootUrl,
    });

    const items = data.map((item) => {
        // 修复2：清理HTML内容中的URL空格
        const $ = load(item.content.rendered, { xmlMode: false });
        
        // 清理所有img标签的src和srcset属性
        $('img').each((_, el) => {
            const $el = $(el);
            const src = $el.attr('src');
            const srcset = $el.attr('srcset');
            
            if (src) {
                $el.attr('src', src.trim());
            }
            if (srcset) {
                $el.attr('srcset', srcset.trim());
            }
            // 确保referrerpolicy存在
            $el.attr('referrerpolicy', 'no-referrer');
        });
        
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
            description: $.html(), // 使用清理后的HTML
            pubDate: parseDate(item.date_gmt),
            link: item.link.trim(), // 修复3：清理link的空格
        };
    });

    return {
        title: 'NASA中文 - 天文·每日一图',
        link: 'https://www.nasachina.cn/nasa-image-of-the-day',
        item: items,
    };
}