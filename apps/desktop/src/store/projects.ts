import { atom } from 'nanostores'

import {
  assignConversation,
  type ChatGroup,
  createChatGroup,
  deleteChatGroup,
  listChatGroups,
  unassignConversation,
  updateChatGroup
} from '@/hermes'
import { persistBoolean, storedBoolean } from '@/lib/storage'

const SIDEBAR_PROJECTS_OPEN_STORAGE_KEY = 'hermes.desktop.sidebarProjectsOpen'

// Projects (chat groups) bundle related conversations and can carry shared
// instructions that steer every chat inside them — the desktop mirror of the
// dashboard's conversation-library groups. Loaded on connect and kept fresh by
// the sidebar section + after each mutation, mirroring how $cronJobs works.
export const $projects = atom<ChatGroup[]>([])
export const $projectsLoading = atom(false)
// Expanded by default: the section only renders when projects exist, so an open
// default surfaces them without an extra click.
export const $sidebarProjectsOpen = atom(storedBoolean(SIDEBAR_PROJECTS_OPEN_STORAGE_KEY, true))

$sidebarProjectsOpen.subscribe(open => persistBoolean(SIDEBAR_PROJECTS_OPEN_STORAGE_KEY, open))

export function setSidebarProjectsOpen(open: boolean) {
  $sidebarProjectsOpen.set(open)
}

// Refresh the project list off the backend. Mutation helpers below await it so
// the sidebar reflects changes immediately (no stale list until the next poll).
export async function refreshProjects(): Promise<void> {
  $projectsLoading.set(true)

  try {
    $projects.set(await listChatGroups())
  } finally {
    $projectsLoading.set(false)
  }
}

export async function createProject(input: {
  description?: string
  instructions?: string
  name: string
}): Promise<ChatGroup> {
  const created = await createChatGroup(input)
  await refreshProjects()

  return created
}

export async function updateProject(
  id: string,
  updates: { description?: string; instructions?: string; name?: string }
): Promise<ChatGroup> {
  const updated = await updateChatGroup(id, updates)
  await refreshProjects()

  return updated
}

export async function deleteProject(id: string): Promise<void> {
  await deleteChatGroup(id)
  await refreshProjects()
}

export async function addSessionToProject(projectId: string, sessionId: string): Promise<void> {
  await assignConversation(projectId, sessionId)
  await refreshProjects()
}

export async function removeSessionFromProject(projectId: string, sessionId: string): Promise<void> {
  await unassignConversation(projectId, sessionId)
  await refreshProjects()
}
