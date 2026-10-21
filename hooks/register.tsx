import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ProjectPage, Todo } from '../types'

const PLUGIN = 'project-notes'
const PANE = 'project-notes'
const TITLE = 'Notes / To Do'
// The pane's and the band's toggle Buttons carry this engine action, so the
// chord the person binds to it in ~/.claude/keybindings.json presses them.
// Claude Code itself never responds to it, so nothing else fires on the chord.
const ACTION = 'confirm:previousField'
// The first of these no one else has taken is registered.
const COMMANDS = ['todo', 'notes'] as const

const EMPTY: ProjectPage = { todos: [], notes: '' }

const root = atom({ plugin: 'project-notes', key: 'root' } as const, '')
const page = atom({ plugin: 'project-notes', key: 'page' } as const, EMPTY)
const draft = atom({ plugin: 'project-notes', key: 'draft' } as const, '')
const isOpen = atom({ plugin: 'project-notes', key: 'isOpen' } as const, false)

const storeKey = (dir: string) => `project:${dir}`

// The name this load registered; a reload runs session.start and sets it again.
let command: string | undefined
// Every write to the store goes through this chain, so two quick edits never
// read the same old page and drop each other.
let writes: Promise<unknown> = Promise.resolve()

const projectRoot = async ($: EngineInterface, cwd: string) => {
  try {
    const git = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd })
    const top = git.stdout.trim()

    return git.exitCode === 0 && top ? top : cwd
  } catch {
    return cwd
  }
}

const loadPage = async ($: EngineInterface, dir: string): Promise<ProjectPage> => {
  const saved = (await $.store.get(storeKey(dir))) as Partial<ProjectPage> | undefined

  return {
    todos: Array.isArray(saved?.todos) ? saved.todos : [],
    notes: typeof saved?.notes === 'string' ? saved.notes : '',
  }
}

// Applies `change` to the stored page, read fresh so another session's edits
// to the same project are kept, then shows the result.
const edit = ($: EngineInterface, change: (p: ProjectPage) => ProjectPage) => {
  const run = writes.then(async () => {
    const dir = await read($, root)
    const next = change(await loadPage($, dir))
    await $.store.set(storeKey(dir), next)
    await update($, page, () => next)
  })
  writes = run.catch(error => $.ui.log(`${PLUGIN}: could not save: ${String(error)}`))

  return writes
}

// Re-reads the page on every open, so edits another session made show.
const openPane = async ($: EngineInterface) => {
  const fresh = await loadPage($, await read($, root))
  await update($, page, () => fresh)
  await $.ui.open({ id: PANE, title: TITLE, focus: true, columns: 48 })
  await update($, isOpen, () => true)
}

// The engine does not raise this plugin's own ui.close hook for its own
// close, so the flag is cleared here; the hook covers the person's close.
const closePane = async ($: EngineInterface) => {
  await $.ui.close({ id: PANE })
  await update($, isOpen, () => false)
}

const toggle = async ($: EngineInterface) =>
  (await read($, isOpen)) ? closePane($) : openPane($)

// Points the session's state at the project and its saved page. Run at the
// session's start and again after /clear, which resets the session's state.
const init = async ($: EngineInterface, cwd: string) => {
  const dir = await projectRoot($, cwd)
  await update($, root, () => dir)
  const loaded = await loadPage($, dir)
  await update($, page, () => loaded)
  const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
  await update($, isOpen, () => isUp)
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await init($, e.cwd)

    // A name counts as taken unless this mod is the one that holds it, as it
    // does after a reload.
    const taken = new Set(
      (await $.command.list())
        .filter(c => c.plugin !== PLUGIN && !c.plugin?.startsWith(`${PLUGIN}@`))
        .map(c => c.name),
    )
    command = COMMANDS.find(name => !taken.has(name))
    if (command === 'todo') {
      await $.command.register({ name: 'todo', description: 'Open this project’s Notes / To Do pane' })
    } else if (command === 'notes') {
      await $.command.register({ name: 'notes', description: 'Open this project’s Notes / To Do pane' })
    } else {
      $.ui.log(`${PLUGIN}: /todo and /notes are both taken; open the pane with its keyboard chord`)
    }

    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    const started = await next(e)
    if (e.source === 'clear') await init($, await $.session.cwd())

    return started
  })

  on('command.run', { command: 'todo' }, async ($, e, next) => {
    if (command !== 'todo') return next(e)
    await openPane($)

    return { text: 'Notes / To Do pane opened.' }
  })

  on('command.run', { command: 'notes' }, async ($, e, next) => {
    if (command !== 'notes') return next(e)
    await openPane($)

    return { text: 'Notes / To Do pane opened.' }
  })

  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE) await update($, isOpen, () => false)

    return closed
  })

  // While the pane is closed, one dim row above the prompt keeps the chord
  // live and shows what is open.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (await read($, isOpen)) return next(e)
    const { Box, Button } = $.ui.resolve(e)
    const { todos } = await read($, page)
    const open = todos.filter(todo => !todo.isDone).length

    return (
      <Box>
        <Button key="open-notes" plain dimColor action={ACTION} onPress={() => toggle($)}>
          {`Notes / To Do · ${open} open`}
        </Button>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const t = $.ui.resolve(e)
    const { Box, Text, Button } = t
    const { todos, notes } = await read($, page)
    const dir = await read($, root)
    const text = await read($, draft)
    const name = dir.split('/').filter(Boolean).pop() ?? dir

    const setTodo = (id: string, change: (todo: Todo) => Todo | undefined) =>
      edit($, p => ({
        ...p,
        todos: p.todos.flatMap(todo => {
          if (todo.id !== id) return [todo]
          const changed = change(todo)

          return changed ? [changed] : []
        }),
      }))

    const addTodo = async (value: string) => {
      const line = value.trim()
      await update($, draft, () => '')
      if (!line) return
      await edit($, p => ({ ...p, todos: [...p.todos, { id: newId(), text: line, isDone: false }] }))
    }

    const rows = todos.map(todo => (
      <Box flexDirection="row">
        <Button key={`todo-${todo.id}`} plain onPress={() => setTodo(todo.id, one => ({ ...one, isDone: !one.isDone }))}>
          {todo.isDone ? '[x] ' : '[ ] '}
          {todo.isDone ? <Text dimColor strikethrough>{todo.text}</Text> : todo.text}
        </Button>
        <Text> </Text>
        <Button key={`del-${todo.id}`} plain dimColor onPress={() => setTodo(todo.id, () => undefined)}>
          {'✕'}
        </Button>
      </Box>
    ))
    const open = todos.filter(todo => !todo.isDone).length
    const done = todos.length - open

    return (
      <Box flexDirection="column">
        <Text bold>{name}</Text>
        <Text dimColor>{dir}</Text>

        <Box marginTop={1}>
          <Text bold>{`To do · ${open} open`}</Text>
        </Box>
        {todos.length === 0 && <Text dimColor>Nothing to do yet.</Text>}
        {rows}
        {'Input' in t ? (
          <t.Input
            key="add-todo"
            label="+ "
            placeholder="Add a to-do"
            submitLabel="add"
            value={text}
            autoFocus
            onInput={value => update($, draft, () => value)}
            onSubmit={addTodo}
          />
        ) : null}
        {done > 0 && (
          <Button key="clear-done" plain dimColor onPress={() => edit($, p => ({ ...p, todos: p.todos.filter(todo => !todo.isDone) }))}>
            {`Clear ${done} done`}
          </Button>
        )}

        <Box marginTop={1}>
          <Text bold>Notes</Text>
        </Box>
        {'Input' in t ? (
          <t.Input
            key="notes"
            placeholder="Project notes (saved as you type)"
            submitLabel="save"
            rows={10}
            value={notes}
            onInput={value => edit($, p => ({ ...p, notes: value }))}
            onSubmit={value => edit($, p => ({ ...p, notes: value }))}
          />
        ) : (
          <Text>{notes || '(no notes)'}</Text>
        )}

        <Box marginTop={1}>
          <Button key="close-notes" plain dimColor action={ACTION} onPress={() => toggle($)}>
            Close
          </Button>
        </Box>
      </Box>
    )
  })
}
