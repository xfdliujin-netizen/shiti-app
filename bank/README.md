# 独立题库试点

首批：50 道 CMATH 数学应用题，适用范围保守映射到小学三、四年级，覆盖 10 个知识点。教材章节和上、下学期未逐项核验，不宣称与江苏教材精确同步。

## 来源与核对

- 来源：[XiaoMi/cmath](https://github.com/XiaoMi/cmath)，固定版本 `9fa13ef0b2d03f5a18c1ace7001248d3981d65ea` 的 `datasets/cmath_dev.jsonl`。
- 作者：Tianwen Wei, Jian Luan, Wei Liu, Shuang Dong, Bin Wang；CMATH，2023。
- 数据许可：CC BY 4.0；完整文本见 [CC-BY-4.0.txt](CC-BY-4.0.txt)。源仓库代码的 MIT 许可不替代数据许可。
- 每题保留原文、原始年级、原答案、永久来源行链接、署名与许可。
- 本系统补充解析、知识点、难度与保守适用年级。`curation.cjs` 保存每题核对用的算式及说明，构建时逐题复算并与原答案比较。
- `reviewStatus=checked` 表示完成上述复算和本轮题意核对，**不是教师签审**；`teacherReviewed=false`。原作者不为这些增补背书。
- 原数据中有些题目存在错误或歧义；`seed.json` 的 excluded 明确记录排除项，例如第262行两只熊猫四天共56千克，单只每天应为7而原答案为14。

重建种子（只读取公开原始数据，不调用模型）：

```sh
node bank/build-seed.cjs path/to/cmath_dev.jsonl
node bank-check.cjs
```

构建得到 seed.json 与 seed.sql；清单包含源文件和题目内容 SHA-256。`INSERT OR IGNORE` 保证重复执行不复制题目，不更新孩子的 records 表。

## D1 与接口

新增独立的 bank_questions、bank_batches 表及索引，迁移文件为 schema.sql。沿用 cloud/wrangler.toml 的数据库绑定和 Access 保护：

```sh
npx wrangler d1 execute shiti-notebook --config cloud/wrangler.toml --remote --file bank/schema.sql
npx wrangler d1 execute shiti-notebook --config cloud/wrangler.toml --remote --file bank/seed.sql
npx wrangler deploy --config cloud/wrangler.toml
```

- `GET /api/bank`：按科目、年级、已学知识点、难度筛选，单页最多20题；列表不返回答案和解析。
- `GET /api/bank/item?id=...`：读取一道已核对题目的详情。
- `GET /api/bank/items?ids=...`：一次读取最多10道指定题目的详情，用于组卷。
- 网页没有题库写接口。未认证流量不进入 D1；读取沿用现有每日请求上限；参数使用白名单和绑定查询。

## 使用与学习记录

- 举一反三 → 题库练习：读取、按知识点筛选、开始练习。原题练习及单一数值核对不调用 AI。
- 整理成试卷 → 题库组卷：在已学范围内选指定数量的原题；不足时提示，不重复凑数。每次最多10题、最多读取5页候选，首批数据实际最多3页。
- AI 变式按钮只在主动点击时生成1道新题，并标明 AI 变式；母题的许可与来源保留。
- 学情档案 → 已学内容与解题方法：一套进度，不区分校内校外；年级是默认参考，明确已接触的知识点可适度提前，未学的方法与前置知识会阻止选题。
- 在已加载的候选中，参考待复习、已归档数值/AI判定与近期重复情况排序；不是全库模型扫描。
- 数值核对支持有限长度的整数、小数及分数，使用精确有理数比较。不自动分析步骤、推断错因或处理单位换算；单位不同、长过程或格式不支持时返回“暂不判断”。
- 查看答案后再答、核对结果后修改答案，都会标记为参考答案后的练习，不计作独立答对。
- 练习需自评归档后才进入 practices 与学情摘要；浏览、导入、组卷本身不会增加孩子的错题或掌握记录。程序数值核对、AI判定与自评分别统计，不自动宣称掌握。
- 公共题目缓存保存在本机独立 bank-cache:v1，最多100条列表与100条已读取详情；只保存当前云端来源的缓存。学习记录仍按既有流程手动同步 D1。

题库本身不会进入模型上下文。AI 变式每次只使用所选一道母题和现有的有限学情摘要。PDF/打印附带原始来源、署名、许可及改编说明。
