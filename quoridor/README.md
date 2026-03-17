# Quoridor Local Arena

本目录是一个纯前端本地版 `Quoridor`：

- 本地规则引擎裁判
- 支持双人对战
- 支持把任意一方切成 `本地搜索 AI` 或 `API AI`
- AI 只输出动作意图 + 原因解释 + 教学提示
- 本地会验证 AI 动作是否合法；非法会自动重试
- 支持生成对局教学总结
- 支持共享 `Second Brain` 方法论与经验卡，统一作用于 `本地搜索 AI` 和 `API AI`

## 运行

### 方式 1：直接双击打开

你可以直接打开：

- [index.html](./index.html)

这种方式能玩，但有一个限制：

- 浏览器是 `file://` 打开页面
- 页面可能不能实时读取 `skill/` 和 `卡片经验积累/` 里的文件
- 这时 `Second Brain` 会自动回退到内置快照

如果你只是想先试玩，这种方式够用。

### 方式 2：本地静态服务器启动，推荐

如果你希望：

- 实时读取 `quoridor/skill/`
- 实时读取 `quoridor/卡片经验积累/`
- 后续改经验卡后刷新页面就生效

建议用本地静态服务器。

本地静态服务器的意思很简单：

- 在你电脑本地开一个很小的网页服务
- 只给这个文件夹提供访问
- 然后浏览器通过 `http://localhost:端口` 打开

这样浏览器就不会把页面当成 `file://` 本地文件，而会当成正常网页处理。

### 目录位置

当前游戏目录是：

```text
D:\han\学习的文件夹\4- 自己的战略规划工作流\agent-end-to-end-blog-writing-main\data\raw\26- supermemoconcept的改进\quoridor
```

### 启动方法 A：用 Python

前提：

- 电脑上已经装了 Python

#### PowerShell

1. 打开 PowerShell
2. 进入 `quoridor` 目录：

```powershell
cd "D:\han\学习的文件夹\4- 自己的战略规划工作流\agent-end-to-end-blog-writing-main\data\raw\26- supermemoconcept的改进\quoridor"
```

3. 启动静态服务器：

```powershell
python -m http.server 8000
```

如果你电脑里命令是 `py`，那就用：

```powershell
py -m http.server 8000
```

4. 看到类似下面的信息，就说明启动成功了：

```text
Serving HTTP on 0.0.0.0 port 8000 ...
```

5. 打开浏览器，访问：

```text
http://localhost:8000
```

#### CMD

1. 打开命令提示符
2. 进入目录：

```cmd
cd /d "D:\han\学习的文件夹\4- 自己的战略规划工作流\agent-end-to-end-blog-writing-main\data\raw\26- supermemoconcept的改进\quoridor"
```

3. 启动：

```cmd
python -m http.server 8000
```

或者：

```cmd
py -m http.server 8000
```

4. 浏览器打开：

```text
http://localhost:8000
```

### 启动方法 B：如果 8000 端口被占用

你可以换一个端口，比如 `8123`：

```powershell
python -m http.server 8123
```

然后浏览器打开：

```text
http://localhost:8123
```

### 怎么停止服务器

在启动服务器的那个终端窗口里按：

```text
Ctrl + C
```

### 怎么启动游戏

当你已经打开：

```text
http://localhost:8000
```

或者你自己改过的端口地址后，页面加载出来就等于游戏已经启动了。

然后按这个顺序玩：

1. 先点 `新开一局`
2. 在 `玩家设置` 里选双方控制方式
3. 如果要接大模型：
   - 选接口预设
   - 填 `API Endpoint / Model / Key`
   - 点 `测试 API 连通`
4. 如果要让某一方自动下：
   - 把该玩家切到 `本地搜索 AI` 或 `API AI`
   - 到它回合时点 `当前方请求 AI 走子`
5. 如果是双人对战：
   - 两边都设成 `Human`
   - 直接在棋盘上走子或放墙

### Second Brain 什么时候会实时更新

你用本地静态服务器打开后：

1. 去修改：
   - `quoridor/skill/`
   - `quoridor/卡片经验积累/`
2. 保存文件
3. 浏览器刷新页面

新的方法论和经验卡就会重新加载。

### 常见问题

#### 1. 浏览器打不开 `http://localhost:8000`

常见原因：

- 终端里的静态服务器其实没启动成功
- 端口被占用了
- 你开的是别的目录

先看终端里是否有：

```text
Serving HTTP on ...
```

#### 2. `Second Brain` 显示的是“内置快照”

这通常说明：

- 你是直接双击 `index.html` 打开的
- 或者浏览器没法读取本地 `skill/` / `卡片经验积累/` 文件

解决方式：

- 改用本地静态服务器打开

#### 3. 修改经验卡后页面没变化

先确认：

- 你改的是 `quoridor/卡片经验积累/` 里的文件
- 页面是通过 `http://localhost:端口` 打开的
- 改完后已经刷新页面

## AI 模式

- `Human`：人工操作
- `本地搜索 AI`：本地 `MCTS` 搜索，不依赖 API
- `API AI`：调用你填写的大模型接口

## API 接口

界面里现在带了 3 个接口预设：

- `自定义 OpenAI 兼容`
- `DeepSeek`
- `MiniMax API`

注意：

- `本地搜索 AI`
  是本地搜索算法，不走 API
- `MiniMax API`
  是模型供应商预设，走外部接口

这两个名字很像，但不是一回事。

### DeepSeek 预设

- 选 `接口预设 -> DeepSeek`
- 点 `应用接口预设`
- 会自动填入 DeepSeek 兼容 endpoint 和默认模型

默认会填：

- Endpoint：`https://api.deepseek.com/chat/completions`
- Model：`deepseek-chat`

### MiniMax API 预设

- 选 `接口预设 -> MiniMax API`
- 点 `应用接口预设`
- 会自动填入 MiniMax OpenAI 兼容 endpoint 和默认模型

默认会填：

- Endpoint：`https://api.minimax.io/v1/chat/completions`
- Model：`MiniMax-M2.5`

如果你使用的是 MiniMax 中国区或别的接入地址，也可以手动改。

你也可以继续手动改任何预设的 endpoint / model / temperature。

页面里还有一个 `测试 API 连通` 按钮，会直接检测：

- 接口是否能请求成功
- 模型是否能返回可解析 JSON
- 结果会显示在配置区的“连通性状态”面板里

页面默认按 **OpenAI 兼容的 Chat Completions** 请求格式发送：

```json
{
  "model": "你的模型",
  "temperature": 0.3,
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ]
}
```

默认会从响应里尝试读取：

- `choices[0].message.content`
- `output_text`
- `output[].content[].text`

## 扩展别的 API

如果你的接口不是 OpenAI 兼容格式，可以改 [app.js](./app.js) 末尾的：

- `window.QuoridorAiApiAdapter.buildRequestPayload`
- `window.QuoridorAiApiAdapter.extractTextFromResponse`

也就是：

```js
window.QuoridorAiApiAdapter = {
  buildRequestPayload({ model, temperature, messages }) {
    return {
      my_model: model,
      temp: temperature,
      conversation: messages
    };
  },
  extractTextFromResponse(data) {
    return data.result.text;
  }
};
```

## AI 输出格式

AI 必须只返回 JSON。

走子示例：

```json
{
  "action": {
    "type": "move",
    "to": "e5"
  },
  "reason": "向中心推进并缩短自己的最短路径。",
  "teaching": "先稳住最短路优势，再考虑阻挡对手。",
  "summary": "这是一步抢节奏的推进。"
}
```

放墙示例：

```json
{
  "action": {
    "type": "wall",
    "orientation": "horizontal",
    "at": "c4"
  },
  "reason": "延长对手路径，同时自己仍保有直线路径。",
  "teaching": "放墙时要同时检查双方最短路的变化。",
  "summary": "这是一步阻挡型节奏手。"
}
```

## 当前实现范围

- 9x9 Quoridor 基础规则
- 跳子 / 斜跳
- 横墙 / 竖墙
- 不允许重叠 / 交叉 / 完全堵死路径
- 本地搜索 AI（MCTS）
- Second Brain 共享策略层
- AI 非法动作重试
- AI 本手解释
- AI 终局总结

## Second Brain

当前项目会优先读取：

- [skill/第二大脑SKILL.md](./skill/第二大脑SKILL.md)
- [skill/second_brain rule.md](./skill/second_brain%20rule.md)
- [卡片经验积累/](./卡片经验积累/)

这些文档会共同影响两条 AI 通道：

- `本地搜索 AI`
  通过共享评估函数调整最短路、墙资源和中心控制权重，并作为 `MCTS` 的策略先验/价值基础
- `API AI`
  通过 `secondBrain + strategicGuidance` 先读局面标签和经验卡，再返回动作解释

后续你要新增套路，优先在 `卡片经验积累/` 里加卡，不要只改 prompt。

## MCTS / AlphaGo 风格路线

当前版本还不是训练型 `policy network + value network`，但已经具备近似结构，而且本地搜索已经升级成 `MCTS`：

- `policy prior`
  由 Second Brain 经验卡 + 候选动作排序提供
- `value estimate`
  由共享评估函数提供
- `search`
  当前使用 `MCTS`

如果下一步还要继续升级，重点就不是“有没有 MCTS”，而是：

- 更好的 rollout 策略
- 更好的候选墙排序
- 更强的 value estimate
- 将来接入真正训练出来的 `policy/value network`

## 备注

如果你的 API 允许跨域即可直接从浏览器调用；如果接口有 CORS 限制，需要你自己加一个本地代理。
