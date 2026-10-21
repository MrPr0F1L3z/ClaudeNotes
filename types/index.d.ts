export type Todo = { id: string; text: string; isDone: boolean }

/** One project's saved page: the to-do list and the free-form notes. */
export type ProjectPage = { todos: Todo[]; notes: string }

declare module 'claude-code' {
  interface PluginState {
    'project-notes': {
      /** The project root the page belongs to: the git top level, else the cwd. */
      root: string
      page: ProjectPage
      /** The add-a-to-do field's text, held so a redraw neither keeps nor loses it wrongly. */
      draft: string
      isOpen: boolean
    }
  }
}
