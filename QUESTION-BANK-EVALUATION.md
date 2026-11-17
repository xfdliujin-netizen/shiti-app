# 标签题库与 AI 互补评估

核查日期：2026-11-17。结论：值得做；先接小规模、可追溯、已核对的数学题库。地区与教材适配可以逐步完善。评估后已完成小规模试点：从 CMATH 筛选并复算 50 道数学题，导入独立 D1 题库；详见 [题库试点说明](bank/README.md)。尚未扩大到其他外部题库。

## 已核查项目

| 项目 | 可利用之处 | 适配限制 | 本次判断 |
| --- | --- | --- | --- |
| [TAL-SCQ5K](https://github.com/math-eval/TAL-SCQ5K) | 中文数学选择题；公开结构含知识点路径、难度、选项、答案、分步解析；README 标明数据 MIT | 以竞赛题为主，知识点体系不等于江苏教材章节；须逐题确认适用年级和课内程度 | 标签结构最接近目标，可筛选少量合适题目试点 |
| [CMATH](https://github.com/XiaoMi/cmath) | 小学数学应用题、年级与注释；中文 README 明确区分代码 MIT、数据 CC BY 4.0 | 不是完整的江苏课内全科题库，需补充统一知识点标签；中英文 README 的授权表述有差异，应保留原始声明和署名 | 更适合小学日常训练的候选，先补标签和审题 |
| [CMM-Math / EduChat-Math](https://github.com/ECNU-ICALK/EduChat-Math) | 中文图文数学题，覆盖小学至高中及多种题型 | 本次从仓库 README 未确认可直接使用的细粒度教材标签和完整数据再分发许可 | 作为后续多模态候选，先确认数据获取、标注和授权 |
| [MathBank](https://github.com/JudgePeach/math-question-bank) | 高中数学题库管理与组卷软件；文档有苏教版等教材目录，区分教材位置和主辅知识点 | 属于管理系统，不代表附带可直接使用的小学全科题库；代码 LICENSE 为 AGPL-3.0，不能将代码授权直接视为题目内容授权 | 参考结构设计，本次未复制其代码或题目 |
| [聪聪学堂](https://github.com/wuwangzhang1216/congcong-school) | 小学语文、数学、英语、科学，按教材单元组织练习 | 文档明确题目主要由 AI 生成、教师逐题签审尚未完成；主要为人教/统编/PEP/教科版。不能把已有 AI 题目当成独立校验依据，内容授权也需单独核查 | 适合考察课内覆盖与组织方式，先小批量核对，不能整库默认可信 |
| [k12-knowledge-points](https://github.com/mmlong818/k12-knowledge-points) | 知识点规范名称、别名、年级、册次、章节和前置关系，可帮助统一不同来源标签 | 属于知识点图谱，并非题库；由 OCR 与大模型抽取，部分仅有目录证据。README 指定 PolyForm Noncommercial 1.0.0，限制商业用途 | 可作为个人非商业场景下标签体系候选，先核对抽取置信度与教材差异 |

本次没有确认一套同时满足“江苏全科、覆盖中小学、完整细粒度标签、可直接使用的数据授权”的现成题库。公开仓库也不等于每道题目的内容授权都已解决。

补充核查依据：[聪聪学堂对 AI 生成题目、教材覆盖与审核状态的说明](https://raw.githubusercontent.com/wuwangzhang1216/congcong-school/main/README.md)、[K12 知识点图谱字段、构建方式与非商业许可](https://raw.githubusercontent.com/mmlong818/k12-knowledge-points/main/README.md)。另查到的 [Aix9527/question-bank](https://github.com/Aix9527/question-bank) 实际面向专科复习，不符合小学课内训练，未列为接入候选。

核查依据：[TAL 数据结构与授权说明](https://raw.githubusercontent.com/math-eval/TAL-SCQ5K/main/README.md)、[CMATH 中文数据授权说明](https://raw.githubusercontent.com/XiaoMi/cmath/main/README.md)、[CMM-Math 介绍](https://raw.githubusercontent.com/ECNU-ICALK/EduChat-Math/main/README.md)、[MathBank 功能介绍](https://raw.githubusercontent.com/JudgePeach/math-question-bank/main/README.md)、[MathBank LICENSE](https://raw.githubusercontent.com/JudgePeach/math-question-bank/main/LICENSE)。

## 建议的互补流程

1. 本地程序按科目、年级、学期、知识点和难度筛选候选题；教材与地区作为偏好，避免地区筛选过严而无题。
2. 优先选择经过核对、带原始答案和解析的题目，不调用模型也可以完成选题组卷。
3. 题库不足时，用户主动选择 AI 扩展；每次只给少量母题及相关学情摘要。AI 生成题必须标明来源、检查题量与科目，保留人工核对入口。
4. 批改比较当前作答与本题解法，参考答案发生冲突时待核对，不能单凭库内答案强行判错。
5. 孩子的真实作答才更新学情。导入公共题库、查看答案、加入示例题本身，不计作孩子做过或做错。

## 数据结构与存储

公共题库独立于孩子的错题本，避免导入题目污染错题统计和学习历史。建议题目字段：

```json
{
  "id": "来源:原始题目ID",
  "subject": "数学",
  "stage": "primary",
  "grade": "四年级",
  "term": "上",
  "textbook": "苏教版（待核对）",
  "chapter": "章节（待核对）",
  "knowledgeIds": ["math.primary.geometry.rectangle_perimeter"],
  "originalTags": ["原始知识点路径"],
  "difficulty": "基础",
  "questionType": "choice",
  "text": "题目",
  "answer": "答案",
  "analysis": "解析",
  "originUrl": "题目来源链接",
  "license": "原始数据授权",
  "attribution": "署名与版权声明",
  "reviewStatus": "pending",
  "reviewedAt": null
}
```

知识点使用稳定 ID，显示名称、原始标签、教材章节分别保存。不同来源的难度等级需要映射，不能直接将竞赛难度 0 当成课内基础题。AI 补标签须标记为待核对。

如接入云端，沿用 D1，使用独立的 bank_questions、bank_question_tags 表及科目/年级/知识点索引；每次分页读取少量候选，不让模型扫描整库。沿用现有身份保护和用量限制。暂不需要向量数据库、后台模型训练或额外云服务。

## 已实现的成本边界

学习摘要由本地程序从保存的错题和练习汇总；摘要副本存于本机 IndexedDB 的 learning-summary，原始记录按现有手动同步进入 D1，另一设备合并后可重建摘要。示例题不计作孩子的历史错题。

每次任务最多附带 3 个相关知识点、2 条历史例子，历史 JSON 最多 1800 UTF-8 字节。无关科目、明确不符的年级/学期、已删除来源的练习不参与读取；未标年级的旧记录明确标记。自评和 AI 判定分开统计，不自动宣称掌握。

系统规则与用户文字合计超过 24000 UTF-8 字节时，在发送前提示拆分；当前题目不会被静默截断。AI 组卷最多使用 3 道母题。上述为文字输入边界，实际 token 数由接口返回的 usage 统计；图片输入和模型输出也会产生费用。没有额外的后台总结请求或失败后自动重试。

DeepSeek 视觉转录按[官方 Vision 文档](https://api-docs.deepseek.com/guides/vision/)为官方接口默认使用 deepseek-flash，独立于文字分析模型，可在设置中覆盖。此次仅模拟验证请求格式和路由，没有发起真实付费识别或批改请求。
