// ReactFlow base styles must load before component mount so edges/nodes render.
import 'reactflow/dist/style.css'
// Vibe-Workflow Tailwind utility overrides (dark node chrome, custom scrollbar,
// etc.). Imported once here so the vendored components pick them up globally.
import '@/vibe/tailwind.css'

import type * as React from 'react'

import { WorkflowBuilder } from '@/vibe'

import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

interface VibeViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

// Full-canvas node-graph view. Mirrors the shape of StudioView (section root +
// heading block + content area) but gives WorkflowBuilder the full remaining
// viewport height so reactflow's panzoom canvas has room to breathe.
export function VibeView({ setStatusbarItemGroup: _setStatusbarItemGroup, className, ...props }: VibeViewProps) {
  return (
    <section className={className ?? 'flex h-full w-full flex-col'} {...props}>
      <div className="shrink-0 px-6 pt-5 pb-3">
        <h1 className="text-xl font-semibold text-text-primary">Flow Builder</h1>
        <p className="text-sm text-text-secondary">Build and run multi-step AI workflows on the node canvas.</p>
      </div>

      {/* Give the canvas the remaining viewport height minus the header and
          app titlebar (~48px titlebar + ~72px heading block). ReactFlow needs
          an explicit height on its container to initialise correctly. */}
      <div className="h-[calc(100vh-120px)] w-full flex-1">
        <WorkflowBuilder />
      </div>
    </section>
  )
}
