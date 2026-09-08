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

## 部署

当前站点已通过 Nginx 部署在独立的 `2000` 端口：

- 访问地址：<http://8.138.47.45:2000>
- 服务器目录：`/var/www/resume`
- Nginx 站点配置：`/etc/nginx/sites-available/resume`
- 目标域名：`hellowq.icu`（需要将根域名 A 记录指向服务器 IP）

更新网站代码后，在服务器执行：

```bash
cd /var/www/resume
git pull --ff-only origin main
```
