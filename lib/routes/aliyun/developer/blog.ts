// 文件路径: lib/routes/aliyun/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
import vm from 'node:vm';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
            const link = titleElement.attr('href')?.trim();

            return {
                title: titleElement.find('h2').text().trim(),
                link: link?.startsWith('http') ? link : `${rootUrl}${link}`,
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
                        
                        // 1. 转换图片
                        $content('card[type="inline"][name="image"]').each((_, el) => {
                            const $el = $content(el);
                            const value = $el.attr('value');
                            if (value) {
                                try {
                                    const decodedValue = decodeURIComponent(value);
                                    const jsonString = decodedValue.replace(/^data:/, '');
                                    const imageData = JSON.parse(jsonString);
                                    const $img = $content(`
                                        <img src="${imageData.src}" 
                                             alt="${imageData.name || ''}"
                                             ${imageData.width ? `width="${imageData.width}"` : ''}
                                             ${imageData.height ? `height="${imageData.height}"` : ''}>
                                    `);
                                    $el.replaceWith($img);
                                } catch {
                                    $el.remove();
                                }
                            } else {
                                $el.remove();
                            }
                        });

                        // 2. 【关键】移除所有残留的<card>标签（特别是表格）
                        $content('card').each((_, el) => {
                            const $el = $content(el);
                            // 尝试提取文本内容，否则直接移除
                            const text = $el.text().trim();
                            if (text) {
                                $el.replaceWith(`<p>[卡片内容: ${text.substring(0, 50)}...]</p>`);
                            } else {
                                $el.remove();
                            }
                        });

                        // 3. 净化HTML
                        $content('[data-lake-id], [class], [id]').removeAttr('data-lake-id class id');
                        $content('span').each((_, el) => {
                            const $el = $content(el);
                            $el.replaceWith($el.contents());
                        });
                        $content('p').each((_, el) => {
                            const $el = $content(el);
                            const text = $el.text().trim();
                            const hasImg = $el.find('img').length > 0;
                            const hasBrOnly = $el.children().length === 1 && $el.children('br').length === 1;
                            if (!text && !hasImg && hasBrOnly) {
                                $el.replaceWith('<br>');
                            } else if (!text && !hasImg) {
                                $el.remove();
                            }
                        });
                        $content('br + br').remove();
                        
                        content = $content('body').html() || content;
                        item.description = content;
                    }

                    // 【关键】修复作者邮箱格式（添加虚拟邮箱）
                    if (item.author) {
                        item.author = `${item.author} (none@aliyun.com)`;
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