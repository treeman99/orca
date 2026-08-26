// Shared layout for the guide's sections.
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
    <div className="flex flex-col gap-2 text-[12px] leading-relaxed text-muted-foreground">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  )
}

export function Subheading({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="pt-1 text-[12px] font-medium text-foreground">{children}</p>
}

export function RuleList({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <ul className="flex flex-col gap-1">{children}</ul>
}

export function Rule({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <li className="ml-4 list-disc marker:text-muted-foreground/60">{children}</li>
}
