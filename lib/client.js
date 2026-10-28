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
      'app.title': 'Get the QuickTUI app',
      'app.body': 'Scan a code with your phone camera, or open the link.',
      'app.ios': 'iPhone and iPad',
      'app.android': 'Android (preview)',
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
      'app.title': '下载 QuickTUI App',
      'app.body': '用手机相机扫码, 或打开链接.',
      'app.ios': 'iPhone 和 iPad',
      'app.android': 'Android (预览版)',
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

    const style = {
      page: { display: 'flex', flexDirection: 'column', gap: 16 },
      card: {
        display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 12,
        border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25))',
      },
      title: { fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      text: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' },
      caption: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', wordBreak: 'break-all' },
      error: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-state-error-primary, #d33)' },
      success: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-state-success-primary, #2a2)' },
      row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
      code: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12, lineHeight: '18px',
        padding: '8px 10px', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,.1))',
        color: 'var(--dsw-alias-label-primary)', wordBreak: 'break-all', whiteSpace: 'pre-wrap', margin: 0,
      },
      log: { maxHeight: 180, overflow: 'auto' },
      qr: { width: 220, height: 220, borderRadius: 8, background: '#fff', imageRendering: 'pixelated' },
      appQr: { width: 120, height: 120, borderRadius: 8, background: '#fff', imageRendering: 'pixelated' },
      apps: { display: 'flex', flexWrap: 'wrap', gap: 24 },
      app: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
      link: { fontSize: 13, color: 'var(--dsw-alias-state-business-primary, #2563eb)' },
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
        h('pre', { style: style.code }, `curl -fsSL ${url} | sh -s -- install -y`)))
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
      const children = [h('div', { style: style.title, key: 'title' }, t('server.title'))]
      const add = (node) => children.push(React.cloneElement(node, { key: children.length }))
      const install = status?.install
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
        add(h('div', { style: style.success }, t('server.running', { port: status.server.port })))
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
      const children = [h('div', { style: style.title, key: 'title' }, t('pair.title'))]
      const add = (node) => children.push(React.cloneElement(node, { key: children.length }))
      const running = status?.server?.running
      const paired = pairedFor(status, code)
      if (!running) {
        add(h('div', { style: style.text }, t('pair.needServer')))
        return h('section', { style: style.card }, children)
      }
      if (Array.isArray(status.devices)) {
        add(h('div', { style: style.text }, status.devices.length > 0 ? t('pair.devices', { names: status.devices.join(', ') }) : t('pair.none')))
      }
      if (code && paired) {
        add(h('div', { style: style.success }, t('pair.done', { name: paired })))
      } else if (code) {
        const left = code.expiresAt - now
        if (left <= 0) {
          add(h('div', { style: style.text }, t('pair.expired')))
        } else {
          add(h('div', { style: style.text }, t('pair.scan')))
          add(h('img', { src: svgUrl(code.svg), alt: '', style: style.qr }))
          add(h('div', { style: style.caption }, t('pair.expires', { time: clock(left) })))
          add(h('div', { style: style.caption }, t('pair.text')))
          add(h('pre', { style: style.code }, code.text))
          add(h('div', { style: style.row },
            h(Button, {
              size: 'sm', variant: 'outline',
              onClick: () => { navigator.clipboard?.writeText(code.text).then(() => setCopied(true), () => {}) },
            }, copied ? t('pair.copied') : t('pair.copy')),
            h(Button, { size: 'sm', variant: 'ghost', onClick: () => setCode(undefined) }, t('pair.hide'))))
          if (status.devicesSupported === false) add(h('div', { style: style.caption }, t('pair.noReport')))
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
        h('div', { style: style.title }, t('app.title')),
        h('div', { style: style.text }, t('app.body')),
        h('div', { style: style.apps }, apps.map((app) => h('div', { style: style.app, key: app.id },
          h('img', { src: svgUrl(app.svg), alt: '', style: style.appQr }),
          link(app.url, label[app.id] ?? app.id)))))
    }

    function SetupPage({ view, t }) {
      const [code, setCode] = useState(undefined)
      const [status, error, setStatus, refresh] = useStatus(code)
      if (view !== 'page') return null
      return h('div', { style: style.page },
        error ? h('div', { style: style.error }, t('error.network', { error })) : null,
        h(ServerCard, { t, status, refresh, setStatus }),
        h(PairCard, { t, status, code, setCode, refresh }),
        h(AppCard, { t, status }))
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
