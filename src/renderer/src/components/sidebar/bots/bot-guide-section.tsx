// Shared layout for the bot guide's sections.
//
// Extracted so the dialog and the section files agree on the shape without importing each
// other — the copy lives beside the section it belongs to, the frame lives here once.

import type React from 'react'

export function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="flex flex-col gap-2 text-[12px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

export function Rule({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <li className="ml-4 list-disc marker:text-muted-foreground/60">{children}</li>
}
