<<<<<<< HEAD
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
=======
FROM node:24-bookworm AS dep-builder
# Here we use the non-slim image to provide build-time deps (compilers and python), thus no need to install later.
# This effectively speeds up qemu-based cross-build.

WORKDIR /app

# place ARG statement before RUN statement which need it to avoid cache miss
ARG USE_CHINA_NPM_REGISTRY=0
RUN \
    set -ex && \
    corepack enable pnpm && \
    if [ "$USE_CHINA_NPM_REGISTRY" = 1 ]; then \
        echo 'use npm mirror' && \
        npm config set registry https://registry.npmmirror.com && \
        yarn config set registry https://registry.npmmirror.com && \
        pnpm config set registry https://registry.npmmirror.com ; \
    fi;

COPY ./tsconfig.json /app/
COPY ./pnpm-lock.yaml /app/
COPY ./package.json /app/

# lazy install Chromium to avoid cache miss, only install production dependencies to minimize the image size
RUN \
    set -ex && \
    export PUPPETEER_SKIP_DOWNLOAD=true && \
    pnpm install --frozen-lockfile && \
    pnpm rb

# ---------------------------------------------------------------------------------------------------------------------

FROM debian:bookworm-slim AS dep-version-parser
# This stage is necessary to limit the cache miss scope.
# With this stage, any modification to package.json won't break the build cache of the next two stages as long as the
# version unchanged.
# node:24-bookworm-slim is based on debian:bookworm-slim so this stage would not cause any additional download.

WORKDIR /ver
COPY ./package.json /app/
RUN \
    set -ex && \
    grep -Po '(?<="rebrowser-puppeteer": ")[^\s"]*(?=")' /app/package.json | tee /ver/.puppeteer_version && \
    grep -Po '(?<="@vercel/nft": ")[^\s"]*(?=")' /app/package.json | tee /ver/.nft_version && \
    grep -Po '(?<="fs-extra": ")[^\s"]*(?=")' /app/package.json | tee /ver/.fs_extra_version

# ---------------------------------------------------------------------------------------------------------------------

FROM node:24-bookworm-slim AS docker-minifier
# The stage is used to further reduce the image size by removing unused files.

WORKDIR /minifier
COPY --from=dep-version-parser /ver/* /minifier/

ARG USE_CHINA_NPM_REGISTRY=0
RUN \
    set -ex && \
    npm install -g corepack@latest && \
    corepack enable pnpm && \
    if [ "$USE_CHINA_NPM_REGISTRY" = 1 ]; then \
        npm config set registry https://registry.npmmirror.com && \
        yarn config set registry https://registry.npmmirror.com && \
        pnpm config set registry https://registry.npmmirror.com ; \
    fi; \
    pnpm add @vercel/nft@$(cat .nft_version) fs-extra@$(cat .fs_extra_version) --save-prod

COPY . /app
COPY --from=dep-builder /app /app

WORKDIR /app
RUN \
    set -ex && \
    pnpm build && \
    rm -rf /app/lib && \
    cp /app/scripts/docker/minify-docker.js /minifier/ && \
    export PROJECT_ROOT=/app && \
    node /minifier/minify-docker.js && \
    \
    # [修复] 开始：手动将 'he' 包复制到最小化的 node_modules 中
    # 因为 minify-docker.js (nft) 没能自动追踪到它
    echo "Manually copying 'he' package to minimal dependencies..." && \
    mkdir -p /app/app-minimal/node_modules/he && \
    cp -r /app/node_modules/he/* /app/app-minimal/node_modules/he/ && \
    # [修复] 结束
    \
    rm -rf /app/node_modules /app/scripts && \
    mv /app/app-minimal/node_modules /app/ && \
    rm -rf /app/app-minimal && \
    ls -la /app && \
    du -hd1 /app

# ---------------------------------------------------------------------------------------------------------------------

# ---------------------------------------------------------------------------------------------------------------------

FROM node:24-bookworm-slim AS chromium-downloader
# This stage is necessary to improve build concurrency and minimize the image size.
# Yeah, downloading Chromium never needs those dependencies below.

WORKDIR /app
COPY ./.puppeteerrc.cjs /app/
COPY --from=dep-version-parser /ver/.puppeteer_version /app/.puppeteer_version

ARG TARGETPLATFORM
ARG USE_CHINA_NPM_REGISTRY=0
ARG PUPPETEER_SKIP_DOWNLOAD=1
# The official recommended way to use Puppeteer on x86(_64) is to use the bundled Chromium from Puppeteer:
# https://pptr.dev/faq#q-why-doesnt-puppeteer-vxxx-workwith-chromium-vyyy
RUN \
    set -ex ; \
    if [ "$PUPPETEER_SKIP_DOWNLOAD" = 0 ] && [ "$TARGETPLATFORM" = 'linux/amd64' ]; then \
        npm install -g corepack@latest && \
        corepack enable pnpm && \
        if [ "$USE_CHINA_NPM_REGISTRY" = 1 ]; then \
            npm config set registry https://registry.npmmirror.com && \
            yarn config set registry https://registry.npmmirror.com && \
            pnpm config set registry https://registry.npmmirror.com ; \
        fi; \
        echo 'Downloading Chromium...' && \
        unset PUPPETEER_SKIP_DOWNLOAD && \
        pnpm --allow-build=rebrowser-puppeteer add rebrowser-puppeteer@$(cat /app/.puppeteer_version) --save-prod && \
        pnpm rb && \
        pnpx rebrowser-puppeteer browsers install chrome ; \
    else \
        mkdir -p /app/node_modules/.cache/puppeteer ; \
    fi;

# ---------------------------------------------------------------------------------------------------------------------

FROM node:24-bookworm-slim AS app

LABEL org.opencontainers.image.authors="https://github.com/DIYgod/RSSHub"

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

WORKDIR /app

# install deps first to avoid cache miss or disturbing buildkit to build concurrently
ARG TARGETPLATFORM
ARG PUPPETEER_SKIP_DOWNLOAD=1
# https://pptr.dev/troubleshooting#chrome-headless-doesnt-launch-on-unix
# https://github.com/puppeteer/puppeteer/issues/7822
# https://www.debian.org/releases/bookworm/amd64/release-notes/ch-information.en.html#noteworthy-obsolete-packages
# The official recommended way to use Puppeteer on arm/arm64 is to install Chromium from the distribution repositories:
# https://github.com/puppeteer/puppeteer/blob/07391bbf5feaf85c191e1aa8aa78138dce84008d/packages/puppeteer-core/src/node/BrowserFetcher.ts#L128-L131
RUN \
    set -ex && \
    apt-get update && \
    apt-get install -yq --no-install-recommends \
        dumb-init git curl \
    ; \
    if [ "$PUPPETEER_SKIP_DOWNLOAD" = 0 ]; then \
        if [ "$TARGETPLATFORM" = 'linux/amd64' ]; then \
            apt-get install -yq --no-install-recommends \
                ca-certificates fonts-liberation wget xdg-utils \
                libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 \
                libexpat1 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 \
                libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
            ; \
        else \
            apt-get install -yq --no-install-recommends \
                chromium xvfb \
            && \
            echo "CHROMIUM_EXECUTABLE_PATH=$(which chromium)" | tee /app/.env ; \
        fi; \
    fi; \
    rm -rf /var/lib/apt/lists/*

COPY --from=chromium-downloader /app/node_modules/.cache/puppeteer /app/node_modules/.cache/puppeteer

RUN \
    set -ex && \
    if [ "$PUPPETEER_SKIP_DOWNLOAD" = 0 ] && [ "$TARGETPLATFORM" = 'linux/amd64' ]; then \
        echo 'Verifying Chromium installation...' && \
        if ldd $(find /app/node_modules/.cache/puppeteer/ -name chrome -type f) | grep "not found"; then \
            echo "!!! Chromium has unmet shared libs !!!" && \
            exit 1 ; \
        else \
            echo "Awesome! All shared libs are met!" ; \
        fi; \
    fi;

COPY --from=docker-minifier /app /app

EXPOSE 1200
ENTRYPOINT ["dumb-init", "--"]

CMD ["npm", "run", "start"]

# ---------------------------------------------------------------------------------------------------------------------

# In case Chromium has unmet shared libs, here is some magic to find and install the packages they belong to:
# In most case you can just stop at `grep ^lib` and add those packages to the above stage.
#
# set -ex && \
# apt-get update && \
# apt install -yq --no-install-recommends \
#     apt-file \
# && \
# apt-file update && \
# ldd $(find /app/node_modules/.cache/puppeteer/ -name chrome -type f) | grep -Po "\S+(?= => not found)" | \
# sed 's/\./\\./g' | awk '{print $1"$"}' | apt-file search -xlf - | grep ^lib | \
# xargs -d '\n' -- \
#     apt-get install -yq --no-install-recommends \
# && \
# apt purge -yq --auto-remove \
#     apt-file \
# rm -rf /tmp/.chromium_path /var/lib/apt/lists/*

# !!! If you manually build Docker image but with buildx/BuildKit disabled, set TARGETPLATFORM yourself !!!
>>>>>>> e446f48cb (blogfix6.0)
