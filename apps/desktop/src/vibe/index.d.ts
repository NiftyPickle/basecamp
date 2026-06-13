/**
 * Type declarations for the vendored Vibe-Workflow package.
 *
 * allowJs is false so TypeScript does not try to compile the .jsx sources.
 * This .d.ts file is the only TS-visible surface; all imports from TS/TSX
 * files must go through this entry -- never deep-import a .jsx directly from
 * a .tsx file.
 */

import type * as React from 'react'

export const WorkflowBuilder: React.ComponentType<Record<never, never>>
