---
name: quoridor-second-brain
description: 给 Quoridor 对战引擎提供共享策略记忆、局面标签、经验卡与复盘制卡方法。用于把同一套方法论同时提供给本地搜索和 API AI，而不是让模型裸下。
title: Quoridor 共享策略记忆
kind: method
summary: API AI 和本地搜索共用同一套局面标签、经验卡和方法论，不让模型裸下。
---

# Quoridor Second Brain

这个 skill 只服务 `quoridor/` 项目。

目标不是“让 API 自己想”，而是先给它一套可复用的方法论、经验卡和局面标签，再让：

- 本地搜索用同一套权重做评估
- API AI 用同一套方法论做解释和选招

## 什么时候使用

- 调整 `Quoridor` 的 AI 棋力
- 给 `minimax` 和 `API AI` 增加共享经验
- 把对局经验沉淀成可重复使用的卡片
- 讨论 `MCTS / policy prior / value estimate` 如何接入当前项目

## 核心原则

1. `minimax` 和 `API AI` 不做两套割裂设计  
   两边都读取同一套局面标签、skill 文档和经验卡。

2. 模型不是裁判  
   合法性、路径连通性、胜负判断，都由本地规则引擎负责。

3. 先有方法论，再让 AI 出手  
   API AI 不能裸下。它必须先看到：
   - 当前局面标签
   - 已命中的经验卡
   - 本地给出的高分候选

4. 经验卡要可累积  
   新学到的套路进入 `卡片经验积累/`，供后续所有对局复用。

## 目录约定

- `quoridor/skill/second_brain rule.md`
  规则源，定义局面标签、经验卡字段和方法论入口
- `quoridor/卡片经验积累/`
  经验卡库，积累“什么时候该走子、什么时候该放墙”的套路

## 经验卡最小格式

经验卡用 Markdown frontmatter，字段保持扁平：

```yaml
---
id: qb-example
title: 示例经验
kind: tactical
tags: [opening, path-race]
triggers: [opening, walls_many]
effect_self_path_weight: 12
effect_opp_path_weight: 8
effect_center_bias: 4
effect_wall_resource_bias: 2
summary: 这一类局面下的优先原则。
---
```

说明：

- `triggers`
  命中条件，和当前局面标签匹配
- `effect_*`
  给共享评估函数提供增量权重
- `summary`
  给 API AI 和复盘界面做人类可读解释

## 当前项目里的近似 AlphaGo 思路

在这个项目里，先做“可运行近似版”，不直接上训练网络：

- `policy prior`
  由经验卡 + 局面标签 + 本地候选排序共同给出
- `value estimate`
  由共享评估函数给出
- `search`
  当前先用 `minimax`，后续可以替换或增加 `MCTS`

如果要实现更像 AlphaGo 的版本，下一步不是继续堆 prompt，而是：

1. 先把共享评估函数和经验卡系统稳定下来
2. 再把 `minimax` 升级成 `MCTS`
3. 再考虑训练型 `policy/value network`

## 修改时的要求

- 改 `skill` 时，优先改规则和经验卡，不要把业务逻辑写死在 prompt 里
- 新经验优先写成卡片，不要只写在 README
- 同一条方法论要能同时服务 `minimax` 和 `API AI`
