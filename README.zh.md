# QuickTUI for DeepSeek Harness

在 dsh 中设置 [QuickTUI](https://quicktui.ai/cn/): 在本机安装 QuickTUI server, 并配对手机上的 QuickTUI App.

## 设置

在「插件」中打开本插件的页面. 页面分三步引导:

1. **QuickTUI server.** 页面检查本机是否已安装 QuickTUI server.
   - macOS 和 Linux: 选择「安装 QuickTUI server」. dsh 下载官方安装脚本, 用你的用户账号运行,
     效果等同于运行 `curl -fsSL https://dl.quicktui.cn/q.sh | sh -s -- install -y`
     (中国大陆以外用 `https://quicktui.ai/q.sh`). 不需要管理员密码.
   - Windows: 在 [Microsoft Store 安装 QuickTUI](https://apps.microsoft.com/detail/9P1SRCZ4CJ8Z),
     然后从开始菜单打开一次. 页面在一分钟内会检测到 server.
2. **配对手机.** 选择「显示配对二维码」, 用 QuickTUI App 扫码. 配对码只能用一次, 15 分钟后失效.
   手机配对成功后, 页面会显示结果.
3. **下载 App.** [iPhone 和 iPad](https://apps.apple.com/cn/app/id6761338192) ·
   [Android (预览版)](https://quicktui.ai/cn/android/). 页面也显示这两个链接的二维码.

## 在 QuickTUI 中查看 dsh 会话

在 QuickTUI 中查看 dsh 会话需要支持 dsh 的 QuickTUI server 版本, 该版本尚未发布. 本版插件负责安装 QuickTUI server 和配对手机; 后续版本再接入 dsh 会话.

插件需要 `desktop` 或 `web` profile.
