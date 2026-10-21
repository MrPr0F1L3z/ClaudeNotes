# project-notes

A Claude Code mod that adds a **Notes / To Do** pane beside the chat. In the
fullscreen layout it docks on the right, like the diff panel. Each project gets
its own to-do list and its own free-form notes. A project is the git top level
of the session's directory, or the directory itself outside git.

## Opening it

- `/todo`: the command is registered only if no other command already uses
  that name. If `/todo` is taken, `/notes` is registered instead. If both are
  taken, neither is registered, and the pane opens with the keyboard shortcut only.
- **Ctrl+Alt+T** (Ctrl+Opt+T on a Mac) toggles the pane, and so does the
  chord **Ctrl+X then T**.

While the pane is closed, one dim row above the prompt shows
`Notes / To Do · N open`. That row is where the shortcut lives: a mod can only
receive a key through a button it has drawn. You can also click the row to open the pane.

## Using the pane

- Type in the **+ Add a to-do** field and press Enter to add an item.
- Select an item (Enter, or a click) to tick it off. `✕` deletes the item, and
  **Clear N done** removes all ticked items.
- The **Notes** field holds several lines and saves as you type. `\` then Enter
  starts a new line.
- Tab and the arrow keys move between items. Esc hands the keyboard back to the
  prompt, and the pane stays open. **Close** or the shortcut closes it.

Everything is saved in the mod's own store under `~/.claude/plugins/store/`,
keyed by project. Nothing is written into your repositories.

## Keyboard shortcut setup

A mod cannot bind a key by itself. Its buttons answer the chord you bind to a
keybinding action, here `confirm:previousField`, which Claude Code itself never
acts on. Add this to `~/.claude/keybindings.json`:

```json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "$docs": "https://code.claude.com/docs/en/keybindings",
  "bindings": [
    {
      "context": "Global",
      "bindings": {
        "ctrl+alt+t": "confirm:previousField",
        "ctrl+x t": "confirm:previousField"
      }
    }
  ]
}
```

- **Linux desktops** such as XFCE, GNOME and Ubuntu bind Ctrl+Alt+T to "open a
  terminal", so the key never reaches Claude Code. Use Ctrl+X T, or free the
  key in your desktop's keyboard settings.
- **macOS**: Ctrl+Opt+T arrives only when the terminal sends Option as Meta.
  In Terminal.app, set Settings → Profiles → Keyboard → "Use Option as Meta
  key". In iTerm2, set Profiles → Keys → Left Option key → Esc+.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install project-notes --marketplace MrPr0F1L3z/ClaudeNotes
```

Answer `y` to add the marketplace, then pick a scope. The user scope comes first
and loads the plugin in every session.

From a shell:

```sh
claude plugin install project-notes --marketplace MrPr0F1L3z/ClaudeNotes
```

In the desktop app, where `/plugin` does not run: click + next to the prompt
box, then Plugins, then Add marketplace with `MrPr0F1L3z/ClaudeNotes`, then
Add plugin.

Then set up the keyboard shortcut, as described below.

## Develop

```sh
claude plugin validate .
claude plugin test .
claude --plugin-dir .      # run a session with the working copy loaded
```

## License

MIT. See [LICENSE](LICENSE).

## Limits

- Only the fullscreen layout docks panes on the right, from 110 columns wide.
  Otherwise the pane opens inline above the prompt.
- If two sessions in the same project edit the notes at once, the last
  keystroke wins. To-do changes are merged against the latest saved list.
