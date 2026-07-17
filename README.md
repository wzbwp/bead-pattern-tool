# 拼豆图纸解析工具

一个纯前端拼豆图纸解析工具。上传图片后，浏览器会在本地用 Canvas 采样图片，将每个格子转换为拼豆小色块，并生成可预览、可导出的图纸。

## 功能

- 上传 PNG、JPG、WebP 等常见图片格式
- 设置拼豆图纸宽度、高度、采样方式和水平/垂直镜像
- 支持 52 x 52、78 x 78、104 x 104 面板快捷切换
- 上传图片可手动缩放和上下左右移动后重新采样
- 支持默认配色方案和 A-M 全色号/72/48/24/12/8/6 色上限
- 生成带长宽数字和 5 x 5 高亮网格的小色块图纸预览
- 自动统一相近轮廓色，并补齐轻微断开的外轮廓
- 统计每个色号需要的颗数
- 导出自动带色号、长宽数字和底部所需颜色清单的 PNG 图纸
- 导出 CSV 用色清单、JSON 原始数据

## 本地打开

这个项目没有依赖，直接打开 `index.html` 即可使用。

也可以在项目目录启动一个本地静态服务：

```bash
python3 -m http.server 5173
```

然后访问：

```txt
http://localhost:5173
```

## 部署到 Cloudflare Pages

1. 把本项目推送到 GitHub。
2. 打开 Cloudflare Dashboard，进入 Workers & Pages。
3. 创建 Pages 项目并连接 GitHub 仓库。
4. 构建配置填写：

```txt
Build command: npm run build
Build output directory: .
```

部署成功后会得到类似：

```txt
https://bead-pattern-tool.pages.dev
```

## 部署到 Vercel

1. 把本项目推送到 GitHub。
2. 打开 Vercel，导入仓库。
3. Framework Preset 选择 Other。
4. 构建配置填写：

```txt
Build Command: npm run build
Output Directory: .
```

部署成功后会得到类似：

```txt
https://bead-pattern-tool.vercel.app
```

## 颜色配置

当前配色方案为 `默认`，颜色套餐作为自动取色的颜色上限：

- `A-M 全色号 (最多 221)`
- `最多 72 色`
- `最多 48 色`
- `最多 24 色`
- `最多 12 色`
- `最多 8 色`
- `最多 6 色`

工具会根据选择的颜色上限，从当前图片中自动提取实际需要的代表色，并输出本张图纸的用色列表和数量。生成的颜色会分配到 A-M 系列色号，例如 `A1`、`A2`、`B1` 等；已知真实颜色会优先匹配，例如 `#FFFFFF` 对应 `H2`。

`A-M 全色号 (最多 221)` 会开放完整色号池，但不会强制输出 221 色；如果图片实际只需要约 50 色，就会输出约 50 色。`最多 72 色`、`最多 48 色`、`最多 24 色`、`最多 12 色`、`最多 8 色`、`最多 6 色` 会按对应数量限制代表色。

默认的 `细节增强` 采样会降低透明/白底对调色板的干扰，并轻微提高小面积装饰、线条和低饱和区域的权重。图纸越宽，细节越接近原图。照片类图片建议先尝试 80 到 140 颗宽，再根据实际拼豆板尺寸调整。

## 目录结构

```txt
bead-pattern-tool/
  index.html
  package.json
  assets/
    app.js
    styles.css
```
