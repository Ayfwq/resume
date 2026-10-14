# 阿里云 ECS 部署

本项目是静态网站，线上只需 Nginx 提供 HTML、CSS、JavaScript 和图片文件。无需安装 Node.js、Python 运行环境或项目依赖。

## 服务器软件

推荐 Alibaba Cloud Linux 3。该系统默认使用阿里云软件仓库：

```bash
sudo dnf makecache
sudo dnf install -y nginx git
```

如果 ECS 使用 Ubuntu 24.04 x86_64，可将系统源切到阿里云 ECS 内网镜像后安装 Nginx 和 Git。先备份原配置，再替换 Ubuntu 官方源地址：

```bash
sudo cp -a /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list.d/ubuntu.sources.bak
sudo sed -i -E 's#https?://(archive|security).ubuntu.com/ubuntu/?#http://mirrors.cloud.aliyuncs.com/ubuntu#g' /etc/apt/sources.list.d/ubuntu.sources
sudo apt-get update
sudo apt-get install -y nginx git
```

此 ECS 内网域名适用于阿里云 ECS 网络。其他网络环境可使用 `https://mirrors.aliyun.com/ubuntu`；ARM 版 Ubuntu 应使用阿里云的 `ubuntu-ports` 镜像。请按服务器发行版和版本选择对应源，不要把 Ubuntu 的源配置用于 Alibaba Cloud Linux。参考：[阿里云 Ubuntu 镜像说明](https://developer.aliyun.com/mirror/ubuntu)、[Alibaba Cloud Linux 镜像说明](https://developer.aliyun.com/mirror/alinux)。

## 部署站点

以下命令会把公开 GitHub 仓库克隆到 Nginx 使用的目录：

```bash
sudo git clone --branch main https://github.com/Ayfwq/resume.git /var/www/resume
sudo cp /var/www/resume/deployment/resume-site.conf /etc/nginx/conf.d/resume-site.conf
```

`resume-site.conf` 让 Nginx 在 `127.0.0.1:2000` 提供静态页面，供本机反向代理访问。它不把 `2000` 端口暴露到公网。

如果这台服务器还运行投研智报和巡脉服务，并且它们分别监听本机 `3000`、`5000` 端口，可启用仓库中的域名入口配置：

```bash
sudo cp /var/www/resume/deployment/hellowq-proxy.conf /etc/nginx/conf.d/hellowq-proxy.conf
```

该配置将 `hellowq.icu` 转发到 `2000`，并将 `trading.hellowq.icu`、`oncall.hellowq.icu` 分别转发到 `3000`、`5000`。如果只部署个人主页，请不要启用这个包含其他项目域名的配置；可在现有入口 Nginx 中单独将主域名转发到 `127.0.0.1:2000`。

启动 Nginx 并检查配置：

```bash
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

将 `hellowq.icu` 的 DNS A 记录指向 ECS 公网 IP。若使用仓库提供的 HTTP 入口配置，在阿里云安全组放行 TCP 80；只有在另行配置了 HTTPS 证书和 443 虚拟主机后才放行 TCP 443。`hellowq-proxy.conf` 本身只监听 HTTP 80。

## 发布更新

代码合并到 `main` 后，在服务器执行：

```bash
sudo git -C /var/www/resume pull --ff-only origin main
```

Nginx 直接读取仓库中的静态文件，通常无需重启服务。若更新了 Nginx 配置，再执行 `sudo nginx -t` 和 `sudo systemctl reload nginx`。

## 配置文件说明

| 文件 | 用途 |
| --- | --- |
| `resume-site.conf` | 个人主页静态站点，监听本机 `127.0.0.1:2000` |
| `hellowq-proxy.conf` | 主域名及两个项目子域名的 HTTP 反向代理入口 |

两个 Nginx 配置均放在 `/etc/nginx/conf.d/` 时，会由 Nginx 的 `http` 配置上下文加载。若服务器采用其他 Nginx 目录布局，将文件放在发行版对应的站点配置目录即可。
