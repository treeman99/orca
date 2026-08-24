// The two guide sections about views and rooms.
//
// Split out of BotGuideDialog for the file cap, and the split falls here on purpose: these
// two are the ones that describe UI you can only reach after turning something on, so they
// carry the most caveats and grow fastest.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import {
  GROUP_CHAT_HISTORY_LIMIT,
  GROUP_CHAT_MAX_MEMBERS,
  GROUP_CHAT_MAX_MESSAGES,
  GROUP_CHAT_MAX_ROUNDS
} from '../../../../../shared/bot-group-chat-types'
import { GROUP_TURN_QUIET_AFTER_MS } from '../../../../../shared/bot-group-chat-activity'
import { ChatViewFigure, GroupRoomFigure } from './bot-guide-figures'
import { Rule, Section } from './bot-guide-section'

function SubHeading({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="pt-1 font-medium text-foreground">{children}</p>
}

/** Reading a bot's session as a chat instead of a terminal. */
export function ChatViewSection(): React.JSX.Element {
  return (
    <Section
      title={translate(
        'auto.components.sidebar.bots.bot-guide-chat-sections.856a3ac497',
        '2. Where the terminal ends and the chat begins'
      )}
    >
      <ChatViewFigure
        terminalLabel={translate(
          'auto.components.sidebar.bots.bot-guide-chat-sections.b2d16f84',
          'Terminal'
        )}
        chatLabel={translate(
          'auto.components.sidebar.bots.bot-guide-chat-sections.c3e27095',
          'Chat'
        )}
        terminalLines={translate(
          'auto.components.sidebar.bots.bot-guide-chat-sections.d4f381a6',
          '> where does the retry logic live?\n⏺ Search(pattern: "retry")\n  ⎿ 12 files\n⏺ src/payment/retry.ts:41'
        ).split('\n')}
        bubbles={[
          {
            author: '',
            text: translate(
              'auto.components.sidebar.bots.bot-guide-chat-sections.e50492b7',
              'Where does the retry logic live?'
            ),
            own: true
          },
          {
            author: translate(
              'auto.components.sidebar.bots.bot-guide-chat-sections.f615a3c8',
              'analyzer'
            ),
            text: translate(
              'auto.components.sidebar.bots.bot-guide-chat-sections.0726b4d9',
              'src/payment/retry.ts:41 — withRetry()'
            ),
            own: false
          }
        ]}
        caption={translate(
          'auto.components.sidebar.bots.bot-guide-chat-sections.342658ef95',
          'One session, drawn two ways. The chat view reads back the transcript the agent wrote to disk — Orca keeps no second copy of it.'
        )}
      />
      <ul className="flex flex-col gap-1">
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.b0b56c8a59',
            'Each bot gets its own SESSION: an ordinary terminal tab running that bot’s agent. Double-click a bot in the roster (or press ↗ in its header) to open it. This is the raw agent output — and the place a failure is actually readable.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.6680296971',
            'The chat surface is a ROOM, not a per-bot window: one bubble thread over SEVERAL bots, built from what their sessions report back. Open it from Rooms at the top of the Bots lane.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.21e8296c78',
            'Why the split: giving every bot its own chat window meant three bots were three windows, none showing what the others were doing — and a hand-off that failed looked like a bot going quiet.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.0a22ac7a7b',
            'You can still switch any single tab to the chat view by hand. It is the same session either way; only the drawing changes.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.23741f6ad2',
            'Turn the view on in Settings → Experimental → “Chat UI”. This build ships it on.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.988af498e9',
            'Supported agents: claude, openclaude, codex, grok, omp, opencode. Any other agent writes a transcript Orca cannot parse, so its tab stays a terminal.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.8c13f6136d',
            '⚠️ A bot in a remote (SSH) workspace keeps its transcript on the other host, so the chat view cannot read it. Use the terminal there.'
          )}
        </Rule>
      </ul>
    </Section>
  )
}

/** Rooms: several bots taking turns over one log Orca owns. */
export function GroupRoomSection(): React.JSX.Element {
  return (
    <Section
      title={translate(
        'auto.components.sidebar.bots.bot-guide-chat-sections.8fae3c51',
        '6. Group rooms — several bots in one place'
      )}
    >
      <GroupRoomFigure
        roomName={translate(
          'auto.components.sidebar.bots.bot-guide-chat-sections.90bf4d62',
          'release check'
        )}
        memberCountLabel={translate(
          'auto.components.sidebar.bots.bot-guide-chat-sections.a1c05e74',
          '3 bots'
        )}
        faces={['🤖', '🛠️', '📋']}
        rows={[
          {
            emoji: '',
            name: translate('auto.components.sidebar.bots.bot-guide-chat-sections.b2d16f85', 'You'),
            text: translate(
              'auto.components.sidebar.bots.bot-guide-chat-sections.c3e27096',
              '@analyzer find the retry logic under src/payment'
            )
          },
          {
            emoji: '🛠️',
            name: translate(
              'auto.components.sidebar.bots.bot-guide-chat-sections.d4f381a7',
              'analyzer'
            ),
            text: translate(
              'auto.components.sidebar.bots.bot-guide-chat-sections.e50492b8',
              'src/payment/retry.ts:41. @reporter can you write it up?'
            )
          },
          {
            emoji: '📋',
            name: translate(
              'auto.components.sidebar.bots.bot-guide-chat-sections.f615a3c9',
              'reporter'
            ),
            text: '(pass)'
          }
        ]}
        turnLabel={translate(
          'auto.components.sidebar.bots.bot-guide-chat-sections.0726b4da',
          'Grep · src/payment'
        )}
        turnClock="1:04"
        turnProgress={translate(
          'auto.components.sidebar.bots.bot-guide-chat-sections.1837c5eb',
          'round 2/{{value0}} · 3/{{value1}}',
          { value0: GROUP_CHAT_MAX_ROUNDS, value1: GROUP_CHAT_MAX_MESSAGES }
        )}
        caption={translate(
          'auto.components.sidebar.bots.bot-guide-chat-sections.2948d6fc',
          'One room, one log. Members speak one at a time, and “(pass)” is how a bot says it has nothing to add.'
        )}
      />
      <ul className="flex flex-col gap-1">
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.3a59e70d',
            'Create one from the + in the “Rooms” section at the top of the Bots tab: pick 2–6 bots from the same project, then name it. Leave the name empty and the members’ names become the name.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.4b6af81e',
            'It takes at least two bots in one project, each bound to a worktree. A bot on a folder workspace cannot run an agent, so it cannot join.'
          )}
        </Rule>
      </ul>

      <SubHeading>
        {translate(
          'auto.components.sidebar.bots.bot-guide-chat-sections.5c7b092f',
          'What one message sets off'
        )}
      </SubHeading>
      <ul className="flex flex-col gap-1">
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.6d8c1a40',
            'An @handle anywhere in the sentence addresses that bot — in a room it does not have to come first. @everyone or @all is the whole room, and so is naming nobody.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.7e9d2b41',
            'A bot that @s another bot pulls it into the next round.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.8fae3c52',
            'They answer one at a time, in order — never at once. Each round the bot that leads rotates, so one voice cannot frame every round.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.90bf4d63',
            'A bot with nothing to add replies “(pass)”. When everyone passes, the room has settled and the exchange ends.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.a1c05e75',
            'Hard caps per message: {{value0}} rounds, {{value1}} replies in total, {{value2}} members in a room, and the last {{value3}} room lines carried into each turn’s prompt.',
            {
              value0: GROUP_CHAT_MAX_ROUNDS,
              value1: GROUP_CHAT_MAX_MESSAGES,
              value2: GROUP_CHAT_MAX_MEMBERS,
              value3: GROUP_CHAT_HISTORY_LIMIT
            }
          )}
        </Rule>
      </ul>

      <SubHeading>
        {translate(
          'auto.components.sidebar.bots.bot-guide-chat-sections.b2d16f86',
          'Reading a room'
        )}
      </SubHeading>
      <ul className="flex flex-col gap-1">
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.c3e27097',
            'The bar under the log is the turn in progress: the speaker’s face, a spinner, the tool it is running, a clock counting up, and how far through the round and reply budget it is.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.d4f381a8',
            'After {{value0}} seconds with no status update that bar stops moving and says there is no news yet. A stalled turn is never left animating as if it were working.',
            { value0: Math.round(GROUP_TURN_QUIET_AFTER_MS / 1000) }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.e50492b9',
            'The composer at the bottom opens a new thread; the reply box inside a thread continues that one. Only the newest thread is expanded.'
          )}
        </Rule>
      </ul>

      <SubHeading>
        {translate(
          'auto.components.sidebar.bots.bot-guide-chat-sections.f615a3ca',
          'What a room costs, and what it keeps'
        )}
      </SubHeading>
      <ul className="flex flex-col gap-1">
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.0726b4db',
            '⚠️ Every member gets its own session for that room, titled bot:<handle>@<room id> and kept apart from its 1:1 conversation. Four bots in a room means four more agent processes against your quota.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.1837c5ec',
            'Orca stores the room log, so it survives a restart. It records who said what to the room — each bot’s full reasoning still lives in that bot’s own transcript.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.bots.bot-guide-chat-sections.2948d6fd',
            'Deleting a bot keeps the room. The bot just drops out of the membership.'
          )}
        </Rule>
      </ul>
    </Section>
  )
}
