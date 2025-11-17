// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger'; // 引入日志模块

export const route: Route = {
    path: '/developer/blog',
    categories: ['programming', 'cloud-computing'],
    example: '/aliyun/developer/blog',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true, // 我们怀疑它有反爬，标记一下
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['developer.aliyun.com/blog'],
            target: '/developer/blog',
        },
    ],
    name: '开发者社区 - 技术博客',
    maintainers: ['Aloklok'],
    handler,
};

async function handler() {
    const rootUrl = 'https://developer.aliyun.com';
    const currentUrl = `${rootUrl}/blog`;

    let response;
    try {
        // 【重要改动】我们在这里增加了 try...catch
        response = await ofetch(currentUrl, {
            // 模拟浏览器 User-Agent，这是反反爬虫的第一步
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            },
        });
    } catch (error) {
        // 如果 ofetch 请求失败，打印详细的错误日志
        logger.error(`Aliyun Developer Blog request failed: ${error.message}`);
        // 抛出一个更明确的错误，这样 RSSHub 会显示更友好的信息
        throw new Error(`Failed to fetch Aliyun Developer Blog page. Error: ${error.message}`);
    }

    const $ = load(response);

    const list = $('li.blog-home-main-box-card')
        .toArray()
        .map((item) => {
            item = $(item);
            const titleElement = item.find('a.blog-card-title');
            const link = titleElement.attr('href');

            return {
                title: titleElement.find('h2').text().trim(),
                link: link.startsWith('http') ? link : `${rootUrl}${link}`,
                author: item.find('a.blog-card-author-item').text().trim(),
                pubDate: parseDate(item.find('div.blog-card-time').text().trim()),
            };
        });
    
    // 【重要改动】如果列表为空，说明页面结构可能变了或者被反爬了
    if (list.length === 0) {
        // 打印一些HTML内容帮助我们调试
        logger.debug(`Aliyun Developer Blog page HTML: ${$('body').html().slice(0, 500)}`);
        throw new Error('Could not find any articles on the page. The page structure may have changed or an anti-crawler mechanism is in place.');
    }

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                try {
                    const detailResponse = await ofetch(item.link, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                        },
                    });
                    const content = load(detailResponse);
                    item.description = content('div.article-inner').html();
                } catch (error) {
                    // 如果获取详情页失败，只记录错误，并返回不含正文的内容，避免整个路由失败
                    logger.error(`Failed to fetch article detail for ${item.link}: ${error.message}`);
                    item.description = 'Failed to fetch full content.';
                }
                return item;
            })
        )
    );

    return {
        title: '阿里云开发者社区 - 技术博客',
        link: currentUrl,
        description: '阿里云开发者社区的技术博客，分享云计算、大数据、人工智能等前沿技术。',
        item: items,
    };
}