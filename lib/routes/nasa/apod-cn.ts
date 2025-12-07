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
            
            if (src) {
                src = src.trim();
                
                // 1. 【修改点】改用 WordPress 官方 CDN (i0.wp.com)
                // 原理：将 https://www.nasachina.cn/... 替换为 https://i0.wp.com/www.nasachina.cn/...
                // 这种方式对 WordPress 站点极其稳定，因为它们通常会把 wp.com 列入白名单
                
                // 去掉协议头 (http:// 或 https://)
                const cleanSrc = src.replace(/^https?:\/\//, '');
                // 拼接 wp.com 代理地址
                const proxySrc = `https://i0.wp.com/${cleanSrc}`;
                
                $el.attr('src', proxySrc);
            }

            // 2. 移除干扰属性 (保持你原有的优秀逻辑)
            const attrsToRemove = ['srcset', 'sizes', 'class', 'style', 'width', 'height', 'fetchpriority', 'decoding'];
            attrsToRemove.forEach(attr => $el.removeAttr(attr));
            
            // 加上 no-referrer
            $el.attr('referrerpolicy', 'no-referrer');

            // 3. 处理包裹图片的 <a> 标签 (同步修改为 i0.wp.com)
            const $parent = $el.parent();
            if ($parent.prop('tagName') === 'A') {
                let parentHref = $parent.attr('href');
                if (parentHref && /\.(jpg|jpeg|png|gif|webp|bmp|tif)$/i.test(parentHref.trim())) {
                    parentHref = parentHref.trim();
                    const cleanHref = parentHref.replace(/^https?:\/\//, '');
                    const proxyHref = `https://i0.wp.com/${cleanHref}`;
                    
                    $parent.attr('href', proxyHref);
                    $parent.attr('target', '_blank');
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
