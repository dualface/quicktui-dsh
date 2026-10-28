# quicktui-dsh bridge protocol

The contract between the bridge in `lib/bridge.js` and AgentBridge2's `ab2hook --agent dsh`.
The setup page and its routes are described in [README.md](README.md) and [AGENTS.md](AGENTS.md).

The bridge needs `sessionController`, which only the `desktop` and `web` profiles provide. One
plugin instance serves every Session of its dsh process. Subagent Sessions (header
`origin: "subagent"`) are not mirrored and send no events; their approvals and questions are
reported as requests of the parent Session (header `parentSession`).

Verified against dsh 0.2.x (deepseek-harness commit 22ddee37) on Windows.

## Hook command

The hook is the detected `quicktui-server` executable (or the `serverPath` config): the bridge runs
`<server> ab2hook --agent dsh ... --root <root>` with an argv array. The path is read again
before every hook process. While no server is known the bridge only writes sidecars and leaves
every request to Desktop; once one is found it sends `plugin_start`, and the owner (below) starts
taking commands.

## Owner

Several dsh processes (a desktop and a web profile) can run the plugin against one sidecar
directory. The process holding `<sidecarDir>/owner.pid` is the owner: only it does the startup
backfill and waits for commands, so each command runs once. A process that is not the owner asks
again before each command wait and takes over once the owner exits.

## Config

The `quicktui-dsh` row in a profile's `cordis.patch.yml` takes these optional keys:

| Key | Meaning |
| --- | --- |
| `bridge` | `false` turns the bridge off; default on |
| `serverPath` | absolute `quicktui-server` path; detected when absent |
| `root` | passed as `--root`; default `~/.config/quicktui-server-v2/agentbridge2`, the root of the server that uses the default config |
| `sidecarDir` | default `<DSH_HOME or ~/.dsh>/quicktui/sidecar` |
| `backfillDays` | default 30 |

## Sidecar

`<sidecarDir>/<session id>.jsonl`: one header line
`{"type":"ab2/sidecar","schema_version":"ab2.dsh-sidecar.v1","session":<dsh header>}`, then dsh's
own log events (`{type, seq, time, data}`) in seq order without gaps or repeats. The events are
dsh's, unchanged; their meaning follows dsh's session event schema.

`<session id>.state.json` holds `{"schema_version":"ab2.dsh-sidecar.v1","last_seq":N,"updated_at":ms}`.
It is replaced atomically after each append, so a reader that stops at `last_seq` never sees a
partial line. The plugin itself trusts the sidecar: the first time it touches a Session in a
process it continues after the sidecar's last complete line and cuts a torn one, so a crash between
an append and its state write repeats no event.

- At startup the plugin reads every Session updated within `backfillDays` that is not blank and not
  a subagent Session. Only the owner does this, so a desktop and a web profile running together do
  not both rewrite the sidecars. Older Sessions get their full history the first time they show
  activity.
- A seq gap, a Session without a sidecar, `agent/created`, and `agent/status: idle` each trigger a
  full read through `sessionQuery.readSession`. Some appends never reach `session/event`: the
  `session/end-seed` written when Desktop reopens a Session, and the `interrupted` turn end dsh
  writes for a turn that was running when dsh was killed.
- A sidecar without this schema's header line is rewritten from a full read.
- Sidecars are never deleted by the plugin.

## Hook events

Each event is one JSON line on the stdin of `ab2hook --agent dsh --source-version dsh-plugin.v1`.
Every event has `schema_version: "ab2.dsh-plugin-event.v1"`, `event`, and `instance_id`
(`dsh-<pid>-<start>` in base 36, one per plugin start). Events carry no message text.

| `event` | Fields |
| --- | --- |
| `plugin_start` | `pid`, `sidecar_dir`, `backfill_days` |
| `backfill_done` | `sessions` (read), `total` (listed), `backfill_days` |
| `plugin_stop` | none. Sent on unload. A killed dsh sends nothing: a newer `instance_id` or a dead `pid` ends the old instance. |
| `session_status` | `agent_session_id`, `status` (`running` or `idle`) |
| `turn_start` | `agent_session_id`, `seq` |
| `turn_end` | `agent_session_id`, `seq`, `reason` (`completed`, `aborted`, ...) |
| `transcript_updated` | `agent_session_id`, `last_seq`, `sidecar_path`; debounced per Session |
| `ui_prompt_start` | `agent_session_id`, `prompt_id`, `kind`, and the request (below) |
| `ui_prompt_end` | `agent_session_id`, `prompt_id`, `kind`, `answered_by` (`remote` or `local`; `local` includes a cancelled request) |
| `command_done` | `command_id`, `command_kind`, `agent_session_id` |
| `command_failed` | the same, plus `error` |

Approval (`kind: "approval"`): `tool_name`, `tool_call_id`, `reason`, `display_reason` (locale map),
`tool_arguments` (the tool call's raw JSON arguments, bounded).

Question (`kind: "question"`): `tool_call_id` and `timed` (from dsh's wait), `questions[]` with `id`,
`question`, `detail`, `header`, `multi_select`, `intent` (`kind`, `approve`, `reject`, `always`), and
`options[]` (`label`, `description`). A question with more than 16 questions, more than 64 options,
or an over-long id or label is not reported and stays Desktop-only.

Shown text is bounded to 4096 UTF-8 bytes (question `detail`: 65536); ids to 256 bytes.

## Dialog wait

While a request is open the plugin keeps one
`ab2hook --agent dsh --wait-dialog` process with stdin
`{"schema_version":"ab2.dsh-dialog-wait.v1","agent_session_id":...,"prompt_id":...}`. It prints the
answer, or nothing:

- `{"schema_version":"ab2.dsh-dialog-answer.v1","kind":"approval","decision":"allow"|"reject"}`
  settles the approval as `allowed-once` or `rejected`.
- `{"schema_version":"ab2.dsh-dialog-answer.v1","kind":"question","answers":[{"id","selected":[labels],"custom"?}]}`
  must answer every question once, select only offered labels (at most one for a single-select
  question), and carry `custom` or a selection; a fixed-action (`intent.kind: "approval"`) question
  takes exactly one label and no `custom`.

A valid answer withdraws the Desktop card. An invalid answer is ignored and the wait restarts. When
Desktop answers first, or the request is cancelled, the wait process is killed. A wait that ends
within 60 s without an accepted answer restarts after 1, 5, 15, then every 30 s.

## Commands

The owner keeps one `ab2hook --agent dsh --wait-command` process with stdin
`{"schema_version":"ab2.dsh-command-wait.v1","channel_id":<instance_id>,"process_id":<dsh pid>}`.
AgentBridge2 sends commands for every dsh Session to the current wait of the channel. The process
prints at most one command:

- `{"schema_version":"ab2.dsh-command.v1","command_id","kind":"prompt","agent_session_id","text","mode"?: "queue"|"steer"}`
  (`text` non-blank, at most 32768 bytes, the QuickTUI prompt limit). Without `mode` the prompt
  waits behind the running turn (`queue`). A cold Session is resumed first.
- `{"schema_version":"ab2.dsh-command.v1","command_id","kind":"interrupt","agent_session_id"}`
  cancels the active turn. dsh keeps the Session inbox, so a queued or steered prompt stays
  pending. A Session that is not loaded fails with `not found (not attached)`.

The owner runs a command for any Session, also one that another dsh process has open: a prompt
then resumes the Session in the owner as well. Each `command_id` runs at most once (the last 64
are kept). Invalid commands are ignored.
