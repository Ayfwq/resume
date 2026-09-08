# Personal Resume · 个人简历网站

Wenqiang 的纯静态个人简历网站，使用暖白、珊瑚橙和薄荷绿营造轻快、阳光的视觉氛围。

## 特点

- 首屏只显示 `WELCOME`，约 1.2 秒后渐变淡出并进入完整简历。
- 响应式布局，适配桌面和移动端。
- 关于我、技能、经历、作品集和联系方式完整展示。
- 零依赖，HTML / CSS / JavaScript 可直接部署。

## 本地预览

```bash
python -m http.server 8000
```

然后打开 <http://127.0.0.1:8000>。

## 部署目标

目标域名为 `hellowq.icu`，服务器目录为 `/var/www/resume`，由 Nginx 提供静态文件服务。

更新网站代码后，在服务器执行：

```bash
cd /var/www/resume
git pull --ff-only origin main
```
