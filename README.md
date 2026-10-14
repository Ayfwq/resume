# 黄文强｜个人主页

这是一个介绍个人经历与项目的静态网站，面向求职沟通和项目展示。页面使用原生 HTML、CSS 和 JavaScript，不需要构建步骤，也没有第三方运行依赖。

## 页面内容

- 教育经历、专业技能和实习经历
- 服务端开发、AI Agent 与推荐系统项目
- 科研经历、荣誉证书及联系方式
- 适配手机和桌面的排版；水墨动效可手动暂停，并遵循系统的减少动态效果设置

## 本地预览

在仓库根目录启动任意静态文件服务器即可。例如：

```bash
python3 -m http.server 8000
```

Windows 也可以运行 `py -m http.server 8000`。打开 <http://127.0.0.1:8000> 查看页面。此命令只用于本地预览，线上由 Nginx 提供静态文件。

## 目录结构

```text
.
├── assets/
│   ├── css/       页面样式
│   ├── js/        页面交互
│   ├── favicon.svg
│   └── profile-blue.png
├── deployment/   Nginx 配置与服务器部署说明
├── index.html
└── README.md
```

## 部署

服务器安装 Nginx 和 Git 后，将仓库放到 `/var/www/resume`，再启用 `deployment/resume-site.conf`。该配置在服务器本机 `127.0.0.1:2000` 提供页面；`deployment/hellowq-proxy.conf` 则将 `hellowq.icu` 的 HTTP 请求转发到这个端口。完整步骤、阿里云镜像设置、DNS 和更新命令见 [`deployment/README.md`](deployment/README.md)。

站点没有 `npm install`、`pip install` 或构建产物。ECS 使用 Alibaba Cloud Linux 3 时，系统默认的软件仓库已经是阿里云镜像；Ubuntu ECS 可按部署说明切换 APT 源。
