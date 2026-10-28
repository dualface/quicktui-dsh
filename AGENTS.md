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
- `CHANGELOG.md`: 每个 npm 版本一节. `LICENSE`: MIT. `scripts/sync-public-repo.sh`: 把本目录同步到公开仓库 (见「发布」).

## 编辑规则

- 包无运行时依赖. 浏览器端只能 `require` dsh 共享模块 (`react`、`@deepseek-ai/dsh-client-ui-primitives` 等, 真源为 deepseek-harness `packages/client/web/src/platform.ts`).
- 运行 `quicktui-server` 一律用绝对路径与 argv 数组, 不经 shell. 安装只运行官方 `q.sh` (`https://quicktui.ai/q.sh` 或 `https://dl.quicktui.cn/q.sh`), 且只在用户在设置页确认后运行.
- 配对文本与配对码只返回给设置页, 不写日志、不写文件.
- 设置页文案改动时, `lib/client.js` 的 `en` / `zh` 两份字典同步; 详情页改动时 `README.md` 与 `README.zh.md` 同步.
- 线协议 (`PROTOCOL.md`) 改动必须与 `agentbridge2` 的 dsh 消费端一致.

## 验证

- `npm test` (Node 22+, 本机直接运行; 不需要 Docker). 改动只涉及 `lib/client.js` 时至少运行 `node --check lib/client.js`.
- 发布前用 `npm pack` 生成 tarball, 在 dsh Desktop 用 `dsh plugin --profile desktop add <tgz>` 安装验证 (dsh 必须先退出).

## 发布

npm 包 `quicktui-dsh` (不带 scope) 由用户的个人 npm 账号发布. dsh 按包名经 pnpm 安装, 先查 `registry.npmjs.org`, 再查 `registry.npmmirror.com`. 源码同步到公开仓库 `github.com/dualface/quicktui-dsh`, 供 npm `repository` 字段与 awesome-dsh-plugin 条目引用.

- **发布顺序 (硬性)**: 桥接默认开启, 只有 server 的 stable 发布已包含 dsh provider 之后才发布插件. 旧版 server 拒绝 `ab2hook --agent dsh`, 插件只会反复重启等待.
- **发布来源**: 发布 `origin/main` 上的提交. 版本号与 `CHANGELOG.md` 的改动先按常规任务进入 `develop`, 经晋升进入 `main`.
- **对外动作逐项确认 (硬性)**: 下列每一步执行前都向用户编号确认 (`1. 确认执行`; `2. 终止`), 不因上一步已确认而跳过: 新建公开仓库, `scripts/sync-public-repo.sh` 推送, `npm publish`, 向 awesome-dsh-plugin 提交 PR.

步骤:

1. 核对: `npm test` 通过; `package.json` 的 `version` 与 `CHANGELOG.md` 最新一节一致; `engines.dsh` 覆盖 npm 上 `@deepseek-ai/dsh` 的 `latest`; 按「验证」用 tarball 在 dsh Desktop 安装验证.
2. 同步公开仓库: `integrations/quicktui-dsh/scripts/sync-public-repo.sh origin/main <version>`, 推送 `main` 与 tag `v<version>`.
3. 发布 npm: 用户先在本机 `npm login`; 在 `origin/main` 的干净 checkout 的本目录运行 `npm publish`. 之后 `npm view quicktui-dsh version` 与 `https://registry.npmmirror.com/quicktui-dsh` 都返回新版本.
4. 首次发布后收录到 awesome-dsh-plugin (之后的版本不需要): 按该仓库 `contributing.md` 新增 `data/plugins/dualface__quicktui-dsh.yml` (`category: remote`); 公开仓库加 `dsh-plugin` topic, 且已存在 1 天以上; 条目 `icon` 只接受 GitHub 上的 png / jpg / webp.
