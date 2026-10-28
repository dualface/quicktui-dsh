# QuickTUI for DeepSeek Harness

Set up [QuickTUI](https://quicktui.ai/) from dsh: install QuickTUI server on this computer, pair the QuickTUI app on your phone, and follow your dsh sessions from it.

## Set up

Open this plugin's page in **Plugins**. The page walks through three steps:

1. **QuickTUI server.** The page checks whether QuickTUI server is installed on this computer.
   - macOS and Linux: select **Install QuickTUI server**. dsh downloads the official install script
     and runs it with your user account. It is the same as running
     `curl -fsSL https://quicktui.ai/q.sh | sh -s -- install -y`
     (in China mainland, `https://dl.quicktui.cn/q.sh`). No administrator password is needed.
   - Windows: install [QuickTUI from the Microsoft Store](https://apps.microsoft.com/detail/9P1SRCZ4CJ8Z),
     then open it once from the Start menu. The page finds the server within a minute.
2. **Pair your phone.** Select **Show pairing QR code** and scan the code with the QuickTUI app. The
   code can be used once and expires after 15 minutes. The page shows when the phone has paired.
3. **Get the app.** [iPhone and iPad](https://apps.apple.com/us/app/id6761338192) ·
   [Android (preview)](https://quicktui.ai/android/). The page also shows QR codes for these links.

## dsh sessions in QuickTUI

With a QuickTUI server version that supports dsh, the plugin connects your dsh sessions to
QuickTUI. On your phone you can:

- follow each session's status and conversation;
- answer tool approvals (allow once or reject) and dsh questions;
- send a prompt, which waits behind the running turn, and interrupt a turn.

A request stays open on the dsh card too: the first answer wins. Subagent work shows inside its
parent session. To turn the connection off, set `bridge: false` for `quicktui-dsh` in the profile's
`cordis.patch.yml`.

The plugin needs the `desktop` or `web` profile.
