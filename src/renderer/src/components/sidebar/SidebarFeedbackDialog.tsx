/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: feedback viewer details are loaded through GitHub IPC after the dialog receives the issue URL. */
import React, { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useMountedRef } from '@/hooks/useMountedRef'
import { cn } from '@/lib/utils'
import type { GitHubViewer } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import {
  extractImageFilesFromDataTransfer,
  hasAttachableFeedbackImage,
  readFeedbackImageFiles,
  releaseFeedbackImageDraft,
  type FeedbackImageDraft
} from '@/lib/feedback-image-attachments'
import { SidebarFeedbackImageAttachments } from './SidebarFeedbackImageAttachments'
import { SidebarFeedbackContactCard } from './SidebarFeedbackContactCard'
import { useFeedbackImageDrop } from './use-feedback-image-drop'

type SubmitIdentity = {
  githubLogin: string | null
  githubEmail: string | null
}

type SidebarFeedbackDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getSubmitIdentity(viewer: GitHubViewer | null, anonymous: boolean): SubmitIdentity {
  if (anonymous || !viewer) {
    return {
      githubLogin: null,
      githubEmail: null
    }
  }

  return {
    githubLogin: viewer.login,
    githubEmail: viewer.email
  }
}

export function SidebarFeedbackDialog({
  open,
  onOpenChange
}: SidebarFeedbackDialogProps): React.JSX.Element {
  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [viewer, setViewer] = useState<GitHubViewer | null>(null)
  const [isViewerLoading, setIsViewerLoading] = useState(false)
  const [submitAnonymously, setSubmitAnonymously] = useState(false)
  const [images, setImages] = useState<FeedbackImageDraft[]>([])
  const [pendingImageReadCount, setPendingImageReadCount] = useState(0)
  const mountedRef = useMountedRef()
  const feedbackTextareaRef = useRef<HTMLTextAreaElement>(null)
  const liveImageDraftsRef = useRef<FeedbackImageDraft[]>([])

  const clearImages = React.useCallback(() => {
    liveImageDraftsRef.current.forEach(releaseFeedbackImageDraft)
    liveImageDraftsRef.current = []
    setImages([])
  }, [])

  // Why: object URLs for the thumbnails leak until revoked, so drop them when
  // the dialog unmounts as well as when an attachment is removed.
  React.useEffect(
    () => () => {
      liveImageDraftsRef.current.forEach(releaseFeedbackImageDraft)
      liveImageDraftsRef.current = []
    },
    []
  )

  const imageCount = images.length

  // Why: committed state lags the in-flight reads, so batches still being read
  // count against capacity — otherwise two quick pastes both see room for four.
  const pendingImageReadsRef = useRef(0)

  const handleAddFiles = React.useCallback(
    (files: readonly File[]) => {
      if (files.length === 0) {
        return
      }
      if (isSubmitting) {
        toast.warning(
          translate(
            'auto.components.sidebar.SidebarFeedbackDialog.attachWhileSending',
            'Wait for the current feedback to finish sending before attaching more images.'
          )
        )
        return
      }
      // Why: read the committed count from the closure rather than a ref. A ref
      // synced in an effect can still be stale-low right after an add, which
      // over-accepts and gets the whole submission rejected by the main process.
      const existingCount = imageCount + pendingImageReadsRef.current
      pendingImageReadsRef.current += files.length
      setPendingImageReadCount((current) => current + files.length)
      void readFeedbackImageFiles(files, existingCount).then(
        ({ images: added, errors }) => {
          pendingImageReadsRef.current -= files.length
          if (!mountedRef.current) {
            added.forEach(releaseFeedbackImageDraft)
            return
          }
          setPendingImageReadCount((current) => Math.max(0, current - files.length))
          if (added.length > 0) {
            liveImageDraftsRef.current = [...liveImageDraftsRef.current, ...added]
            setImages((existing) => [...existing, ...added])
          }
          // Why: never drop an attachment without telling the user — that
          // silence is what made screenshots vanish in the first place.
          errors.forEach((error) => toast.warning(error))
        },
        (error: unknown) => {
          pendingImageReadsRef.current -= files.length
          console.error('Failed to read feedback image attachments:', error)
          if (mountedRef.current) {
            setPendingImageReadCount((current) => Math.max(0, current - files.length))
            toast.error(
              translate(
                'auto.components.sidebar.SidebarFeedbackDialog.imageReadFailed',
                'Could not read the attached images. Try attaching them again.'
              )
            )
          }
        }
      )
    },
    [imageCount, isSubmitting, mountedRef]
  )

  const handleRemoveImage = React.useCallback((id: string) => {
    const removed = liveImageDraftsRef.current.find((image) => image.id === id)
    if (removed) {
      releaseFeedbackImageDraft(removed)
      liveImageDraftsRef.current = liveImageDraftsRef.current.filter((image) => image.id !== id)
    }
    setImages((current) => current.filter((image) => image.id !== id))
  }, [])

  const { isDragActive, contentRef, dragHandlers } = useFeedbackImageDrop(open, handleAddFiles)

  React.useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false
    setIsViewerLoading(true)
    void window.api.gh
      .viewer()
      .then((nextViewer) => {
        if (!cancelled) {
          setViewer(nextViewer)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setViewer(null)
          console.error('Failed to load GitHub viewer:', err)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsViewerLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open])

  const handleSubmit = async (): Promise<void> => {
    if (isSubmitting || pendingImageReadsRef.current > 0) {
      return
    }
    const trimmed = feedback.trim()
    if (!trimmed) {
      toast.warning(
        translate(
          'auto.components.sidebar.SidebarFeedbackDialog.a2fd890d9e',
          'Please enter feedback before submitting.'
        )
      )
      return
    }

    setIsSubmitting(true)
    try {
      const identity = getSubmitIdentity(viewer, submitAnonymously)
      // Why: submission is proxied through the main process via IPC because
      // the packaged Mac build loads the renderer from file://, which makes
      // cross-origin fetch() fail CORS preflight. Electron's net module in
      // the main process has no CORS restrictions and works uniformly in dev
      // and prod.
      const result = await window.api.feedback.submit({
        feedback: trimmed,
        submitAnonymously,
        githubLogin: identity.githubLogin,
        githubEmail: identity.githubEmail,
        images: images.map((image) => ({
          contentType: image.contentType,
          data: image.data
        }))
      })

      if (!result.ok) {
        throw new Error(result.error)
      }

      if (mountedRef.current) {
        // Why: the text reached us but the screenshots did not, so say that
        // plainly instead of a blanket success the user would misread.
        if (result.imagesDelivered === false) {
          toast.warning(
            translate(
              'auto.components.sidebar.SidebarFeedbackDialog.imagesNotDelivered',
              'Feedback sent, but image delivery could not be confirmed.'
            )
          )
        } else {
          toast.success(
            translate(
              'auto.components.sidebar.SidebarFeedbackDialog.7a46c228b8',
              'Thanks for the feedback.'
            )
          )
        }
        setFeedback('')
        setSubmitAnonymously(false)
        clearImages()
        onOpenChange(false)
      }
    } catch (err) {
      if (mountedRef.current) {
        // Why: a permanent refusal (e.g. an administrator policy) is otherwise
        // indistinguishable from a transient network failure, so the user retypes.
        toast.error(
          translate(
            'auto.components.sidebar.SidebarFeedbackDialog.60b721e857',
            'Failed to submit feedback. Please try again.'
          ),
          { description: err instanceof Error && err.message ? err.message : undefined }
        )
      }
      console.error('Failed to submit feedback:', err)
    } finally {
      if (mountedRef.current) {
        setIsSubmitting(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        className="max-h-[calc(100vh-3rem)] overflow-y-auto scrollbar-sleek sm:max-w-lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          feedbackTextareaRef.current?.focus()
        }}
        // Why: paste is bound on the dialog rather than the textarea so a
        // screenshot lands whether or not the caret is in the message box.
        onPaste={(event) => {
          const pasted = extractImageFilesFromDataTransfer(event.clipboardData)
          if (pasted.length === 0) {
            return
          }
          // Why: consume the paste only when something is actually attachable.
          // An unsupported image still routes through for its rejection toast,
          // but preventing default there would silently eat co-pasted text.
          if (hasAttachableFeedbackImage(pasted, imageCount + pendingImageReadsRef.current)) {
            event.preventDefault()
          }
          handleAddFiles(pasted)
        }}
        // Why: dragenter/leave fire per nested child; the hook counts depth so
        // the highlight only clears once the pointer leaves the dialog.
        {...dragHandlers}
      >
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate('auto.components.sidebar.SidebarFeedbackDialog.0eb643f07f', 'Send Feedback')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'auto.components.sidebar.SidebarFeedbackDialog.a828fa4aee',
              "Share what's working, what's broken, or what Orca should do next."
            )}
          </DialogDescription>
        </DialogHeader>

        <SidebarFeedbackContactCard />

        <textarea
          ref={feedbackTextareaRef}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder={translate(
            'auto.components.sidebar.SidebarFeedbackDialog.d46ddd66fc',
            'What could we improve?'
          )}
          rows={7}
          className="min-h-32 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />

        <SidebarFeedbackImageAttachments
          images={images}
          disabled={isSubmitting}
          isDragActive={isDragActive}
          onAddFiles={handleAddFiles}
          onRemove={handleRemoveImage}
        />

        <div className="min-h-9 rounded-md border border-border/70 bg-muted/30 px-3 py-2">
          {viewer ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                {translate('auto.components.sidebar.SidebarFeedbackDialog.c9e5ea0791', 'GitHub:')}{' '}
                <span className="font-mono text-foreground">
                  {viewer.login}
                  {viewer.email ? ` (${viewer.email})` : ''}
                </span>
              </span>
              <label className="flex cursor-pointer items-center gap-2 text-foreground">
                <input
                  type="checkbox"
                  checked={submitAnonymously}
                  onChange={(event) => setSubmitAnonymously(event.target.checked)}
                  className={cn(
                    'size-3.5 rounded border border-border bg-background align-middle',
                    'accent-foreground'
                  )}
                />
                {translate(
                  'auto.components.sidebar.SidebarFeedbackDialog.5b120b9634',
                  'Submit anonymously'
                )}
              </label>
            </div>
          ) : isViewerLoading ? (
            <div className="text-xs text-muted-foreground">
              {translate(
                'auto.components.sidebar.SidebarFeedbackDialog.d20439c560',
                'Checking GitHub identity…'
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {translate(
                'auto.components.sidebar.SidebarFeedbackDialog.8de03e23c5',
                'Submit with your typed feedback only, or connect `gh` to include GitHub identity.'
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {translate('auto.components.sidebar.SidebarFeedbackDialog.8bf619e4cf', 'Cancel')}
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || pendingImageReadCount > 0 || !feedback.trim()}
          >
            {isSubmitting
              ? translate('auto.components.sidebar.SidebarFeedbackDialog.69969ba364', 'Sending…')
              : translate('auto.components.sidebar.SidebarFeedbackDialog.f2e42e1307', 'Send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
