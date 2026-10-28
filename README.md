# QuickTUI for DeepSeek Harness

Set up [QuickTUI](https://quicktui.ai/) from dsh: install QuickTUI server on this computer and pair the QuickTUI app on your phone.

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

Following dsh sessions from QuickTUI needs a QuickTUI server version with dsh support, which is
not released yet. This version of the plugin sets up QuickTUI server and pairs your phone; a later
version connects your dsh sessions.

The plugin needs the `desktop` or `web` profile.
