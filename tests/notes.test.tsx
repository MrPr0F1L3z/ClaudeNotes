import { expect, test } from 'claude-code/testing'
import type { CommandInfo } from 'claude-code'

const PANE = {
  plugin: 'project-notes',
  component: 'Pane',
  requestId: 'project-notes',
  props: {
    title: 'Notes / To Do',
    isFocused: true,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

// Stands for the engine beneath the plugin: an in-memory store, a git root,
// a command list, and panes that always place.
const engine = (on: any, commands: CommandInfo[] = []) => {
  const store = new Map<string, unknown>()
  const registered: string[] = []
  on('store.get', (_: unknown, e: { key: string }) => ({ value: store.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('process.run', () => ({
    value: { exitCode: 0, stdout: '/work/demo\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('command.list', () => ({ value: commands }))
  on('command.register', (_: unknown, e: { name: string }) => {
    registered.push(e.name)

    return { value: { command: e.name } }
  })
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))

  return { store, registered }
}

const start = { cwd: '/work/demo/src', surface: 'terminal', isInteractive: true } as const

test('registers /todo when it is free', async ($, on) => {
  const { registered } = engine(on)
  await $.session.start(start)
  expect(registered).toEqual(['todo'])
})

test('falls back to /notes when /todo is taken, and leaves /todo to its owner', async ($, on) => {
  const { registered } = engine(on, [{ name: 'todo', description: 'theirs', source: 'plugin', plugin: 'other' } as CommandInfo])
  await $.session.start(start)
  expect(registered).toEqual(['notes'])
})

test('keeps /todo across a reload, where the list already shows its own', async ($, on) => {
  const { registered } = engine(on, [{ name: 'todo', description: 'mine', source: 'plugin', plugin: 'project-notes' } as CommandInfo])
  await $.session.start(start)
  expect(registered).toEqual(['todo'])
})

test('to-dos and notes are saved per project root, on every surface', async ($, on) => {
  const { store } = engine(on)
  await $.session.start(start)

  for (const surface of ['terminal', 'desktop'] as const) {
    store.clear()
    await $.session.start(start)
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /Nothing to do yet/ }))?.text).toBe('Nothing to do yet.')

    await ui.input({ key: 'add-todo', text: 'Write the README' })
    await ui.input({ key: 'add-todo', text: 'Ship it' })
    await ui.input({ key: 'add-todo', text: '   ' })
    const saved = store.get('project:/work/demo') as { todos: { id: string; text: string; isDone: boolean }[]; notes: string }
    expect(saved.todos.map(t => t.text)).toEqual(['Write the README', 'Ship it'])
    expect((await ui.find({ key: 'add-todo' }))?.props.value).toBe('')

    const first = saved.todos[0]!
    await ui.press({ key: `todo-${first.id}` })
    expect((store.get('project:/work/demo') as typeof saved).todos[0]!.isDone).toBe(true)
    expect((await ui.find({ type: 'Text', text: /To do · 1 open/ }))).toBeDefined()

    await ui.press({ key: 'clear-done' })
    expect((store.get('project:/work/demo') as typeof saved).todos.map(t => t.text)).toEqual(['Ship it'])

    await ui.input({ key: 'notes', text: 'line one\nline two', kind: 'change' })
    expect((store.get('project:/work/demo') as typeof saved).notes).toBe('line one\nline two')
    expect((await ui.find({ key: 'notes' }))?.props.value).toBe('line one\nline two')

    const last = (store.get('project:/work/demo') as typeof saved).todos[0]!
    await ui.press({ key: `del-${last.id}` })
    expect((store.get('project:/work/demo') as typeof saved).todos).toEqual([])
    await ui.unmount()
  }
})

test('the band shows the open count and carries the chord while the pane is closed', async ($, on) => {
  const { store } = engine(on)
  store.set('project:/work/demo', { todos: [{ id: 'a', text: 'x', isDone: false }, { id: 'b', text: 'y', isDone: true }], notes: '' })
  await $.session.start(start)
  const band = await $.ui.mount({
    plugin: 'project-notes',
    component: 'AbovePrompt',
    surface: 'terminal',
    props: { bodyColumns: 80 },
  } as any)
  const open = await band.find({ key: 'open-notes' })
  expect(open?.text).toBe('Notes / To Do · 1 open')
  expect(open?.props.action).toBe('confirm:previousField')
  await band.unmount()
})

test('closing from the pane brings the band, and its chord, back', async ($, on) => {
  engine(on)
  on('ui.close', () => ({ value: undefined }))
  // Stands for the engine's own drawing where the band leaves the site to it.
  on('ui.render', ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })
  await $.session.start(start)
  const BAND = { plugin: 'project-notes', component: 'AbovePrompt', surface: 'terminal', props: { bodyColumns: 80 } } as any

  const band = await $.ui.mount(BAND)
  await band.press({ key: 'open-notes' })
  await band.unmount()
  const hidden = await $.ui.mount(BAND)
  expect(await hidden.find({ key: 'open-notes' })).toBeUndefined()
  await hidden.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'close-notes' })
  await pane.unmount()
  const back = await $.ui.mount(BAND)
  expect(await back.find({ key: 'open-notes' })).toBeDefined()
  await back.unmount()
})

test('after /clear the page is read again for the same project', async ($, on) => {
  const { store } = engine(on)
  on('session.cwd', () => ({ value: '/work/demo/src' }))
  on('classic.SessionStart', () => ({}))
  await $.session.start(start)
  store.set('project:/work/demo', { todos: [{ id: 'c', text: 'kept across clear', isDone: false }], notes: '' })

  await $.classic.SessionStart({ source: 'clear' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /\/work\/demo$/ })).toBeDefined()
  expect(await ui.find({ key: 'todo-c' })).toBeDefined()
  await ui.input({ key: 'add-todo', text: 'after clear' })
  expect([...store.keys()]).toEqual(['project:/work/demo'])
  await ui.unmount()
})
