// quicktui-dsh browser half: the setup page on the bundle's Plugins page and
// the guidance shown when the bundle is enabled. dsh loads client entries as
// classic scripts through window.__ModuleLoader__ with a synchronous require
// for its shared modules, so this file is hand-written without a build step.
window.__ModuleLoader__.load({
  id: 'quicktui-dsh',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { Button, Modal } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const NS = 'quicktui-dsh'
    const PACKAGE = 'quicktui-dsh'
    const API = '/api/quicktui-dsh'
    const POLL_MS = 5000
    const POLL_BUSY_MS = 1500

    const en = {
      'server.title': 'QuickTUI server',
      'server.checking': 'Checking this computer…',
      'server.missing': 'QuickTUI server is not installed on this computer.',
      'server.stopped': 'QuickTUI server is installed but not running.',
      'server.running': 'QuickTUI server is running on port {port}.',
      'server.version': 'Version {version} · {path}',
      'server.start': 'Start server',
      'server.starting': 'Starting…',
      'install.button': 'Install QuickTUI server',
      'install.store': 'Open Microsoft Store',
      'install.storeHint': 'Install QuickTUI from the Microsoft Store, then open it once from the Start menu so the server starts with Windows. This page finds it within a minute.',
      'install.title': 'Install QuickTUI server',
      'install.body': 'dsh downloads the official QuickTUI install script and runs it with your user account. It installs quicktui-server to ~/.local/bin and starts it as a user service. No administrator password is needed.',
      'install.source': 'Download from',
      'install.global': 'Global (quicktui.ai)',
      'install.cn': 'China mainland (dl.quicktui.cn)',
      'install.same': 'This is the same as running:',
      'install.confirm': 'Install',
      'install.cancel': 'Cancel',
      'install.close': 'Close',
      'install.running': 'Installing QuickTUI server…',
      'install.failed': 'The installation failed: {error}',
      'install.retry': 'Try again',
      'pair.title': 'Pair your phone',
      'pair.needServer': 'Start QuickTUI server first.',
      'pair.devices': 'Paired devices: {names}',
      'pair.none': 'No device is paired yet.',
      'pair.show': 'Show pairing QR code',
      'pair.again': 'New pairing code',
      'pair.loading': 'Creating a pairing code…',
      'pair.scan': 'Open the QuickTUI app on your phone and scan this code when it asks for the server QR code.',
      'pair.text': 'Or paste this pairing text into the app:',
      'pair.copy': 'Copy',
      'pair.copied': 'Copied',
      'pair.expires': 'The code can be used once and expires in {time}.',
      'pair.expired': 'This code expired. Create a new one.',
      'pair.done': 'Paired with {name}.',
      'pair.noReport': 'This server version does not report new pairings. Update QuickTUI server, or hide the code after you scan it.',
      'pair.hide': 'Hide code',
      'guide.title': 'View dsh sessions in the chat list',
      'guide.body': 'dsh sessions have no terminal. In the QuickTUI app, tap the chat icon on this server\'s card to open the chat list, then open a dsh session there.',
      'guide.tap': 'Tap here',
      'guide.connect': 'CONNECT',
      'app.title': 'Get the QuickTUI app',
      'app.body': 'Scan a code with your phone camera, or open the link.',
      'app.ios': 'iPhone and iPad',
      'app.android': 'Android (preview)',
      'site.title': 'About QuickTUI',
      'site.website': 'Website',
      'site.guide': 'User guide',
      'site.global': 'Global',
      'site.cn': 'China mainland',
      'badge.installing': 'Installing',
      'badge.missing': 'Not installed',
      'badge.stopped': 'Stopped',
      'badge.running': 'Running',
      'badge.paired': '{count} paired',
      'shot.placeholder': 'Screenshot',
      'shot.alt': 'The QuickTUI app on a phone',
      'error.network': 'dsh did not answer: {error}',
      'activation.title': 'Set up QuickTUI',
      'activation.body': 'Install QuickTUI server on this computer and pair the QuickTUI app on your phone. The setup page guides each step.',
      'activation.later': 'Later',
      'activation.open': 'Set up',
    }
    const zh = {
      'server.title': 'QuickTUI server',
      'server.checking': '正在检查本机…',
      'server.missing': '本机没有安装 QuickTUI server.',
      'server.stopped': 'QuickTUI server 已安装, 但没有运行.',
      'server.running': 'QuickTUI server 正在运行, 端口 {port}.',
      'server.version': '版本 {version} · {path}',
      'server.start': '启动 server',
      'server.starting': '正在启动…',
      'install.button': '安装 QuickTUI server',
      'install.store': '打开 Microsoft Store',
      'install.storeHint': '在 Microsoft Store 安装 QuickTUI, 然后从开始菜单打开一次, server 才会随 Windows 启动. 本页在一分钟内会检测到它.',
      'install.title': '安装 QuickTUI server',
      'install.body': 'dsh 下载 QuickTUI 官方安装脚本, 用你的用户账号运行. 脚本把 quicktui-server 安装到 ~/.local/bin, 并作为用户服务启动. 不需要管理员密码.',
      'install.source': '下载源',
      'install.global': '全球 (quicktui.ai)',
      'install.cn': '中国大陆 (dl.quicktui.cn)',
      'install.same': '效果等同于运行:',
      'install.confirm': '安装',
      'install.cancel': '取消',
      'install.close': '关闭',
      'install.running': '正在安装 QuickTUI server…',
      'install.failed': '安装失败: {error}',
      'install.retry': '重试',
      'pair.title': '配对手机',
      'pair.needServer': '请先启动 QuickTUI server.',
      'pair.devices': '已配对设备: {names}',
      'pair.none': '还没有配对的设备.',
      'pair.show': '显示配对二维码',
      'pair.again': '生成新配对码',
      'pair.loading': '正在生成配对码…',
      'pair.scan': '在手机上打开 QuickTUI App, 在要求扫描服务器二维码时扫描此码.',
      'pair.text': '也可以把下面的配对文本粘贴到 App:',
      'pair.copy': '复制',
      'pair.copied': '已复制',
      'pair.expires': '此码只能用一次, {time} 后失效.',
      'pair.expired': '此码已失效. 请生成新码.',
      'pair.done': '已与 {name} 配对.',
      'pair.noReport': '此 server 版本不报告新配对. 请更新 QuickTUI server, 或在扫码后隐藏配对码.',
      'pair.hide': '隐藏配对码',
      'guide.title': '在会话列表中查看 dsh 会话',
      'guide.body': 'dsh 会话没有终端界面. 在 QuickTUI App 中, 点这台服务器卡片上的聊天图标, 打开会话列表, 再打开 dsh 会话.',
      'guide.tap': '点这里',
      'guide.connect': '连接',
      'app.title': '下载 QuickTUI App',
      'app.body': '用手机相机扫码, 或打开链接.',
      'app.ios': 'iPhone 和 iPad',
      'app.android': 'Android (预览版)',
      'site.title': '了解 QuickTUI',
      'site.website': '官网',
      'site.guide': '使用手册',
      'site.global': '全球',
      'site.cn': '中国大陆',
      'badge.installing': '安装中',
      'badge.missing': '未安装',
      'badge.stopped': '未运行',
      'badge.running': '运行中',
      'badge.paired': '已配对 {count} 台',
      'shot.placeholder': '截图',
      'shot.alt': '手机上的 QuickTUI App',
      'error.network': 'dsh 没有响应: {error}',
      'activation.title': '设置 QuickTUI',
      'activation.body': '在本机安装 QuickTUI server, 再配对手机上的 QuickTUI App. 设置页会逐步引导.',
      'activation.later': '稍后',
      'activation.open': '去设置',
    }

    let localeRuntime
    const region = () => {
      let active = ''
      try { active = localeRuntime?.getSnapshot?.().active ?? '' } catch {}
      if (!active && typeof navigator !== 'undefined') active = navigator.language ?? ''
      return String(active).toLowerCase().startsWith('zh') ? 'cn' : 'global'
    }

    async function call(method, path, body) {
      const init = { method, headers: {} }
      if (body !== undefined) {
        init.headers['Content-Type'] = 'application/json'
        init.body = JSON.stringify(body)
      }
      const response = await fetch(API + path, init)
      const data = await response.json().catch(() => undefined)
      if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`)
      return data
    }

    const svgUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)

    const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    const SUCCESS = 'var(--dsw-alias-state-success-primary, #2a2)'
    const style = {
      page: { display: 'flex', flexDirection: 'column', gap: 16 },
      // Two columns once the setup container is at least 800 px wide
      // (504 + 16 + 280); below that the screenshot column wraps under the cards.
      layout: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16, maxWidth: 1120 },
      main: { flex: '1 1 504px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 },
      aside: { flex: '0 0 280px', maxWidth: '100%', position: 'sticky', top: 16 },
      shotFrame: {
        boxSizing: 'border-box', width: '100%', aspectRatio: '9 / 19.5', borderRadius: 36,
        border: '2px dashed var(--dsw-alias-border-l3, rgba(128,128,128,.45))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, color: 'var(--dsw-alias-label-tertiary)',
      },
      shot: { display: 'block', width: '100%', height: 'auto', borderRadius: 24 },
      card: {
        display: 'flex', flexDirection: 'column', gap: 14, padding: 20, borderRadius: 14,
        background: 'var(--dsw-alias-settings-card-fill, transparent)',
        border: '1px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2, rgba(128,128,128,.25)))',
      },
      head: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 24 },
      step: {
        flex: '0 0 auto', boxSizing: 'border-box', width: 24, height: 24, borderRadius: 12,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)',
        border: '1.5px solid var(--dsw-alias-border-l3, rgba(128,128,128,.4))',
      },
      stepDone: { color: 'var(--dsw-alias-label-primary-inverted, #fff)', background: SUCCESS, borderColor: SUCCESS },
      title: { flex: '1 1 auto', fontSize: 15, lineHeight: '22px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      badge: {
        flex: '0 0 auto', fontSize: 12, lineHeight: '20px', padding: '0 10px', borderRadius: 10, whiteSpace: 'nowrap',
        color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12))',
      },
      badgeOk: { color: SUCCESS, background: `color-mix(in srgb, ${SUCCESS} 12%, transparent)` },
      label: { fontSize: 12, lineHeight: '18px', fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' },
      text: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' },
      caption: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', wordBreak: 'break-all' },
      error: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-state-error-primary, #d33)' },
      row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
      code: {
        fontFamily: MONO, fontSize: 12, lineHeight: '18px',
        padding: '10px 12px', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,.1))',
        border: '1px solid var(--dsw-alias-border-l1, transparent)',
        color: 'var(--dsw-alias-label-primary)', wordBreak: 'break-all', whiteSpace: 'pre-wrap', margin: 0,
      },
      log: { maxHeight: 200, overflow: 'auto' },
      pairing: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 20 },
      pairingInfo: { flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
      qrBox: {
        flex: '0 0 auto', padding: 10, borderRadius: 12, background: '#fff', lineHeight: 0,
        border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25))',
      },
      qr: { width: 200, height: 200, imageRendering: 'pixelated' },
      apps: { display: 'flex', flexWrap: 'wrap', gap: 12 },
      app: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 12,
        border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25))',
      },
      appQr: { width: 112, height: 112, padding: 6, borderRadius: 8, background: '#fff', imageRendering: 'pixelated' },
      link: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-link, #2563eb)', textDecoration: 'none' },
      links: { display: 'grid', gridTemplateColumns: 'max-content 1fr', alignItems: 'center', columnGap: 16, rowGap: 10 },
      chip: {
        display: 'inline-flex', alignItems: 'baseline', gap: 6, padding: '5px 12px', borderRadius: 8,
        fontSize: 13, lineHeight: '20px', textDecoration: 'none', color: 'var(--dsw-alias-label-primary)',
        border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25))',
      },
      chipHost: { fontSize: 12, color: 'var(--dsw-alias-link, #2563eb)' },
      guide: {
        display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 12,
        border: `1px solid ${SUCCESS}`, background: `color-mix(in srgb, ${SUCCESS} 8%, transparent)`,
      },
      guideHead: { fontSize: 16, lineHeight: '24px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      guideTitle: { fontSize: 13, lineHeight: '20px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      mock: { display: 'block', width: '100%', maxWidth: 360, height: 'auto' },
      radio: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--dsw-alias-label-primary)' },
    }

    // Polls the host while the page is shown: dsh has no host-to-page push.
    // Polls faster while an installation runs or a pairing code waits.
    function useStatus(waitingFor) {
      const waiting = useRef(waitingFor)
      waiting.current = waitingFor
      const [status, setStatus] = useState(undefined)
      const [error, setError] = useState(undefined)
      const [tick, setTick] = useState(0)
      const refresh = useCallback(() => setTick((value) => value + 1), [])
      useEffect(() => {
        let live = true
        let timer
        const load = async () => {
          try {
            const next = await call('GET', '/status?region=' + region())
            if (!live) return
            setStatus(next)
            setError(undefined)
          } catch (err) {
            if (live) setError(String(err?.message ?? err))
          }
          if (!live) return
          const current = latest.current
          const busy = current?.install?.phase === 'running' ||
            (waiting.current !== undefined && pairedFor(current, waiting.current) === undefined)
          timer = setTimeout(load, busy ? POLL_BUSY_MS : POLL_MS)
        }
        load()
        return () => { live = false; clearTimeout(timer) }
      }, [tick])
      const latest = useRef(status)
      latest.current = status
      return [status, error, setStatus, refresh]
    }

    // A pairing reported for an earlier code does not count for this one.
    const pairedFor = (status, code) =>
      code && status?.pairing?.expiresAt === code.expiresAt ? status.pairing.paired : undefined

    function link(href, label, extra) {
      return h('a', { href, target: '_blank', rel: 'noopener noreferrer', style: style.link, ...extra }, label)
    }

    /** A card's title row: the step number (a check once done), the title, and a state badge. */
    function CardHead({ step, done, title, badge, ok }) {
      return h('div', { style: style.head },
        step === undefined ? null : h('span', { style: done ? { ...style.step, ...style.stepDone } : style.step }, done ? '✓' : step),
        h('div', { style: style.title }, title),
        badge ? h('span', { style: ok ? { ...style.badge, ...style.badgeOk } : style.badge }, badge) : null)
    }

    function InstallDialog({ t, status, open, onClose, onInstall }) {
      const [source, setSource] = useState(region())
      useEffect(() => { if (open) setSource(region()) }, [open])
      const url = status?.installScripts?.[source] ?? ''
      const choice = (value, label) => h('label', { style: style.radio, key: value },
        h('input', { type: 'radio', name: 'quicktui-dsh-source', checked: source === value, onChange: () => setSource(value) }),
        label)
      return h(Modal, {
        open, onClose, title: t('install.title'), closeLabel: t('install.close'),
        footer: h(React.Fragment, null,
          h(Button, { variant: 'outline', onClick: onClose }, t('install.cancel')),
          h(Button, { variant: 'primary', onClick: () => onInstall(source), 'data-modal-autofocus': true }, t('install.confirm'))),
      },
      h('div', { style: style.page },
        h('div', { style: style.text }, t('install.body')),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          h('div', { style: style.title }, t('install.source')),
          choice('global', t('install.global')),
          choice('cn', t('install.cn'))),
        h('div', { style: style.caption }, t('install.same')),
        h('pre', { style: style.code }, `curl -fsSL ${url} | sh -s -- ${status?.installArgs ?? ''}`)))
    }

    function ServerCard({ t, status, refresh, setStatus }) {
      const [dialog, setDialog] = useState(false)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(undefined)
      const act = async (path, body) => {
        setBusy(true)
        setError(undefined)
        try {
          setStatus(await call('POST', path, body))
        } catch (err) {
          setError(String(err?.message ?? err))
        } finally {
          setBusy(false)
          refresh()
        }
      }
      const install = status?.install
      const running = status?.server?.running === true
      const badge = !status ? undefined
        : install?.phase === 'running' ? t('badge.installing')
          : !status.server.found ? t('badge.missing')
            : running ? t('badge.running') : t('badge.stopped')
      const children = [h(CardHead, { key: 'head', step: 1, done: running, title: t('server.title'), badge, ok: running })]
      const add = (node) => children.push(React.cloneElement(node, { key: children.length }))
      if (!status) {
        add(h('div', { style: style.text }, t('server.checking')))
      } else if (install?.phase === 'running') {
        add(h('div', { style: style.text }, t('install.running')))
        if (install.log) add(h('pre', { style: { ...style.code, ...style.log } }, install.log))
      } else if (!status.server.found) {
        add(h('div', { style: style.text }, t('server.missing')))
        if (install?.phase === 'failed') {
          add(h('div', { style: style.error }, t('install.failed', { error: install.error ?? '' })))
          if (install.log) add(h('pre', { style: { ...style.code, ...style.log } }, install.log))
        }
        if (status.installKind === 'store') {
          add(h('div', { style: style.caption }, t('install.storeHint')))
          add(h('div', { style: style.row }, link(status.storeUrl, t('install.store'))))
        } else {
          add(h('div', { style: style.row },
            h(Button, { variant: 'primary', disabled: busy, onClick: () => setDialog(true) },
              install?.phase === 'failed' ? t('install.retry') : t('install.button'))))
          add(h(InstallDialog, {
            t, status, open: dialog, onClose: () => setDialog(false),
            onInstall: (source) => { setDialog(false); act('/install', { source }) },
          }))
        }
      } else if (!status.server.running) {
        add(h('div', { style: style.text }, t('server.stopped')))
        add(h('div', { style: style.caption }, status.server.path))
        add(h('div', { style: style.row },
          h(Button, { variant: 'primary', disabled: busy, onClick: () => act('/start') }, busy ? t('server.starting') : t('server.start'))))
      } else {
        add(h('div', { style: style.text }, t('server.running', { port: status.server.port })))
        add(h('div', { style: style.caption }, status.server.version
          ? t('server.version', { version: status.server.version, path: status.server.path })
          : status.server.path))
      }
      if (error) add(h('div', { style: style.error }, error))
      return h('section', { style: style.card }, children)
    }

    const clock = (ms) => {
      const seconds = Math.max(0, Math.ceil(ms / 1000))
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    }

    const MOCK = {
      bg: '#232923', card: '#282f28', stroke: '#81af582e', green: '#81af58', amber: '#ceba49',
      text: '#ece1c0', text2: '#b0aa91', text3: '#7d7c6a',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    }
    // The app's 960-unit Material glyphs (qt_icon_*.xml, the design system's ic-*).
    const GLYPHS = {
      chat: 'M289.23-310.77q-13.08 0-21.92-8.84-8.85-8.85-8.85-21.93v-40h470l25.39 25.39V-720h40q13.07 0 21.92 8.85 8.85 8.84 8.85 21.92v501.54L701.54-310.77H289.23Zm-153.85-27.69v-470.77q0-13.08 8.85-21.92 8.85-8.85 21.92-8.85h476.93q13.07 0 21.92 8.85 8.85 8.84 8.85 21.92v316.92q0 13.08-8.85 21.93-8.85 8.84-21.92 8.84H258.46L135.38-338.46Zm498.47-163.08V-800H175.38v353.85l55.39-55.39h403.08Zm-458.47 0V-800v298.46Z',
      files: 'M180-200q-25.31 0-42.65-17.35Q120-234.69 120-260v-435.38q0-25.31 19.65-44.97Q159.31-760 184.62-760h199.23l80 80h311.53q20.7 0 36.12 11.19 15.42 11.19 21.58 28.81H447.77l-80-80H184.62q-10.77 0-17.7 6.92-6.92 6.93-6.92 17.7v430.76q0 8.47 4.23 13.85 4.23 5.39 11.15 9.23L266-544.62h648.62l-90.7 302.24q-5.69 19.07-21.8 30.73Q786-200 766.15-200H180Zm37.08-40h564.46l78.92-264.62H296L217.08-240Zm0 0L296-504.62 217.08-240ZM160-640v-80 80Z',
      portForward: 'M292.31-200.77 120-373.08l172.31-172.3 28.31 28.53-123.77 123.77h295.46v40H196.85l123.77 123.77-28.31 28.54Zm375.38-214.61-28.31-28.54 123.77-123.77H467.69v-40h295.46L639.38-731.46 667.69-760 840-587.69 667.69-415.38Z',
      bolt: 'm366.15-124.62 40-275.38h-170l299.23-431.54h18.47L514.62-520h200l-330 395.38h-18.47Z',
    }
    const glyph = (name, x, y, size, color) => h('path', {
      d: GLYPHS[name], fill: color, transform: `translate(${x} ${y}) scale(${size / 960}) translate(0 960)`,
    })

    // The app's server card (design system scene profiles/server-list) with
    // the chat tool, which opens the chat list, marked.
    function ServerCardMock({ t }) {
      const connect = t('guide.connect')
      const connectWidth = 18 + connect.length * (/^[\x00-\x7f]*$/.test(connect) ? 7.4 : 12.5)
      const connectX = 210 - connectWidth / 2
      return h('svg', { viewBox: '0 0 320 160', style: style.mock, role: 'img', 'aria-label': t('guide.title') },
        h('rect', { width: 320, height: 160, rx: 12, fill: MOCK.bg }),
        h('rect', { x: 12, y: 12, width: 296, height: 98, rx: 14, fill: MOCK.card, stroke: MOCK.stroke }),
        h('text', { x: 28, y: 42, fontFamily: MOCK.mono, fontSize: 12 },
          h('tspan', { fill: MOCK.green }, '$ '),
          h('tspan', { fill: MOCK.text }, 'my-computer'),
          h('tspan', { fill: MOCK.text3 }, ' @ '),
          h('tspan', { fill: MOCK.text2 }, '192.168.1.20:8022')),
        h('circle', { cx: 290, cy: 38, r: 4, fill: MOCK.green }),
        glyph('chat', 30, 70, 16, MOCK.green),
        glyph('files', 62, 70, 16, MOCK.green),
        glyph('portForward', 94, 70, 16, MOCK.green),
        h('rect', { x: 128, y: 62, width: 164, height: 32, rx: 8, fill: MOCK.green, fillOpacity: 0.04, stroke: MOCK.green, strokeOpacity: 0.35 }),
        glyph('bolt', connectX, 72, 12, MOCK.green),
        h('text', { x: connectX + 18, y: 82, fill: MOCK.green, fontSize: 12, fontWeight: 500 }, connect),
        h('rect', { x: 20, y: 60, width: 36, height: 36, rx: 10, fill: MOCK.amber, fillOpacity: 0.14, stroke: MOCK.amber, strokeWidth: 2 }),
        h('path', { d: 'M66 142 C 46 140, 38 128, 38 110', fill: 'none', stroke: MOCK.amber, strokeWidth: 2, strokeLinecap: 'round' }),
        h('path', { d: 'M32 110 L38 99 L44 110 Z', fill: MOCK.amber }),
        h('text', { x: 72, y: 147, fill: MOCK.amber, fontSize: 14, fontWeight: 700 }, t('guide.tap')))
    }

    /** How to reach dsh sessions in the app; `paired` names the phone just paired. */
    function DshGuide({ t, paired }) {
      return h('div', { style: style.guide },
        h('div', { style: style.guideHead }, paired ? t('pair.done', { name: paired }) : t('guide.title')),
        paired ? h('div', { style: style.guideTitle }, t('guide.title')) : null,
        h('div', { style: style.text }, t('guide.body')),
        h(ServerCardMock, { t }))
    }

    function PairCard({ t, status, code, setCode, refresh }) {
      const [loading, setLoading] = useState(false)
      const [error, setError] = useState(undefined)
      const [copied, setCopied] = useState(false)
      const [now, setNow] = useState(Date.now())
      useEffect(() => {
        if (!code) return undefined
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
      }, [code])
      const create = async () => {
        setLoading(true)
        setError(undefined)
        setCopied(false)
        try {
          setCode(await call('POST', '/pairing'))
          setNow(Date.now())
          refresh()
        } catch (err) {
          setError(String(err?.message ?? err))
        } finally {
          setLoading(false)
        }
      }
      const running = status?.server?.running
      const paired = pairedFor(status, code)
      const count = running && Array.isArray(status.devices) ? status.devices.length : 0
      const children = [h(CardHead, {
        key: 'head', step: 2, done: count > 0, title: t('pair.title'),
        badge: count > 0 ? t('badge.paired', { count }) : undefined, ok: true,
      })]
      const add = (node) => children.push(React.cloneElement(node, { key: children.length }))
      if (!running) {
        add(h('div', { style: style.text }, t('pair.needServer')))
        return h('section', { style: style.card }, children)
      }
      const hasDevices = Array.isArray(status.devices) && status.devices.length > 0
      if (paired || (hasDevices && (!code || code.expiresAt <= now))) add(h(DshGuide, { t, paired }))
      if (Array.isArray(status.devices)) {
        add(h('div', { style: style.text }, hasDevices ? t('pair.devices', { names: status.devices.join(', ') }) : t('pair.none')))
      }
      if (code && !paired) {
        const left = code.expiresAt - now
        if (left <= 0) {
          add(h('div', { style: style.text }, t('pair.expired')))
        } else {
          add(h('div', { style: style.pairing },
            h('div', { style: style.qrBox }, h('img', { src: svgUrl(code.svg), alt: '', style: style.qr })),
            h('div', { style: style.pairingInfo },
              h('div', { style: style.text }, t('pair.scan')),
              h('div', { style: style.caption }, t('pair.expires', { time: clock(left) })),
              h('div', { style: style.label }, t('pair.text')),
              h('pre', { style: style.code }, code.text),
              h('div', { style: style.row },
                h(Button, {
                  size: 'sm', variant: 'outline',
                  onClick: () => { navigator.clipboard?.writeText(code.text).then(() => setCopied(true), () => {}) },
                }, copied ? t('pair.copied') : t('pair.copy')),
                h(Button, { size: 'sm', variant: 'ghost', onClick: () => setCode(undefined) }, t('pair.hide'))),
              status.devicesSupported === false ? h('div', { style: style.caption }, t('pair.noReport')) : null)))
        }
      }
      if (!code || paired || code.expiresAt <= now) {
        add(h('div', { style: style.row },
          h(Button, { variant: 'primary', disabled: loading, onClick: create },
            loading ? t('pair.loading') : code ? t('pair.again') : t('pair.show'))))
      }
      if (error) add(h('div', { style: style.error }, error))
      return h('section', { style: style.card }, children)
    }

    function AppCard({ t, status }) {
      const apps = status?.apps ?? []
      const label = { ios: t('app.ios'), android: t('app.android') }
      return h('section', { style: style.card },
        h(CardHead, { step: 3, title: t('app.title') }),
        h('div', { style: style.text }, t('app.body')),
        h('div', { style: style.apps }, apps.map((app) => h('div', { style: style.app, key: app.id },
          h('img', { src: svgUrl(app.svg), alt: '', style: style.appQr }),
          link(app.url, label[app.id] ?? app.id)))))
    }

    const host = (url) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

    function LinksCard({ t, status }) {
      if (!status?.websites || !status.guides) return null
      const chips = (links) => h('div', { style: style.row },
        ['global', 'cn'].map((region) => link(links[region], [
          h('span', { key: 'name' }, t(`site.${region}`)),
          h('span', { key: 'host', style: style.chipHost }, host(links[region]) + ' ↗'),
        ], { key: region, style: style.chip })))
      return h('section', { style: style.card },
        h(CardHead, { title: t('site.title') }),
        h('div', { style: style.links },
          h('div', { style: style.label }, t('site.website')), chips(status.websites),
          h('div', { style: style.label }, t('site.guide')), chips(status.guides)))
    }

    function ScreenshotColumn({ t, status }) {
      return h('aside', { style: style.aside }, status?.screenshot
        ? h('img', { src: status.screenshot, alt: t('shot.alt'), style: style.shot })
        : h('div', { style: style.shotFrame }, t('shot.placeholder')))
    }

    function SetupPage({ view, t }) {
      const [code, setCode] = useState(undefined)
      const [status, error, setStatus, refresh] = useStatus(code)
      if (view !== 'page') return null
      return h('div', { style: style.layout },
        h('div', { style: style.main },
          error ? h('div', { style: style.error }, t('error.network', { error })) : null,
          h(ServerCard, { t, status, refresh, setStatus }),
          h(PairCard, { t, status, code, setCode, refresh }),
          h(AppCard, { t, status }),
          h(LinksCard, { t, status })),
        h(ScreenshotColumn, { t, status }))
    }

    function ActivationPrompt({ t, onDismiss, onOpenDetails }) {
      const [needed, setNeeded] = useState(undefined)
      useEffect(() => {
        let live = true
        call('GET', '/status?region=' + region()).then(
          (status) => { if (live) setNeeded(!(status.server.running && status.devices?.length > 0)) },
          () => { if (live) setNeeded(true) })
        return () => { live = false }
      }, [])
      useEffect(() => { if (needed === false) onDismiss() }, [needed, onDismiss])
      return h(Modal, {
        open: needed === true, onClose: onDismiss, title: t('activation.title'), closeLabel: t('install.close'),
        footer: h(React.Fragment, null,
          h(Button, { variant: 'outline', onClick: onDismiss }, t('activation.later')),
          h(Button, { variant: 'primary', onClick: onOpenDetails, 'data-modal-autofocus': true }, t('activation.open'))),
      }, h('div', { style: style.text }, t('activation.body')))
    }

    function apply(ctx) {
      localeRuntime = ctx.locale
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'quicktui-dsh.locale')
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config', key: PACKAGE, locale: NS,
      }, SetupPage))
      ctx.slots.inject('plugins.bundle.activation', () => ctx.slots.register({
        name: 'plugins.bundle.activation', key: PACKAGE, locale: NS,
      }, ActivationPrompt))
    }

    exports.name = 'quicktui-dsh'
    exports.inject = ['slots', 'locale']
    exports.apply = apply
    return module.exports
  },
})
