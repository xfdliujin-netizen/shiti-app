# Worker + D1 私人云端架构

现有 GitHub Pages 网站继续使用 shiti.86518925.xyz；本目录提供独立的 api.86518925.xyz Worker。仅用 D1，无 R2、DO、第三方运行时依赖。同步由用户手动触发，不会自动上传本地题库。

## 当前部署状态（2026-11-16）

D1 已初始化，shiti-data Worker 已部署并启用，绑定 api.86518925.xyz。Access 应用“拾题私人数据”只允许用户确认的本人邮箱，邮箱以 Worker Secret 配置；团队域名 aged-cake-0b04.cloudflareaccess.com，应用 ID 7eeac063-484c-47b3-b96d-f47651a615ef。后台已确认 Zero Trust Free 和 Workers Free。

上线验证：匿名 GET/PUT 均 302 跳转 Access 登录，OPTIONS 为 204，精确来源与 credentials 响应正确。后端 SQLite/JWT、两设备同步和核心检查通过。尚待用户邮箱验证码登录后的真实题库同步验收；验证码不应提供给代理或写入代码。首次同步前请先导出 JSON 备份。

## 已实现

- 设置页提供云端登录和手动增量同步。IndexedDB 保留离线题库，原有 GitHub 同步与 JSON 导出仍可用。
- questions/practices 按条同步；题目删除以 tombstone 传播；学段、年级、教材地区作为独立 profile 记录同步，API Key 和 Token 不上传。
- D1 records 使用服务器单调序号分页拉取、乐观版本锁提交；同条记录两边都有变化时提示冲突并保留两边。初版不提供冲突编辑器，需备份后人工处理。首次两台设备已有同 ID 数据且内容不同也会停止，不静默选一边。
- 图片在浏览器压缩为 JPEG（最长边 1600，最高 300000 字节），云端以 SHA-256 去重，单独存 BLOB。列表拉取不含 BLOB；同步收到带新图片的记录时另行下载，存本地以支持离线查看。压缩无法达标则提示重新裁剪，不静默丢图。
- 签名验证 Access JWT 的 issuer/audience/expiry/email；验证前零 D1 访问。只允许一个固定邮箱，整个数据库对应一个孩子，不是多人租户系统。不要直接更换白名单邮箱用于另一个孩子。
- 写请求校验精确 Origin；预检不访问数据库。UTC 每日最多 10000 个已授权请求、2000 次写请求（包括题图请求）；D1 原子条件更新执行配额。图像总量保守限制为 200 MiB；元数据仍受 D1 平台容量约束。STORAGE_ENABLED 总开关在数据库访问前执行。

## 部署（在 review-app/cloud 目录执行）

以下为重新部署或在其他账户部署时的参考流程，当前账户已有资源无需重复创建。需要 Node.js 与 Wrangler CLI，以及你自己的 Cloudflare 登录。不要把账户 Token 写进源码。

```powershell
npx wrangler login
npx wrangler d1 create shiti-notebook
```

把返回的 database_id 填入 wrangler.toml，然后初始化专用数据库：

```powershell
npx wrangler d1 execute shiti-notebook --remote --file=./schema.sql
```

1. 在 Cloudflare Zero Trust 创建 Access Self-hosted 应用，覆盖 api.86518925.xyz 全路径；仅允许你的邮箱登录，禁止 Everyone/Bypass 放行业务接口。记录 team domain 与应用 AUD。
2. 将 ACCESS_ISSUER、ACCESS_AUD、ALLOWED_EMAIL 写入 Worker 配置 vars 或后台环境变量。ALLOWED_EMAIL 也可以作为 Secret 配置，以免邮箱进入公开仓库。启用 MFA。
3. GitHub Pages 前端使用跨域带 Cookie 的 fetch：Access 应允许 OPTIONS 预检通过（OPTIONS 无业务访问），并配置精确 Origin、credentials 与 GET/PUT/OPTIONS。不要让业务 GET/PUT 绕过 Access。后台设置的实际名称以账户界面为准。先在新标签页打开 /api/session 完成登录；预检和 Cookie 行为须在目标浏览器实测。
4. 取消 routes 示例注释，确认域名属于当前 Cloudflare zone。workers.dev 与预览入口保持关闭；如有 Worker 级 Access 功能，可加上并核实它与域名策略一致。
5. 保持 STORAGE_ENABLED=false，执行 npx wrangler deploy。验证匿名请求被边缘 Access 拦截，备用入口关闭。
6. 检查 Workers/D1 是否为 Free 套餐，避免为本项目自动启用付费依赖；配置可用的边缘 WAF/限速。如果账户已有 Workers Paid，应复核费用保护，不能把此项目代码当全账户账单上限。
7. 最后改 STORAGE_ENABLED=true 并部署。打开网站设置，先导出 JSON，再云端登录、合并并同步。核对题目、图片、练习、删除记录及另一设备的下载。

## 验证

```powershell
node cloud/check.mjs
node cloud/client-check.mjs
node check.cjs
```

后端测试用真实 SQLite 执行 schema 和 SQL、真实 RSA 签名测试 JWT，无开发免登录后门。浏览器同步测试模拟两设备和服务端版本锁。尚未验证真实 D1 网络、Access 登录/CORS、真实浏览器图片清晰度与缩图结果，因此不宣称已上线。

## 防攻击与维护边界

- 重点是边缘 Access/WAF 拦截陌生人，应用内限额只作为后备。内部返回 401/429 仍可能消耗 Worker 请求。额度数据库故障返回 503，禁止继续业务调用。免费套餐被攻击可能暂时不可用；本地使用不受影响。
- 所有账户共享一个专用数据库，单邮箱白名单；不对客户端开放 SQL 或数据库凭据。参数绑定防止 SQL 注入。云端接口仅存储数据，不代理百度/DeepSeek，原 OCR 接口须单独配置身份保护和供应商额度。
- 200 MiB 上限包含上传后未引用的孤立图片。初版不自动清理，以免错误删除原图；达到容量上限暂停新图片写入，由管理员备份后受控整理。不自动删除题图或扩大配额。
- 文字记录最大请求 64 KiB；图片每次最多 300000 字节。格式检查当前验证 JPEG 签名，不做服务端解码/杀毒，不作为通用文件托管。
- profile 首次同步优先采用已有云端档案；后续双向修改检测冲突。其他配置和密钥仍是设备本地设置。
- 云端已接受但网络响应丢失时，重试可能提示冲突；不会重复覆盖。首版优先数据安全，保留 JSON 导出作为人工恢复路径。
- D1 免费单库上限 500 MB；图片限制留有元数据和索引余量，但不保证可以存满 200 MiB 图片外加任意题量。定期查看用量，下载 JSON 离线备份。D1 Time Travel 可做补充，不替代离线备份。

参考：https://developers.cloudflare.com/d1/platform/limits/ 、https://developers.cloudflare.com/d1/worker-api/d1-database/ 、https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/


独立题库使用额外的 bank_questions / bank_batches 表，网页只读，沿用相同身份校验与每日请求上限。首次安装请另外执行 bank/schema.sql 与 bank/seed.sql；步骤、许可、复算方式和客户端边界见 [题库试点说明](../bank/README.md)。
