# QuickTUI for DeepSeek Harness

在 dsh 中设置 [QuickTUI](https://quicktui.ai/cn/): 在本机安装 QuickTUI server, 配对手机上的 QuickTUI App, 并在手机上查看 dsh 会话.

## 设置

在「插件」中打开本插件的页面. 页面分三步引导:

1. **QuickTUI server.** 页面检查本机是否已安装 QuickTUI server.
   - macOS 和 Linux: 选择「安装 QuickTUI server」. dsh 下载官方安装脚本, 用你的用户账号运行.
     脚本安装 preview 渠道的 server, 这是第一个支持 dsh 的渠道.
     效果等同于运行 `curl -fsSL https://dl.quicktui.cn/q.sh | sh -s -- install --channel preview -y`
     (中国大陆以外用 `https://quicktui.ai/q.sh`). 不需要管理员密码.
   - Windows: 在 [Microsoft Store 安装 QuickTUI](https://apps.microsoft.com/detail/9P1SRCZ4CJ8Z),
     然后从开始菜单打开一次. 页面在一分钟内会检测到 server.
2. **配对手机.** 选择「显示配对二维码」, 用 QuickTUI App 扫码. 配对码只能用一次, 15 分钟后失效.
   手机配对成功后, 页面会显示结果. dsh 会话没有终端界面: 在 QuickTUI App 中, 点服务器卡片上的聊天图标,
   打开会话列表, 再打开 dsh 会话. 页面会用示意图标出这个图标.
3. **下载 App.** [iPhone 和 iPad](https://apps.apple.com/cn/app/id6761338192) ·
   [Android (预览版)](https://quicktui.ai/cn/android/). 页面也显示这两个链接的二维码.

了解 QuickTUI: 官网 [quicktui.ai](https://quicktui.ai/) (全球) · [quicktui.cn](https://quicktui.cn/) (中国大陆);
使用手册 [quicktui.ai/guide](https://quicktui.ai/guide/) · [quicktui.cn/guide](https://quicktui.cn/guide/). 插件页也列出这些链接.

## 在 QuickTUI 中查看 dsh 会话

QuickTUI server 版本支持 dsh 时, 插件把 dsh 会话接入 QuickTUI. 在手机上可以:

- 查看每个会话的状态和对话;
- 回答工具审批 (允许一次或拒绝) 和 dsh 提问;
- 发送 prompt (排在正在运行的轮次之后), 以及中断轮次.

请求在 dsh 卡片上同样保持打开, 先到的回答生效. 子代理的工作显示在父会话中. 要关闭接入, 在 profile 的
`cordis.patch.yml` 中为 `quicktui-dsh` 设置 `bridge: false`.

插件需要 `desktop` 或 `web` profile.
