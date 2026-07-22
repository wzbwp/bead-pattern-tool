# 自定义域名配置说明

当前线上地址是 GitHub Pages 默认地址：

```txt
https://wzbwp.github.io/bead-pattern-tool/
```

买好自己的域名后，可以把它绑定到这个项目的 GitHub Pages。推荐使用子域名，例如：

```txt
beads.your-domain.com
```

也可以使用根域名，例如：

```txt
your-domain.com
```

## 推荐方案：子域名

子域名配置最稳，DNS 也最简单。

### 1. DNS 添加 CNAME 记录

在域名服务商后台添加：

```txt
记录类型：CNAME
主机记录：beads
记录值：wzbwp.github.io
```

如果你想使用 `www.your-domain.com`，主机记录就填 `www`。

### 2. 仓库添加 CNAME 文件

复制 `CNAME.example` 为 `CNAME`，把内容改成你的真实域名：

```txt
beads.your-domain.com
```

提交并推送到 `main` 后，GitHub Actions 会自动把 `CNAME` 一起发布到 `gh-pages` 分支。

### 3. GitHub Pages 填写域名

进入 GitHub 仓库：

```txt
Settings -> Pages -> Custom domain
```

填写你的域名，例如：

```txt
beads.your-domain.com
```

保存后等待 DNS 检查通过，再勾选 `Enforce HTTPS`。

## 根域名方案

如果使用 `your-domain.com` 这种根域名，需要在 DNS 添加 A 记录指向 GitHub Pages：

```txt
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

同时可以添加 IPv6 AAAA 记录：

```txt
2606:50c0:8000::153
2606:50c0:8001::153
2606:50c0:8002::153
2606:50c0:8003::153
```

仓库里的 `CNAME` 文件内容填写根域名：

```txt
your-domain.com
```

## 发布流程

本项目的 `.github/workflows/static.yml` 已经支持发布 `CNAME` 文件：

```txt
main 分支推送 -> GitHub Actions -> gh-pages 分支 -> GitHub Pages
```

所以买好域名后，项目侧只需要做三件事：

1. 添加或修改 `CNAME` 文件。
2. 提交并推送到 `main`。
3. 在 GitHub Pages 设置里填写相同域名并启用 HTTPS。

## 验证

DNS 生效后检查：

```bash
curl -I -L https://你的域名/
curl -I -L https://你的域名/manifest.webmanifest
curl -I -L https://你的域名/sw.js
```

三个地址都返回 `200` 后，网站和 PWA 文件都已经发布到新域名。

## 注意事项

- 域名刚配置后通常需要等待几分钟到数小时生效。
- GitHub Pages 的 HTTPS 证书签发也可能需要等待一段时间。
- PWA 的 `manifest.webmanifest` 和 `sw.js` 已经使用相对路径，默认地址和自定义域名都能工作。
- 如果你想同时使用根域名和 `www`，建议让其中一个跳转到另一个，避免浏览器里出现两套 Service Worker 缓存。
