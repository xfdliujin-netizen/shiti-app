# 拾题 · 错题本

新增 Worker + D1 私人云端架构：设置页可打开云端登录并手动同步错题、压缩题图、练习及学情档案。服务默认关闭，需按 [cloud/README.md](cloud/README.md) 创建 D1、配置 Access 后启用；不使用 R2。离线题库与 JSON 备份继续保留。验证：`node cloud/check.mjs`、`node cloud/client-check.mjs`。

**当前默认已改为：框选 → 百度高精度 OCR → 校对原文 → DeepSeek 文字分析。** 百度接入、代理部署与实际填写方法请优先阅读 [BAIDU-OCR.md](BAIDU-OCR.md)。下面保留原有功能说明和版本记录。

无需构建、无第三方运行时依赖的个人错题本。四个 Tab：录题、错题本、练习、设置。浅灰与白色卡片、苹果系统字体、移动端底栏。

## 本地启动

安装 Node.js 后，在此文件夹运行 `node server.cjs`（或 `npm start`），打开 http://127.0.0.1:4173 。支持解压后双击 index.html 打开（浏览器须允许本地文件使用存储）。推荐通过本地服务访问，以获得稳定的站点来源。本地与 Pages 是不同来源，迁移请导出 / 导入 JSON。

## 部署 GitHub Pages

1. 新建网站代码仓库，将此目录内的 index.html、style.css、app.js、paper.js、crop.js、baidu.js、.nojekyll 上传至仓库根目录。
2. 仓库 Settings → Pages → Build and deployment → Deploy from a branch，选择 main 和 / (root)，保存。
3. 等待 Pages 完成，访问 GitHub 给出的地址。静态资源使用相对路径，适配 `用户名.github.io/仓库名/`，无需修改 base path。
4. 在网页设置里填写自己的 API Key。不要把任何密钥写入代码或仓库。

目前只生成了本地源码，未创建 GitHub 仓库或发布网站。

## DeepSeek

设置默认 API 地址 https://api.deepseek.com，默认模型 deepseek-flash。依据 2026-11-13 官方 Vision 文档，该模型支持图片，通过 Chat Completions 的 image_url 发送 base64 图片。模型可在设置中调整。支持文字录题和图片录题，支持整卷逐题转录：先扫描目录，图片按单栏或双栏切分为带重叠的上中下细节图，再分别转录。对照题号显示可能遗漏，跨栏重复题保留并提示人工合并，不静默删除。转录不解题、不判断错题。人工校对并选中后，可逐题分析或直接收录原文。可以不调用 AI，手动整理题目。

原始图片、题干、学生答案 / 困惑会在识题时发给 API；生成变式会发送原题和知识点。AI 结果仅辅助学习，需核对答案。练习采用自评，不进行自动评分。

API Key 和 GitHub Token 仅存 sessionStorage；浏览器恢复会话时可能恢复它们。其他配置存 localStorage；题库、图片、练习记录存 IndexedDB。不使用第三方脚本。纯前端无法保密密钥，只适合个人使用。公开多人服务应通过自己的鉴权代理调用 API，并设置额度限制。API 必须支持浏览器 CORS；浏览器跨域失败需使用你自己的兼容代理，代理 URL 填入 API 地址，不要带 /chat/completions。

## 私有仓库还是 Gist？

推荐独立的 GitHub 私有仓库。Secret Gist 并不是真正私密，任何有链接的人都能读取。本站实现的是私有仓库同步，不实现 Gist 同步。

1. 新建私有数据仓库，例如 shiti-data，勾选 Add a README，让 main 分支存在。与 Pages 代码仓库分开。
2. GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens，新建只授权数据仓库的 Token，Repository permissions 的 Contents 选择 Read and write。
3. 网页设置中填 owner、repo、branch、path 和 Token。默认路径 shiti/notebook.json。
4. 点击「合并并同步」。首次创建 JSON，之后先读取再按记录更新时间合并。相同 ID 使用更新时间较新的记录，删除以 tombstone 传播。不同设备的时钟应保持准确；此方案不提供字段级协同编辑。Github SHA 冲突时停止写入，可重新同步重试。本地合并结果会保留。

同步为手动触发，不是后台自动同步。图片内嵌 JSON，文件上限 20 MB；适合个人轻量题库。频繁图片上传或多人使用应改用对象存储和数据库。备份及私有仓库文件不包含 API Key、Token 或连接配置。导入采用合并，不覆盖已有题库。删除题目不会清理 Git 历史中的旧版本和图片。

## 功能

- 分科录题；上传 / 拖放图片、文字录入、手工整理。
- AI 识别、解题步骤、针对性提醒、知识点标签；确认后自动编号。
- 搜索题干 / 编号 / 标签，科目和掌握状态筛选；详情、编辑、删除。
- 单道错题生成 1 或 3 道变式，可选三档难度；先作答，再查看答案与解析，自评后保存记录。
- 本地持久保存、JSON 备份 / 合并导入、GitHub 私有仓库手动同步。

## 验证边界

没有用户 API Key 或 GitHub Token，无法代为完成真实模型与仓库的端到端验证。`node --check app.js` 可检查 JavaScript 语法，`node check.cjs` 可执行核心逻辑检查。使用「体验示例题」可以离线体验题目管理；AI 功能需要配置真实密钥。

参考：[DeepSeek Vision](https://api-docs.deepseek.com/guides/vision/) · [GitHub Gist 隐私说明](https://docs.github.com/en/get-started/writing-on-github/editing-and-sharing-content-with-gists/creating-gists)

## 整卷识别修复（2026-11-13）

旧版提示词为“分析一道错题”，单对象返回格式无法容纳整张试卷，且缺少题号覆盖校验，可能漏题或出现不忠于原卷的文字。现改为目录扫描 + 分栏重叠切片转录 + 人工核对 + 逐题分析。

这张左右两页的课堂练习请选择“双页 / 双栏”，科目选“语文”。先点“逐题识别试卷”，核对目录、每题全文、全部选项与学生答案；选择要收录的错题，勾选各题核对确认，再分析与收录。可展开原图对照，也可手工补录漏题。默认不选择任何题目，不把教师笔迹当作可靠错题判据。填空题按小题收录，保留该小题的全部空；选择题保留全部选项。

双栏图片通常调用三次 API（目录一次、每栏三张细节图各一次），单栏或文字通常两次；分析另按每题一次计费。返回截断或 JSON 错误时拒绝采用该批结果，失败时保留已完成的转录与解析。待确认内容仅保留在当前页面内存中，刷新前请收录或复制备份。分区可改善细节输入，但不保证 OCR 无误或无遗漏，目录扫描也可能出错，仍须人工核对。

更新 GitHub Pages：覆盖 index.html、app.js、style.css，新增 paper.js 和 crop.js，保持五个文件同目录。无需删除已有题库，代码仓库和私有数据仓库请分别管理。

验证：node paper-check.cjs（模拟模型响应，验证多图请求、分区覆盖、缺项提示、核对门槛、输出截断和部分失败保留）；node check.cjs；node --check app.js；node --check paper.js。没有真实 API 凭据，未对用户原卷完成真实模型验收。

## 框选省量模式（当前默认）

上传图片后，在图片上拖动框选完整题目。拖框内可移动，拖四角可调整，也可填左边 / 上边 / 宽 / 高的百分比。左右旋转按钮每次旋转 90°，微调滑杆可调整 ±15°。旋转后需重新框选，避免错误坐标。可展开“实际将发送的框内图片”核对裁剪内容。旋转和裁剪完全在浏览器本地完成，不调用 AI。

默认“取景框内”模式：只发送一张裁剪后的 PNG，不发送原图、不做目录扫描、不自动分块。转录一次后，人工核对并按需另行分析。保存的题目图片也是裁剪图。无选框会阻止请求；选择范围过小或导出过大时需重新框选。框内有多题时仍逐题返回，但不推测任何框外材料或选项。

OCR system 和 user 提示共同要求错字、错误拼音、病句、错误标点和学生错误答案照录，不得按语义或教材自动更正；不能辨认的具体位置标注【无法辨认】。不会用代码对 OCR 原文作错字替换。正确写法仅可出现在答案与解析字段，不能回写题干。这是约束和产品流程，不能保证模型零幻觉，仍要对照图片核对。

“整张试卷”模式仍可手动选择，沿用目录与分栏流程。上一版双栏整卷共发送 7 张图片（全图 1 张 + 细节 6 张），当前框选模式发送 1 张。DeepSeek 官方 Vision 文档说明图片按尺寸转换为 token，每张独立计费，标准处理每图上限为 1024 tokens。裁剪面积减少不等于费用同比例减少；减少图片数量、输出文字及无关分析才是主要节省。逐框录完整卷时，请比较实际用量，可能不比整卷便宜。压缩文件 KB 不代表同比例减少 token，不应为了省量把文字压糊。

页面显示本次打开页面以来接口 usage 返回的累计输入、输出、总 token 和已返回请求数，未提供 usage 的请求标注用量未知。页面刷新会重置此显示；该统计不代替供应商账单、不估算价格。输出上限为框选转录 6000、整卷分栏转录 12000、其他调用 8000；上限不是预付 token 数，实际消耗看 usage。

更新 Pages 时请同时上传 index.html、app.js、paper.js、crop.js、style.css。新增长期可运行检查 node crop-check.cjs，覆盖裁剪坐标、旋转尺寸、错字原样保留、只上传选区的一次 OCR 请求、延后分析和 usage 汇总。当前通过的是本地逻辑与模拟 API 检查，未使用真实密钥完成模型精度和账单验证。

## 百度 OCR 版本（当前）

新增 baidu.js、proxy/worker.mjs、proxy/wrangler.toml、BAIDU-OCR.md、.env.example 和 baidu-check.cjs。本地 server.cjs 同时支持 /api/ocr，严格限制静态资源范围。默认百度模式下不再调用 DeepSeek 做识别或题目拆分：一框一道题，按原始返回行展示和保存。DeepSeek 在校对后按需做文字分析或变式题；旧版 DeepSeek 识图保留为显式可选服务。

Worker 代理部署和真实凭据尚未配置，单独上传网页后还需按 BAIDU-OCR.md 设置代理。网页源文件兼容 GitHub Pages；百度 AK/SK 仅配置在后端，不进入网页。原有题库结构向后兼容，增加原始 OCR 对照字段，不清空已有数据。
