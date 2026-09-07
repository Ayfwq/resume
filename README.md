# Personal Resume · 个人简历网站

> 全屏 `WELCOME` → 滚动驱动的渐变过渡 → 进入正文。零依赖、纯静态。

## 目录

```
.
├── index.html              # 单页面
├── assets/
│   ├── css/style.css       # 全部样式（含渐变过渡核心逻辑）
│   ├── js/main.js          # 滚动驱动 / 进场动画 / 星点画布
│   └── favicon.svg
└── README.md
```

## 本地预览

```bash
python -m http.server 8000
# 打开 http://127.0.0.1:8000
```

## 核心交互说明

| 元素 | 行为 |
| --- | --- |
| `WELCOME` 标题 | 加载时逐字进入；带渐变流动 + drop-shadow |
| 极光背景 | 三团 radial-gradient，CSS keyframes 漂移 + 鼠标视差 |
| 星点 | Canvas 绘制，滚动离开欢迎页后停止动画 |
| 滚动进度 `p` | `y / innerHeight` 归一化到 `0→1`，驱动欢迎层淡出/模糊/放大 |
| `.content` 背景 | 顶部 `transparent → #07080d` 的线性渐变，承接 Welcome 过渡 |
| `.wipe` | `p=0.5` 时最强的径向光晕，`mix-blend-mode: screen` |
| 顶部 nav | 滚动超过 35% 视口高度后滑入 |
| 顶部进度条 | 跟随页面整体滚动进度 |
| 进场动画 | `IntersectionObserver` + `--d` 错峰延迟 |
| 数字 | `data-count` 触发计数动画 |
| 姓名 | `data-text` 触发乱码还原（scramble） |
| 鼠标光晕 | 桌面端 lerp 跟随 + 极光视差 |
| 无障碍 | `prefers-reduced-motion` 全局降级 |

## 自定义内容

在 `index.html` 里直接改：

- `#welcomeTitle` 的 `data-text`：欢迎词
- `#nameText` 的 `data-text` 与正文：姓名 / 简介
- `#about / #skills / #timeline / #projects`：各 section 卡片
- `mailto:`、GitHub 链接：`#contact`
- `assets/favicon.svg`：站点图标

## 部署

服务器侧（`root@8.138.47.45`）已配置：

- Nginx 站点 `/etc/nginx/sites-available/hellowq.icu.conf`
- 站点目录 `/var/www/resume`（由 `git pull` 拉取）
- HTTPS：Let's Encrypt (`certbot --nginx`)

后续更新只需在服务器上：

```bash
cd /var/www/resume && git pull
```

## 域名

`hellowq.icu` → 8.138.47.45（DNS 已解析）。
