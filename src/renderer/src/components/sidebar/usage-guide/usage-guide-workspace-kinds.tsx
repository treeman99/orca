// Section 1, second part: what a workspace actually is, which depends on the project.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import { ComparisonFigure, FigureRow } from './usage-guide-figures'
import { Rule, RuleList, Subheading } from './usage-guide-section'
import { GUIDE_SAMPLE } from './usage-guide-sample-values'

export function UsageGuideWorkspaceKindsPart(): React.JSX.Element {
  const createWorktreeLabel = translate(
    'auto.components.NewWorkspaceComposerModal.createWorktree',
    'Create worktree'
  )
  const folderWorkspaceTitle = translate(
    'auto.components.sidebar.FolderWorkspaceComposerDialog.title',
    'Create Folder Workspace'
  )
  const folderWorkspaceCreateLabel = translate(
    'auto.components.sidebar.FolderWorkspaceComposerDialog.create',
    'Create workspace'
  )

  return (
    <>
      <Subheading>
        {translate(
          'auto.components.sidebar.guide.start.kindHeading',
          '깃 워크트리와 폴더 워크스페이스 — 처음 가장 헷갈리는 지점'
        )}
      </Subheading>

      <p>
        {translate(
          'auto.components.sidebar.guide.start.kindIntro',
          '워크스페이스를 만들 때 무슨 일이 벌어지는지는 프로젝트가 Git 저장소인지 아닌지에 따라 완전히 갈립니다. 창 제목부터 다릅니다.'
        )}
      </p>

      <ComparisonFigure
        leftLabel={translate(
          'auto.components.sidebar.guide.start.kindLeftLabel',
          'Git 저장소 프로젝트'
        )}
        rightLabel={translate(
          'auto.components.sidebar.guide.start.kindRightLabel',
          '폴더 프로젝트 (Git 아님)'
        )}
        left={
          <>
            <FigureRow glyph="🗂" label={createWorktreeLabel} />
            <FigureRow
              glyph="🌿"
              label={GUIDE_SAMPLE.worktreeBranch}
              detail={translate(
                'auto.components.sidebar.guide.start.kindLeftBranch',
                '{{base}} 에서 딴 새 브랜치',
                { base: GUIDE_SAMPLE.baseBranch }
              )}
            />
            <FigureRow
              glyph="📁"
              label={GUIDE_SAMPLE.worktreePath}
              detail={translate(
                'auto.components.sidebar.guide.start.kindLeftPath',
                '워크스페이스마다 별도 폴더'
              )}
            />
          </>
        }
        right={
          <>
            <FigureRow glyph="🗂" label={folderWorkspaceTitle} />
            <FigureRow
              glyph="🌿"
              label={GUIDE_SAMPLE.none}
              detail={translate(
                'auto.components.sidebar.guide.start.kindRightNoBranch',
                '브랜치를 만들지 않음'
              )}
            />
            <FigureRow
              glyph="📁"
              label={GUIDE_SAMPLE.folderPath}
              detail={translate(
                'auto.components.sidebar.guide.start.kindRightPath',
                '모든 워크스페이스가 같은 폴더'
              )}
            />
          </>
        }
        caption={translate(
          'auto.components.sidebar.guide.start.kindCaption',
          '왼쪽은 워크스페이스마다 브랜치와 폴더가 새로 생깁니다. 오른쪽은 이름표만 생기고 폴더는 하나뿐입니다.'
        )}
      />

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.start.kindRule1',
            'Git 저장소 프로젝트에서 워크스페이스를 만들면 Orca 가 git worktree add 를 실행합니다 — 새 브랜치와 새 폴더가 함께 생깁니다. 창 제목과 버튼이 {{createWorktree}} 입니다.',
            { createWorktree: createWorktreeLabel }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.start.kindRule2',
            '어느 브랜치에서 딸지는 {{createFrom}} 칸에서 고릅니다. {{reuse}} 를 켜면 새 브랜치를 만들지 않고 이미 있는 브랜치를 그대로 체크아웃합니다.',
            {
              createFrom: translate(
                'auto.components.NewWorkspaceComposerCard.ac3748dcda',
                "Name or 'Create From'"
              ),
              reuse: translate(
                'auto.components.NewWorkspaceComposerCard.reuseExistingBranch',
                'Reuse branch'
              )
            }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.start.kindRule3',
            '폴더 프로젝트에서는 창 제목이 {{folderTitle}}, 버튼이 {{folderCreate}} 이고 브랜치도 새 폴더도 만들지 않습니다.',
            { folderTitle: folderWorkspaceTitle, folderCreate: folderWorkspaceCreateLabel }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.start.kindRule4',
            '그래서 한 폴더 프로젝트의 워크스페이스는 전부 프로젝트 폴더 그 자체를 가리킵니다. 파일이 격리되지 않으므로, 두 워크스페이스에서 같은 파일을 동시에 고치면 서로의 편집이 그대로 겹칩니다.'
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.start.kindRule5',
            '병렬로 여러 작업을 돌릴 생각이면 Git 저장소로 등록하십시오. 격리는 워크트리가 주는 것이지 워크스페이스라는 이름이 주는 것이 아닙니다.'
          )}
        </Rule>
      </RuleList>
    </>
  )
}
