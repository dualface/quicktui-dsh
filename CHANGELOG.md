# Changelog

## 0.1.0

- Set up QuickTUI from the plugin page: detect, install, and start QuickTUI server, pair the QuickTUI phone app with a QR code, and get the app.
- The plugin page installs QuickTUI server from the preview channel, the first channel with dsh support, and shows the install log line by line.
- After the phone pairs, the plugin page shows how to find dsh sessions in the app: tap the chat icon on the server's card to open the chat list. dsh sessions have no terminal.
- The plugin page links to the QuickTUI website: quicktui.ai (global) and quicktui.cn (China mainland), and keeps a column beside the setup cards for a phone screenshot.
- Connect dsh sessions to QuickTUI (needs a QuickTUI server version with dsh support): follow each session's status and conversation, answer tool approvals and dsh questions, send prompts, and interrupt a turn from your phone. Set `bridge: false` to turn the connection off.
