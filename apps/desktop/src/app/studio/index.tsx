import type * as React from 'react'
import { useEffect, useState } from 'react'

import { CinemaStudio } from '@/components/studio/CinemaStudio'
import { EnhanceStudio } from '@/components/studio/EnhanceStudio'
import { HistoryRail } from '@/components/studio/HistoryRail'
import { ImageStudio } from '@/components/studio/ImageStudio'
import { LipsyncStudio } from '@/components/studio/LipsyncStudio'
import { MarketingStudio } from '@/components/studio/MarketingStudio'
import { StudioTabs, type StudioTab } from '@/components/studio/StudioTabs'
import { TemplatesStudio } from '@/components/studio/TemplatesStudio'
import { VideoStudio } from '@/components/studio/VideoStudio'
import { WorkflowsStudio } from '@/components/studio/WorkflowsStudio'
import { getStudioStatus, outputUrl, type StudioJob, type StudioStatus } from '@/lib/studio-api'
import { appendHistory, clearHistory, loadHistory, type HistoryEntry } from '@/lib/studio-history'
import { cn } from '@/lib/utils'

import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

interface StudioViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

// Ported from web/src/pages/StudioPage.tsx. The desktop renderer reaches the
// backend studio routes through the Electron IPC bridge (see lib/studio-api.ts),
// so this container is the web body unchanged except for the desktop View
// signature and the route-outlet chrome (section root + spread props).
export function StudioView({ setStatusbarItemGroup: _setStatusbarItemGroup, className, ...props }: StudioViewProps) {
  const [status, setStatus] = useState<StudioStatus | null>(null)
  const [statusFailed, setStatusFailed] = useState(false)
  const [tab, setTab] = useState<StudioTab>('image')
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())

  useEffect(() => {
    getStudioStatus()
      .then(setStatus)
      .catch(() => setStatusFailed(true))
  }, [])

  const unavailable = statusFailed || Boolean(status && (!status.available || !status.has_key))
  const disabled = unavailable

  function record(
    model: string,
    prompt: string,
    mode: HistoryEntry['mode'],
    media: 'image' | 'video',
    job: StudioJob,
    requestId: string
  ) {
    const outputs = job.outputs.map(outputUrl).filter((u): u is string => Boolean(u))
    if (outputs.length === 0) return
    setHistory(appendHistory({ id: requestId, mode, model, prompt, outputs, media }, Date.now()))
  }

  return (
    <section className={cn('mx-auto flex w-full max-w-5xl flex-col gap-4 p-6', className)} data-tour="studio" {...props}>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-text-primary">Studio</h1>
        <p className="text-sm text-text-secondary">Generate images and video, apply effects, and enhance media.</p>
      </div>

      {unavailable && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {statusFailed
            ? 'Could not check Studio availability.'
            : !status?.available
              ? 'muapi-cli is not installed on the server.'
              : 'MUAPI_API_KEY is not set on the server.'}
        </div>
      )}

      <StudioTabs value={tab} onChange={setTab} />

      <div className="flex gap-6">
        {/* Card-styled container. The web original used @nous-research/ui's
            Card, which the desktop's pinned @nous-research/ui build does not
            ship, so this mirrors the desktop card tokens directly. Both studios
            stay mounted (visibility via `hidden`) so an in-flight job's poll
            chain survives tab switches - same keep-mounted pattern as the chat
            host. */}
        <div className="flex-1 rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="max-h-[calc(100vh-260px)] overflow-y-auto p-5">
            <div className={tab === 'image' ? '' : 'hidden'}>
              <ImageStudio disabled={disabled} onComplete={(m, p, mode, job, id) => record(m, p, mode, 'image', job, id)} />
            </div>
            <div className={tab === 'video' ? '' : 'hidden'}>
              <VideoStudio disabled={disabled} onComplete={(m, p, mode, job, id) => record(m, p, mode, 'video', job, id)} />
            </div>
            <div className={tab === 'templates' ? '' : 'hidden'}>
              <TemplatesStudio
                disabled={disabled}
                onComplete={(label, media, job, id) => record(label, label, 'effect', media, job, id)}
              />
            </div>
            <div className={tab === 'enhance' ? '' : 'hidden'}>
              <EnhanceStudio disabled={disabled} onComplete={(label, job, id) => record(label, label, 'enhance', 'image', job, id)} />
            </div>
            <div className={tab === 'marketing' ? '' : 'hidden'}>
              <MarketingStudio
                disabled={disabled}
                onComplete={(motion, prompt, job, id) => record(motion, prompt, 'marketing', 'video', job, id)}
              />
            </div>
            <div className={tab === 'lipsync' ? '' : 'hidden'}>
              <LipsyncStudio
                disabled={disabled}
                onComplete={(model, prompt, job, id) => record(model, prompt, 'lipsync', 'video', job, id)}
              />
            </div>
            <div className={tab === 'cinema' ? '' : 'hidden'}>
              <CinemaStudio
                disabled={disabled}
                onComplete={(model, prompt, job, id) => record(model, prompt, 't2i', 'image', job, id)}
              />
            </div>
            <div className={tab === 'workflows' ? '' : 'hidden'}>
              <WorkflowsStudio disabled={disabled} onComplete={(workflow, job, id) => record(workflow, '', 't2i', 'image', job, id)} />
            </div>
          </div>
        </div>

        <HistoryRail
          entries={history}
          onClear={() => {
            clearHistory()
            setHistory([])
          }}
        />
      </div>
    </section>
  )
}
