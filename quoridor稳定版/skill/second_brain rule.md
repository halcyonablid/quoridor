---
id: qk-second-brain-rules
title: Quoridor Second Brain Rules
kind: method
summary: 定义 Quoridor 项目的局面标签、经验卡匹配、共享评估权重与 MCTS 升级路线。
---

# Quoridor Second Brain Rules

这个文件是 `quoridor/` 棋类第二大脑的规则源。

## 目标

让 AI 下棋不是“临场胡猜”，而是：

1. 先识别当前局面标签
2. 从 skill/经验卡里找适用原则
3. 用这些原则去约束候选动作
4. 再由本地搜索或 API 生成动作与解释

## 局面标签

当前项目统一使用这批标签：

- `opening`
- `midgame`
- `endgame`
- `near_goal`
- `self_ahead`
- `self_behind`
- `walls_many`
- `walls_low`
- `opponent_near_goal`
- `center_stable`

可以继续扩展，但要保持简短、可计算、可复用。

## 经验卡匹配规则

1. 当前局面先生成标签集合
2. 一张卡的 `triggers` 全部满足，才算命中
3. 同一局面可同时命中多张卡
4. 命中的卡会共同影响：
   - 本地评估函数权重
   - API AI 的提示上下文
   - 回合解释与复盘摘要

## 权重字段解释

- `effect_self_path_weight`
  强调“缩短自己最短路”
- `effect_opp_path_weight`
  强调“拉长对手最短路”
- `effect_center_bias`
  强调中路稳定与横向灵活性
- `effect_wall_resource_bias`
  强调墙资源珍惜程度

这些字段不是绝对真理，而是对共享评估函数的偏置。

## 制卡原则

经验卡只记录“高复用的判断原则”，不要把一次偶然妙手写成通用规则。

优先沉淀这几类内容：

- 开局竞速
- 墙时机
- 领先/落后节奏切换
- 终盘冲线
- 对特定玩家风格的针对

## MCTS / Policy / Value 的落地边界

当前项目能稳定做到的是：

- 用经验卡给候选动作加 `policy prior`
- 用共享评估函数给局面加 `value estimate`
- 用本地搜索去比较动作

当前项目还没有训练型神经网络，因此这里的：

- `policy`
  不是学习出来的网络，而是经验卡 + 候选排序
- `value`
  不是学习出来的价值网络，而是启发式评估

这已经能形成一个“可运行的近似版”。

## 后续升级路线

1. 持续补经验卡
2. 让共享评估函数稳定
3. 用同一套评估接入 `MCTS`
4. 如果以后有训练数据，再考虑真正的 `policy/value network`
