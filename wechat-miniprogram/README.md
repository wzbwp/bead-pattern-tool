# 拼豆图纸解析工具微信小程序

这是一个原生微信小程序工程，和 Web/PWA 版本共存在同一个仓库中，目录为：

```txt
wechat-miniprogram/
```

## 当前功能

- 从相册或相机选择图片
- 设置图纸宽度和高度
- 快捷选择 52 x 52、78 x 78、104 x 104 面板尺寸
- 选择采样方式：经典还原、主导色采样、区域平均、中心取样
- 选择颜色上限：自动匹配、A-M 全色号、72/48/24/12/8/6 色
- 支持水平/垂直镜像
- 支持显示网格线和色号
- 生成拼豆图纸预览
- 生成后可在画布上点按或拖动单格改色，并支持吸管和撤销
- 统计每个色号所需数量
- 保存 PNG 图纸到手机相册

## 和 Web 版本的差异

小程序版优先实现核心工作流：选图、解析、预览、统计、保存 PNG。
当前小程序也支持基础的画布手动改色，和 Web 版一样可以通过色板选择画笔、吸管取色和撤销。

暂未迁移 Web 版中的增强功能：

- 图片裁剪、旋转、去背景编辑器
- CSV / JSON 文件导出
- PWA 离线安装能力

这些能力后续可以继续补到小程序版中。

## 本地开发

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择：

```txt
wechat-miniprogram
```

4. 如果只是预览代码，可以先使用游客模式或测试号。
5. 如果要上传发布，把 `project.config.json` 里的 `appid` 改成你自己的小程序 AppID。

```json
{
  "appid": "你的小程序 AppID"
}
```

## 发布到微信小程序

### 1. 注册小程序

进入微信公众平台：

```txt
https://mp.weixin.qq.com/
```

注册“小程序”，完成主体认证或个人主体配置。

### 2. 获取 AppID

在微信公众平台进入：

```txt
开发 -> 开发管理 -> 开发设置
```

复制 AppID，填入 `wechat-miniprogram/project.config.json`。

### 3. 开发者工具预览

在微信开发者工具中点击“编译”，确认：

- 能正常选择图片
- 能生成图纸
- 用色清单正常显示
- 保存 PNG 时能触发相册权限并保存成功

### 4. 上传版本

在微信开发者工具右上角点击“上传”，填写版本号和项目备注，例如：

```txt
版本号：1.0.0
项目备注：首版拼豆图纸解析工具
```

### 5. 提交审核

回到微信公众平台：

```txt
管理 -> 版本管理 -> 开发版本
```

把刚上传的版本提交审核。审核通过后点击发布。

## 代码结构

```txt
wechat-miniprogram/
  app.js
  app.json
  app.wxss
  project.config.json
  sitemap.json
  pages/
    index/
      index.js
      index.json
      index.wxml
      index.wxss
  utils/
    mard-palette.js
    pattern-engine.js
```

## 色卡维护

小程序版色卡来自 Web 版的 `assets/mard-palette.js`。如果 Web 色卡更新，运行下面命令同步到小程序：

```bash
npm run miniprogram:palette
```

生成结果会写入：

```txt
wechat-miniprogram/utils/mard-palette.js
```

## 技术实现

- 页面使用原生 WXML / WXSS / JS。
- `pages/index/index.js` 负责调用微信 API 选择图片、读取 Canvas 像素、绘制预览和保存 PNG。
- `utils/pattern-engine.js` 是从 Web 版本迁移出的无 DOM 依赖解析模块，负责采样、自动取色、匹配 MARD 色号和绘制图纸。
- 小程序不需要服务器，也不上传用户图片，所有解析都在本地完成。

## 提审提示

小程序涉及相册读取和保存图片，提审时可以在版本说明里写：

```txt
本工具用于把用户本地选择的图片转换为拼豆图纸。图片仅在本地 Canvas 中处理，不上传服务器。保存图片用于把生成的拼豆图纸写入用户相册。
```
