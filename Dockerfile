// 文件路径: lib/routes/aliyun/developer/blog.ts
import { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import cache from '@/utils/cache';
import logger from '@/utils/logger';
import vm from 'node:vm';

// 随机延迟函数，模拟人类阅读间隔
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

    // 伪装 Headers
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': rootUrl,
    };

    const response = await ofetch(currentUrl, { headers });
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
                    // 随机延迟 0.5s - 1.5s
                    await sleep(Math.random() * 1000 + 500);

                    const detailResponse = await ofetch(item.link, { headers });
                    
                    // 提取阿里云特有的 larkContent 数据
                    const scriptMatch = detailResponse.match(/GLOBAL_CONFIG\.larkContent = '([\s\S]*?)';/s);

                    if (scriptMatch && scriptMatch[1]) {
                        const sandbox = { GLOBAL_CONFIG: {} };
                        vm.createContext(sandbox);
                        // 使用 VM 安全执行 JS 代码片段，还原被转义的字符
                        vm.runInContext(scriptMatch[0], sandbox);
                        let content = sandbox.GLOBAL_CONFIG.larkContent;

                        const $content = load(content, { xmlMode: false });
                        
                        // === 核心：图片处理 ===
                       // === 核心：图片处理 ===
$content('card[name="image"]').each((_, el) => {
    const $el = $content(el);
    const value = $el.attr('value');
    if (value) {
        try {
            const decodedValue = decodeURIComponent(value);
            const jsonString = decodedValue.replace(/^data:/, '');
            const imageData = JSON.parse(jsonString);
            
            let imageSrc = imageData.src ? imageData.src.trim() : '';
            
            if (imageSrc) {
                // 1. 核心修复：剔除 tmpCode 等临时参数
                // 将 https://xxx.webp?tmpCode=... 变为 https://xxx.webp
                imageSrc = imageSrc.split('?')[0];

                // 2. 可选：如果图片仍然 403，可以使用 wsrv.nl 镜像代理
                // imageSrc = `https://wsrv.nl/?url=${encodeURIComponent(imageSrc)}`;

                const $img = $content('<img>').attr({
                    src: imageSrc,
                    referrerpolicy: 'no-referrer', // 必须：告诉浏览器不要发送 Referer
                    loading: 'lazy',
                    rel: 'noreferrer',
                    alt: imageData.name || 'image'
                });
                
                // 3. 规范化：确保图片能撑开容器
                $img.css({
                    'max-width': '100%',
                    'height': 'auto'
                });
                
                $el.replaceWith($('<figure style="text-align:center;margin:1em 0;">').append($img));
            } else {
                $el.remove();
            }
        } catch (e) {
            $el.remove();
        }
    } else {
        $el.remove();
    }
});

                        // === 代码块处理 ===
                        $content('card[name="codeblock"]').each((_, el) => {
                            const $el = $content(el);
                            const value = $el.attr('value');
                            try {
                                const json = JSON.parse(decodeURIComponent(value).replace(/^data:/, ''));
                                $el.replaceWith(`<pre><code class="language-${json.mode || ''}">${json.code || ''}</code></pre>`);
                            } catch (e) {
                                $el.remove();
                            }
                        });

                        // === 清理工作 ===
                        // 1. 移除残留的 card
                        $content('card').remove();
                        
                        // 2. 移除所有行内样式和类名，防止污染 RSS 阅读器样式
                        $content('*').removeAttr('class style data-lake-id id');

                        // 3. 智能移除空行和无意义的 span
                        $content('span').each((_, el) => {
                            const $el = $content(el);
                            // 替换掉无意义的 span，保留内容
                            $el.replaceWith($el.contents());
                        });
                        
                        // 移除完全空的 p 标签
                        $content('p').each((_, el) => {
                            const $el = $content(el);
                            if ($el.text().trim() === '' && $el.find('img').length === 0) {
                                $el.remove();
                            }
                        });

                        content = $content('body').html() || content;
                        item.description = content;
                    }

                    // 作者名清理 (去除多余空格)
                    if (item.author) {
                        item.author = item.author.replace(/\s+/g, ' ').trim();
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