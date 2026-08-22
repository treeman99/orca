// The bot manual, opened from the sidebar's ? menu.
//
// Written in the app rather than linked out: this fork's bots do not exist upstream, so
// onorca.dev has nothing to say about them, and a locked fleet may not reach an external doc
// anyway. The two sections that earn the most space are the ones people get wrong — how one
// bot finds another, and how to address one on purpose.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DiscoveryFigure, HandoffFigure, RosterFigure } from './bot-guide-figures'

export type BotGuideDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function Section({
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

function Rule({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <li className="ml-4 list-disc marker:text-muted-foreground/60">{children}</li>
}

export function BotGuideDialog({ open, onOpenChange }: BotGuideDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.sidebar.bots.BotGuideDialog.title', 'Using bots')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.bots.BotGuideDialog.subtitle',
              'A bot is a named agent bound to one project. It has a conversation you can talk to, routines that run on a schedule, and teammates it can hand work to.'
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="flex flex-col gap-6 pb-2">
            <Section
              title={translate('auto.components.sidebar.bots.BotGuideDialog.s1', '1. The roster')}
            >
              <RosterFigure
                sessionsLabel={translate(
                  'auto.components.sidebar.bots.BotGuideDialog.figSessions',
                  'Sessions'
                )}
                botsLabel={translate('auto.components.sidebar.bots.BotGuideDialog.figBots', 'Bots')}
                projectName={translate(
                  'auto.components.sidebar.bots.BotGuideDialog.figProject',
                  'my-project'
                )}
                rows={[
                  {
                    emoji: '🤖',
                    name: translate(
                      'auto.components.sidebar.bots.BotGuideDialog.figBot1',
                      'coordinator'
                    ),
                    role: translate(
                      'auto.components.sidebar.bots.BotGuideDialog.figRole1',
                      'Plans and delegates'
                    ),
                    mark: '⏳'
                  },
                  {
                    emoji: '🛠️',
                    name: translate(
                      'auto.components.sidebar.bots.BotGuideDialog.figBot2',
                      'analyzer'
                    ),
                    role: translate(
                      'auto.components.sidebar.bots.BotGuideDialog.figRole2',
                      'Reads the code'
                    ),
                    mark: '◐'
                  },
                  {
                    emoji: '📋',
                    name: translate(
                      'auto.components.sidebar.bots.BotGuideDialog.figBot3',
                      'reporter'
                    ),
                    role: translate(
                      'auto.components.sidebar.bots.BotGuideDialog.figRole3',
                      'Writes it up'
                    ),
                    mark: ''
                  }
                ]}
                caption={translate(
                  'auto.components.sidebar.bots.BotGuideDialog.rosterCaption',
                  'Bots are grouped by project. ◐ means the bot is working; ⏳ means it finished its turn and is waiting on a teammate it handed work to.'
                )}
              />
              <ul className="flex flex-col gap-1">
                <Rule>
                  {translate(
                    'auto.components.sidebar.bots.BotGuideDialog.r1a',
                    'Click a bot (or the ⚙ on its row) for its own screen: routines, settings, and the message box.'
                  )}
                </Rule>
                <Rule>
                  {translate(
                    'auto.components.sidebar.bots.BotGuideDialog.r1b',
                    'Double-click to switch the main area to that bot’s agent session. If it has none, one starts first.'
                  )}
                </Rule>
                <Rule>
                  {translate(
                    'auto.components.sidebar.bots.BotGuideDialog.r1c',
                    'A dot on a bot means another bot messaged it while you were elsewhere.'
                  )}
                </Rule>
              </ul>
            </Section>

            <Section
              title={translate(
                'auto.components.sidebar.bots.BotGuideDialog.s2',
                '2. Role and description are instructions, not labels'
              )}
            >
              <p>
                {translate(
                  'auto.components.sidebar.bots.BotGuideDialog.p2',
                  'Whatever you write in a bot’s description is delivered to its agent as standing instructions — on every turn, on work a teammate hands it, and on scheduled runs. This is where scope belongs:'
                )}
              </p>
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2.5 font-mono text-[11px] whitespace-pre-wrap text-foreground">
                {translate(
                  'auto.components.sidebar.bots.BotGuideDialog.descExample',
                  'Search only inside this repository. Do not use open web search.\nWhen asked about a feature, read README and docs/ first, then answer with file paths.'
                )}
              </pre>
              <p>
                {translate(
                  'auto.components.sidebar.bots.BotGuideDialog.p2b',
                  'A routine bakes the role in when you create it, so editing the description later does not rewrite routines that already exist — change those on the Automations page.'
                )}
              </p>
            </Section>

            <Section
              title={translate(
                'auto.components.sidebar.bots.BotGuideDialog.s3',
                '3. How one bot finds another'
              )}
            >
              <DiscoveryFigure
                tabs={['Claude Code', 'bot:coordinator', 'bot:analyzer']}
                activeTab={1}
                caption={translate(
                  'auto.components.sidebar.bots.BotGuideDialog.discoveryCaption',
                  'Every bot conversation runs in a terminal titled bot:<handle>. That title is the whole addressing scheme.'
                )}
              />
              <ul className="flex flex-col gap-1">
                <Rule>
                  {translate(
                    'auto.components.sidebar.bots.BotGuideDialog.r3a',
                    'Teammates are bots in the SAME project that have a workspace. Delegation never crosses projects.'
                  )}
                </Rule>
                <Rule>
                  {translate(
                    'auto.components.sidebar.bots.BotGuideDialog.r3b',
                    'The handle comes from the name: lowercase, spaces become hyphens, Hangul is kept. “릴리스 점검” → @릴리스-점검. Rename the bot and the handle follows.'
                  )}
                </Rule>
                <Rule>
                  {translate(
                    'auto.components.sidebar.bots.BotGuideDialog.r3c',
                    'When you message a bot, Orca first starts every same-project teammate that has no session yet (up to 6), so the roster is real before the bot looks at it.'
                  )}
                </Rule>
                <Rule>
                  {translate(
                    'auto.components.sidebar.bots.BotGuideDialog.r3d',
                    'The bot then finds teammates with orca terminal list and writes to one with orca terminal send. If one is somehow missing it can start it with orca terminal create --title "bot:<handle>" --background.'
                  )}
                </Rule>
                <Rule>
                  {translate(
                    'auto.components.sidebar.bots.BotGuideDialog.r3e',
                    'A bot with no teammates in its project is told nothing about delegation — it will just do the work.'
                  )}
                </Rule>
              </ul>
            </Section>

            <Section
              title={translate(
                'auto.components.sidebar.bots.BotGuideDialog.s4',
                '4. Addressing another bot on purpose'
              )}
            >
              <HandoffFigure
                senderLabel={translate(
                  'auto.components.sidebar.bots.BotGuideDialog.figSender',
                  'coordinator · chat'
                )}
                receiverLabel={translate(
                  'auto.components.sidebar.bots.BotGuideDialog.figReceiver',
                  'what analyzer receives'
                )}
                mention="@analyzer"
                body={translate(
                  'auto.components.sidebar.bots.BotGuideDialog.figBody',
                  'Find where the retry logic lives under src/payment'
                )}
                attribution="Message from 🤖 coordinator (@coordinator):"
                caption={translate(
                  'auto.components.sidebar.bots.BotGuideDialog.handoffCaption',
                  'A mention at the START of the message routes it. The recipient sees who sent it.'
                )}
              />
              <ul className="flex flex-col gap-1">
                <Rule>
                  {translate(
                    'auto.components.sidebar.bots.BotGuideDialog.r4a',
                    'Only a mention at the very beginning routes. “@analyzer 이거 봐줘” goes to analyzer; “이건 @analyzer 한테 물어봐” stays with the bot you are talking to.'
                  )}
                </Rule>
                <Rule>
                  {translate(
                    'auto.components.sidebar.bots.BotGuideDialog.r4b',
                    'An unknown handle is not sent — you get told instead, so a typo never disappears into a conversation.'
                  )}
                </Rule>
                <Rule>
                  {translate(
                    'auto.components.sidebar.bots.BotGuideDialog.r4c',
                    'This is the reliable way to hand work over. A coordinator bot delegating on its own is a judgement it makes, not something Orca enforces.'
                  )}
                </Rule>
              </ul>

              <p className="pt-1 font-medium text-foreground">
                {translate(
                  'auto.components.sidebar.bots.BotGuideDialog.promptHeading',
                  'Writing the prompt'
                )}
              </p>
              <p>
                {translate(
                  'auto.components.sidebar.bots.BotGuideDialog.p4',
                  'The recipient does not see your conversation — only the text after the mention, with your bot named as the sender. So write it as a standalone request: say what you want, where to look, and what to send back.'
                )}
              </p>
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2.5 font-mono text-[11px] whitespace-pre-wrap text-foreground">
                {translate(
                  'auto.components.sidebar.bots.BotGuideDialog.promptGood',
                  '@analyzer src/payment 아래에서 재시도 로직이 구현된 파일과 함수를 찾아줘.\n찾으면 파일 경로와 함수명만 정리해서 @리포터 에게 넘겨줘.'
                )}
              </pre>
              <p>
                {translate(
                  'auto.components.sidebar.bots.BotGuideDialog.p4bad',
                  'What does not work: “아까 그거 분석해줘” — the other bot has no “아까”. Nor does a mention buried mid-sentence, or one addressed to a bot in another project.'
                )}
              </p>
              <p>
                {translate(
                  'auto.components.sidebar.bots.BotGuideDialog.p4chain',
                  'To make a coordinator delegate every time rather than doing the work itself, put the rule in its description: “분석은 반드시 @analyzer 에게, 리포트는 @리포터 에게 넘겨라. 직접 하지 마라.”'
                )}
              </p>
            </Section>

            <Section
              title={translate(
                'auto.components.sidebar.bots.BotGuideDialog.s5',
                '5. What to expect, honestly'
              )}
            >
              <ul className="flex flex-col gap-1">
                <Rule>
                  {translate(
                    'auto.components.sidebar.bots.BotGuideDialog.r5a',
                    'A bot is not always on. It runs when you message it or when a routine fires, and a restart can end its conversation — the sidebar log is for this session only.'
                  )}
                </Rule>
                <Rule>
                  {translate(
                    'auto.components.sidebar.bots.BotGuideDialog.r5b',
                    'The full conversation lives in the bot’s own agent session. Use ↗ in the bot’s header to open it; the sidebar shows only what Orca routed plus the latest reply.'
                  )}
                </Rule>
                <Rule>
                  {translate(
                    'auto.components.sidebar.bots.BotGuideDialog.r5c',
                    'Each teammate Orca starts is a real agent process against your quota. Six is the cap for one message.'
                  )}
                </Rule>
                <Rule>
                  {translate(
                    'auto.components.sidebar.bots.BotGuideDialog.r5d',
                    'Scheduled runs can be turned off fleet-wide by your administrator. Existing routines stay listed but do not start.'
                  )}
                </Rule>
              </ul>
            </Section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export default BotGuideDialog
