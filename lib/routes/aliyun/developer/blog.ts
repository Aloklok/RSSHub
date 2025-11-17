// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
import vm from 'node:vm';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const route: Route = {
    path: '/developer/blog',
    categories: ['programming', 'cloud-computing'],
    example: '/aliyun/developer/blog',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '开发者社区 - 技术博客',
    maintainers: ['Aloklok'],
    handler,
};

async function handler() {
    const rootUrl = 'https://developer.aliyun.com';
    const currentUrl = `${rootUrl}/blog`;

    const response = await ofetch(currentUrl);
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
                author: item.find('a.blog-card-author-item').first().text().trim(),
                pubDate: parseDate(item.find('div.blog-card-time').text().trim()),
                description: item.find('p.blog-card-desc').text().trim(),
            };
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                try {
                    await sleep(Math.random() * 1500 + 500);

                    const detailResponse = await ofetch(item.link);
                    const scriptMatch = detailResponse.match(/GLOBAL_CONFIG\.larkContent = '([\s\S]*?)';/s);

                    if (scriptMatch && scriptMatch[0]) {
                        const sandbox = { GLOBAL_CONFIG: {} };
                        vm.createContext(sandbox);
                        vm.runInContext(scriptMatch[0], sandbox);
                        let content = sandbox.GLOBAL_CONFIG.larkContent;

                        const $content = load(content, { xmlMode: false });
                        
                        // 【修复】转换<card>为<img>
                        $content('card[type="inline"][name="image"]').each((_, el) => {
                            const $el = $content(el);
                            const value = $el.attr('value');
                            if (value) {
                                try {
                                    // 1. 解码URL编码
                                    const decodedValue = decodeURIComponent(value);
                                    
                                    // 2. 移除 data: 前缀
                                    const jsonString = decodedValue.replace(/^data:/, '');
                                    
                                    // 3. 解析JSON
                                    const imageData = JSON.parse(jsonString);
                                    
                                    // 4. 创建标准img
                                    const $img = $content(`
                                        <img src="${imageData.src}" 
                                             alt="${imageData.name || ''}"
                                             ${imageData.width ? `width="${imageData.width}"` : ''}
                                             ${imageData.height ? `height="${imageData.height}"` : ''}>
                                    `);
                                    
                                    $el.replaceWith($img);
                                } catch (e) {
                                    logger.warn(`[Aliyun Blog] 图片解析失败: ${e.message}`);
                                    $el.remove();
                                }
                            } else {
                                $el.remove();
                            }
                        });
                        
                        // 净化
                        $content('[data-lake-id]').removeAttr('data-lake-id');
                        $content('[class]').removeAttr('class');
                        $content('span').each((_, el) => {
                            const $el = $content(el);
                            if (Object.keys($el.attr()).length === 0) {
                                $el.replaceWith($el.contents());
                            }
                        });
                        $content('p:empty').remove();
                        $content('br + br').remove();
                        
                        content = $content('body').html() || content;
                        item.description = content;
                    }
                } catch (error) {
                    logger.error(`[Aliyun Blog] 抓取失败 ${item.link}: ${error.message}`);
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