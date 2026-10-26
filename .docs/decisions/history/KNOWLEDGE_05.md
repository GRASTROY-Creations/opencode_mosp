The proper way to refresh terminal content in an OpenCode plugin

The right approach is to trigger a re-render of the plugin's UI, not to close and reopen the plugin panel. However, the exact mechanism depends on whether you're using the newer CLI/TUI plugin API or an older plugin API, and whether the content is reactive.

OpenCode's newer plugin documentation exposes different UI mechanisms, including custom TUI panels. There's also a documented widget API with an explicit refresh(widgetId) method. These are different approaches, so it's important to distinguish them. 
OpenCode
+2

What to use, depending on your plugin

Situation

	

Recommended approach




A table's data changes

	

Update the data/state that the component renders




A custom CLI panel displays stale content

	

Fix its reactive rendering or data subscription




You explicitly need to reload cached OpenCode data

	

Use the relevant sync() and/or invalidate() API




A terminal widget uses the documented widget API

	

Call refresh(widgetId)




The terminal display is visually corrupted

	

Try a redraw or resize workaround; restart only if necessary

These approaches address different problems: refreshing the UI is not necessarily the same as fetching fresh data. 
OpenCode
+1

1. For a modern OpenCode CLI plugin: update the rendered state

The current CLI plugin documentation  describes panels built with JSX and reactive components. For example, a plugin registers a session.panel slot and renders a component for the selected panel name. Closing the panel disposes its contents; changing its presentation preserves mounted contributions. 
OpenCode

Conceptually, the preferred flow is:

text
Data changes
    ↓
Update reactive state
    ↓
Component re-renders
    ↓
Updated table appears

Avoid making panel close/reopen the normal refresh mechanism. It can mask a missing reactive dependency or subscription and may discard component-local state.

2. If the plugin renders a registered TUI widget

A separate OpenCode GitHub issue describes a widget API with an explicit refresh callback:

ts
ctx.refresh(widgetId)

That API is documented in the issue's proposed interface, so verify that your installed OpenCode version actually implements it before relying on it. It should not be assumed to exist in every plugin API version. 
GitHub

3. If the content is stale because of cached data

OpenCode's current CLI API exposes data synchronization and invalidation methods. For example:

ts
await context.data.session.message.sync(sessionID)

// Read the current cached messages after syncing
const messages = context.data.session.message.list(sessionID) ?? []

// Invalidate cached data when appropriate
context.data.session.message.invalidate(sessionID)

Use the equivalent methods for the data source your table displays. Don't invalidate everything just to force a repaint. 
OpenCode
+1

4. If you mean the actual terminal screen is stale

There is also a documented OpenCode issue about incorrect TUI layout after terminal resizing. Its reported workaround is a redraw, although behavior depends on the version and terminal environment. That is a rendering/layout problem, distinct from a plugin's data-refresh problem. 
anomalyco/opencode

My recommendation

Use reactive state updates for panel content, explicit data synchronization for stale data, and redraws only for terminal-rendering glitches. Reopening the panel should be a fallback, not the design.

One detail would let me give you a precise answer, including the correct API and code:

Which kind of plugin are you building?

A. Modern CLI/TUI plugin using @opencode/plugin/tui, JSX and OpenTUI

B. Older OpenCode plugin using @opencode/plugin or client.tui

C. A plugin that prints plain text or an ASCII table directly to the terminal

D. Something else — share the relevant rendering code

The distinction matters because the appropriate refresh mechanism differs across these implementations.