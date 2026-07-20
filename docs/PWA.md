# PWA 实现说明

本项目已经接入 PWA 能力，可以在支持的浏览器中安装到桌面或手机主屏，并在离线状态下打开应用壳继续使用。

## 改动文件

- `index.html`：声明 Web App Manifest、主题色、iOS 主屏配置，并注册根目录的 Service Worker。
- `manifest.webmanifest`：定义应用名称、启动地址、显示模式、主题色、图标和快捷方式。
- `sw.js`：预缓存应用壳资源，并为离线访问提供缓存回退。
- `assets/icons/`：提供 192 x 192、512 x 512 和 maskable 512 x 512 PNG 图标。
- `scripts/generate-pwa-icons.cjs`：生成 PWA PNG 图标。

## 实现方式

### 1. Web App Manifest

`manifest.webmanifest` 让浏览器知道这个静态站点可以作为应用安装：

- `start_url` 和 `scope` 都使用 `.`，适配 GitHub Pages 这类子路径部署，也适配根域名部署。
- `display` 使用 `standalone`，安装后会以类似原生应用的独立窗口打开。
- `theme_color` 和 `background_color` 与现有界面主色保持一致。
- `icons` 提供标准图标和 `purpose: "maskable"` 图标，提升 Android 主屏图标兼容性。

### 2. Service Worker

`sw.js` 放在仓库根目录。Service Worker 的作用域默认等于它所在目录，因此可以覆盖整个静态应用。

安装阶段会预缓存这些关键资源：

- 首页：`./`、`./index.html`
- 样式和脚本：`assets/styles.css`、`assets/mard-palette.js`、`assets/app.js`
- 色卡图片：`assets/mard-color-chart.png`
- PWA 配置和图标：`manifest.webmanifest`、`assets/icons/*.png`

访问页面时：

- 页面导航优先请求网络，失败时回退到缓存的 `index.html`。
- 静态资源优先读取缓存，未命中时再请求网络，并把成功响应写入当前版本缓存。
- 激活新版本时会删除旧缓存，避免长期保留过期资源。

### 3. HTML 接入

`index.html` 通过下面的声明启用安装信息：

```html
<link rel="manifest" href="./manifest.webmanifest" />
<meta name="theme-color" content="#0f8f86" />
<link rel="apple-touch-icon" href="./assets/icons/icon-192.png" />
```

页面加载完成后注册 Service Worker：

```html
<script>
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
</script>
```

## 本地验证

Service Worker 需要在 `localhost` 或 HTTPS 环境运行。可以启动本地静态服务：

```bash
npm run dev
```

然后打开：

```txt
http://localhost:5173
```

在 Chrome DevTools 里检查：

1. Application -> Manifest：确认名称、图标、主题色和 `standalone` 显示模式正常。
2. Application -> Service Workers：确认 `sw.js` 已注册并处于 activated 状态。
3. Application -> Cache Storage：确认存在 `bead-pattern-tool-pwa-v1` 缓存。
4. 勾选 Offline 后刷新页面：页面仍应正常打开。

如需重新生成默认图标：

```bash
npm run icons
```

## 发布注意事项

- 线上部署必须使用 HTTPS；GitHub Pages、Cloudflare Pages、Vercel 默认都满足。
- 修改被预缓存的文件后，需要同步更新 `sw.js` 里的 `CACHE_VERSION`，让用户拿到新缓存。
- 如果改动了资源路径或文件名，也要同步更新 `APP_SHELL` 列表。
- 用户上传的本地图片不会被缓存；PWA 只缓存应用本身，不保存用户图片数据。
