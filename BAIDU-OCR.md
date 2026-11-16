# 百度 OCR 接入与部署

当前默认流程：**本地旋转与框选 → 百度高精度 OCR → 人工校对 → DeepSeek 文字分析 / 举一反三**。

百度负责识字，网页将 `words_result` 中每行的 `words` 原样拼接，不自动纠错、不调用 DeepSeek 重写转录。每个框作为一道题，选择题请框全题干和所有选项。印刷文字与手写答案可能混合，请自行区分。OCR 本身仍可能错认字，必须对照裁剪图校对。保存时会一并保留裁剪图、OCR 原始文本和返回的行记录。

## 一、准备百度接口

1. 登录百度智能云，完成实名认证，开通「文字识别」。
2. 在文字识别应用管理中创建应用，确认具有「通用文字识别（高精度版）」接口权限，获取该应用的 **API Key** 与 **Secret Key**。
3. 在控制台资源列表确认免费测试额度。额度不是应用自己发放；成功和失败调用均可能消耗免费次数，以百度控制台及当前规则为准。

本项目使用 `accurate_basic`，不是含位置版 `accurate`，两者免费额度不同。不自动购买或开通后付费，也不因额度不足自动切换其他模型。若你自行开通后付费，后续调用能否扣费由百度账户配置决定。

## 二、为什么需要代理

GitHub Pages 仅托管静态页面，不能运行服务端鉴权，也不能保护百度 Secret Key。项目提供轻量代理，负责换取并缓存百度 access token、转发选框图片、返回原始文字。代理不保存图片和识别内容，不调用 DeepSeek。

网页只填写 **OCR 代理地址 + 代理访问口令**。百度 AK/SK 不进入网页、不提交到代码仓库或数据仓库。代理访问口令与百度 AK/SK 是不同的东西，口令由你自己生成，至少 24 字符。

## 三、GitHub Pages 配合 Cloudflare Worker

不需要把网页搬到 Cloudflare，只单独部署 OCR 代理。

1. 在 Cloudflare 的 Workers 管理中创建一个 Worker。
2. 在代码编辑界面将默认代码替换为随附的 `proxy/worker.mjs` **全部内容**，保存并部署。该文件为独立的 Worker ES Module，无第三方依赖。
3. 在该 Worker 的设置中配置以下值（名称须完全一致）：

| 名称 | 类型 | 填写内容 |
|---|---|---|
| `BAIDU_API_KEY` | Secret | 百度应用的 API Key |
| `BAIDU_SECRET_KEY` | Secret | 百度应用的 Secret Key |
| `OCR_PROXY_TOKEN` | Secret | 自己生成的随机口令，至少 24 字符 |
| `ALLOWED_ORIGIN` | 普通变量 | `https://xfdliujin-netizen.github.io` |

`ALLOWED_ORIGIN` 只填网页的来源，**不带 `/online/`、不带末尾斜杠**。如果换成自定义域名，就填自定义域名的 `https://域名`。可使用英文逗号分隔多个明确来源。不要填 `*`。配置后重新部署使配置生效。

生成随机口令的方法（安装 Node.js 后，在终端执行；输出只用于你自己的配置，不要发送到聊天或提交仓库）：

```text
node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"
```

4. 复制实际 Worker 地址，例如 `https://你的Worker名称.你的子域.workers.dev`。**以你的 Cloudflare 控制台实际显示为准**。
5. 打开拾题 → 设置 → 图片文字识别：
   - 识别服务：保持「百度高精度 OCR → 校对 → DeepSeek 分析」。
   - OCR 代理完整地址：`https://你的Worker名称.你的子域.workers.dev/api/ocr`。
   - 代理访问口令：填第 3 步 `OCR_PROXY_TOKEN` 的相同值。
   - 点「保存 OCR 设置」。
6. 上传试卷，旋转到正向，框选一道完整题，点击「识别框内文字 · 百度 OCR」。
7. 核对题干、原题错字、选项、空格，手工分离可见学生作答。选择条目并勾选核对确认后，点击分析或直接收录。DeepSeek 分析需要另填自己的 DeepSeek Key，单独识别文字不需要它。

也可使用命令行部署：进入 `proxy` 目录，用 Wrangler 配置三个 Secret，`wrangler.toml` 已包含 `ALLOWED_ORIGIN` 示例。该项目未捆绑 Wrangler，命令行安装、登录及部署由你自己的 Cloudflare 账户完成。

## 四、本地运行（不用部署 Worker）

1. 使用 Node.js 22 或以上。
2. 将项目根目录的 `.env.example` 复制为 `.env`，编辑填入自己的百度 AK/SK 和随机口令。保持 `ALLOWED_ORIGIN=http://127.0.0.1:4173`。
3. 在项目根目录运行 `node server.cjs`，访问 `http://127.0.0.1:4173`。
4. 设置中的代理地址会默认显示 `http://127.0.0.1:4173/api/ocr`；填写 `.env` 中的同一访问口令，点保存。

本地 HTTP 服务只绑定 127.0.0.1，且只提供六个网页文件，不会提供 `.env` 或代理源码下载。`.env` 已列入 `.gitignore`，打包文件不包含实际 `.env`。请不要手动把自己的 `.env` 上传 GitHub。

双击 HTML 可以打开界面，但百度调用建议通过本地服务或 Pages 进行；`file://` 的来源是 `null`，默认代理不会授权该来源。

## 五、如何更新现有网站

向 GitHub Pages **代码仓库**上传并覆盖以下六个文件，放在相同目录：

- `index.html`
- `style.css`
- `app.js`
- `paper.js`
- `crop.js`
- `baidu.js`（新增）

无需删除私有数据仓库或已有本地题库。代理文件由 Worker 单独运行，不能只把 `worker.mjs` 上传到 Pages 就期待它工作。当前源码已接入，但尚未替你部署线上代理或设置真实百度凭据。

## 六、错误排查

| 提示 | 处理 |
|---|---|
| 无法连接 OCR 代理 | 检查实际代理地址、`/api/ocr` 路径、网络和 `ALLOWED_ORIGIN` |
| 网页来源未获允许 | 用页面地址的协议和域名配置来源，去掉 `/online/` 和末尾斜杠 |
| 访问口令不正确 | 网页口令与 Worker Secret / 本地 `.env` 必须一致 |
| 代理尚未配置 | 检查三项 Secret、来源变量及口令长度，重新部署 |
| 百度鉴权失败 | 检查 AK/SK 来自 OCR 应用，且已开通该服务权限 |
| 百度错误 6 | 检查该应用是否有高精度识别权限 |
| 百度错误 17 / 19 | 在百度控制台检查调用额度，应用不会自动重试 |
| 图片编码过大 / 长边超限 | 缩小选框，保留完整的这一题，不要把文字压糊 |

识别一次框图只发送一次 OCR 请求；服务端会缓存鉴权 token。失败不会自动重试；百度凭据过期时会清除缓存，下次手动识别重新换 token。DeepSeek 仅在你点击分析或练习时调用。免费额度剩余量只能在百度控制台确认，本应用不声称识别一定免费。

## 验证范围

`node baidu-check.cjs` 检查：只上传裁剪图、无 DeepSeek Key 也可 OCR、原行与错字不改写、错误保留已有草稿、手动文字无 API 调用、代理跨域与口令鉴权、access token 缓存、失败不重试和不返回服务端密钥。其余检查见 `package.json`。

当前为本地逻辑和模拟上游响应验证，尚未使用你的百度 / DeepSeek 凭据完成真实识别精度和额度验收。

参考：[百度高精度 OCR API](https://aca.bce.baidu.com/doc/OCR/s/1k3h7y3db) · [百度免费测试资源](https://ai.baidu.com/ai-doc/OCR/fk3h7xu7h) · [Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
# v21 识别与作答证据修复

当前前端以用户提供的 v20 UI 为基准。默认请求高精度含位置版 accurate，需百度对应权限；没有权限可在设置中选纯文字兼容版，不自动重试。位置不代表手写分类：必须核对原题、单独确认孩子作答，圈画、批注和加点信息不可从纯文字推断。详情和验证边界见 [OCR-REVIEW.md](OCR-REVIEW.md)。生产 Worker 名称为 baidu-ocr-proxy，自定义域名 ocr.86518925.xyz；下文早期部署示例仅作历史参考。

