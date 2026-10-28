# Repository Guidelines

## 作用域

只管 npm 包 `quicktui-dsh`: DeepSeek Harness (dsh) 的 bundle 插件. 用户在 dsh「插件」页按包名安装.

- `lib/index.js`: host 入口. 组合 server 检测、设置页路由与桥接. 桥接默认开启 (配置 `bridge: false` 关闭).
- `lib/bridge.js`: AgentBridge2 桥接. 线协议见 [PROTOCOL.md](PROTOCOL.md), 由 `agentbridge2` 的 `ab2hook --agent dsh` 消费.
- `lib/setup.js`: 检测、安装、启动、配对 `quicktui-server`. `lib/routes.js`: 设置页调用的 `/api/quicktui-dsh/*` 路由.
- `lib/owner.js`: `owner.pid` 属主锁. 决定由哪个 dsh 进程执行启动回填并等待命令.
- `lib/client.js`: 浏览器端. 手写的 classic script, 经 `window.__ModuleLoader__.load` 注册, 不经构建.
- `lib/vendor/qrcode.cjs`: 原样内置的 `qrcode-generator` (MIT). 只整文件替换, 不改内容.
- `README.md` / `README.zh.md`: dsh 插件详情页 (中文经 `locale/zh.json` 的 `meta.detail` 选用).

## 编辑规则

- 包无运行时依赖. 浏览器端只能 `require` dsh 共享模块 (`react`、`@deepseek-ai/dsh-client-ui-primitives` 等, 真源为 deepseek-harness `packages/client/web/src/platform.ts`).
- 运行 `quicktui-server` 一律用绝对路径与 argv 数组, 不经 shell. 安装只运行官方 `q.sh` (`https://quicktui.ai/q.sh` 或 `https://dl.quicktui.cn/q.sh`), 且只在用户在设置页确认后运行.
- 配对文本与配对码只返回给设置页, 不写日志、不写文件.
- 设置页文案改动时, `lib/client.js` 的 `en` / `zh` 两份字典同步; 详情页改动时 `README.md` 与 `README.zh.md` 同步.
- 线协议 (`PROTOCOL.md`) 改动必须与 `agentbridge2` 的 dsh 消费端一致.

## 验证

- `npm test` (Node 22+, 本机直接运行; 不需要 Docker). 改动只涉及 `lib/client.js` 时至少运行 `node --check lib/client.js`.
- 发布前用 `npm pack` 生成 tarball, 在 dsh Desktop 用 `dsh plugin --profile desktop add <tgz>` 安装验证 (dsh 必须先退出).
- `npm publish` 与提交到社区插件索引都是对外发布, 每次先请用户确认.
