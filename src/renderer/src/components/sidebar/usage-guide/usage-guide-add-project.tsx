// Section 1, first part: getting a project into the sidebar.

import type React from 'react'
import { translate } from '@/i18n/i18n'
import { AppWindowFigure, FigureRow } from './usage-guide-figures'
import { Rule, RuleList, Subheading } from './usage-guide-section'
import { GUIDE_SAMPLE, SIDEBAR_PROJECTS_TITLE } from './usage-guide-sample-values'

export function UsageGuideAddProjectPart(): React.JSX.Element {
  const addProjectLabel = translate(
    'auto.components.sidebar.SidebarHeader.25a95899c9',
    'Add Project'
  )

  return (
    <>
      <p>
        {translate(
          'auto.components.sidebar.guide.start.intro',
          'Orca 는 프로젝트를 등록해 두고, 그 안에 작업 단위인 워크스페이스를 만들어 쓰는 앱입니다. 프로젝트를 하나 추가하고 워크스페이스를 하나 만들면 준비가 끝납니다.'
        )}
      </p>

      <Subheading>
        {translate('auto.components.sidebar.guide.start.addHeading', '프로젝트 추가하기')}
      </Subheading>

      <AppWindowFigure
        sidebarTitle={SIDEBAR_PROJECTS_TITLE}
        sidebarActions={['⊞', '＋']}
        sidebar={
          <>
            <FigureRow glyph="▾" label={GUIDE_SAMPLE.project} detail={GUIDE_SAMPLE.projectPath} />
            <FigureRow
              glyph="•"
              label={GUIDE_SAMPLE.worktreeName}
              detail={GUIDE_SAMPLE.worktreeBranch}
              active
            />
          </>
        }
        bodyTitle={translate(
          'auto.components.sidebar.AddRepoStartSteps.d13757911c',
          'Add a project'
        )}
        body={
          <>
            <FigureRow
              glyph="📂"
              label={translate(
                'auto.components.sidebar.add.repo.local.start.actions.2281fdc8c7',
                'Browse folder'
              )}
              detail={translate(
                'auto.components.sidebar.add.repo.local.start.actions.fb4fc5380e',
                'Local project, Git repo, or folder with many repos'
              )}
              trailing="⏎"
            />
            <FigureRow
              glyph="🌐"
              label={translate(
                'auto.components.sidebar.add.repo.local.start.actions.7edb8ebe24',
                'Clone from URL'
              )}
              detail={translate(
                'auto.components.sidebar.add.repo.local.start.actions.5f9ffac036',
                'Clone a remote Git repository'
              )}
            />
            <FigureRow
              glyph="🖥"
              label={translate(
                'auto.components.sidebar.add.repo.local.start.actions.3d162cc76f',
                'Project on SSH host'
              )}
              detail={translate(
                'auto.components.sidebar.add.repo.local.start.actions.a6c20dca96',
                'Open a project folder from an SSH host'
              )}
            />
            <FigureRow
              glyph="＋"
              label={translate(
                'auto.components.sidebar.add.repo.local.start.actions.c709860596',
                'Create new project'
              )}
              detail={translate(
                'auto.components.sidebar.add.repo.local.start.actions.d72789705e',
                'Start from an empty folder'
              )}
            />
          </>
        }
        caption={translate(
          'auto.components.sidebar.guide.start.addCaption',
          '사이드바 맨 위 줄 오른쪽의 폴더＋ 버튼이 프로젝트 추가입니다. 그 옆 ＋ 버튼은 워크스페이스 만들기라 하는 일이 다릅니다.'
        )}
      />

      <RuleList>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.start.addRule1',
            '사이드바 맨 위 줄 오른쪽의 폴더＋ 버튼(툴팁 {{addProject}})을 누르면 {{dialog}} 창이 열립니다.',
            {
              addProject: addProjectLabel,
              dialog: translate(
                'auto.components.sidebar.AddRepoStartSteps.d13757911c',
                'Add a project'
              )
            }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.start.addRule2',
            '가장 흔한 길은 맨 위의 {{browse}} 입니다. 이미 컴퓨터에 있는 Git 저장소든, Git 이 아닌 그냥 폴더든, 저장소를 여러 개 담고 있는 상위 폴더든 이 하나로 등록합니다.',
            {
              browse: translate(
                'auto.components.sidebar.add.repo.local.start.actions.2281fdc8c7',
                'Browse folder'
              )
            }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.start.addRule3',
            '나머지 세 가지는 그 아래 {{other}} 묶음에 있습니다 — 원격 저장소를 새로 받아오는 {{clone}}, SSH 로 접속한 서버의 폴더를 여는 {{ssh}}, 빈 폴더에서 시작하는 {{create}}.',
            {
              other: translate(
                'auto.components.sidebar.AddRepoStartSteps.87596c1446',
                'Other ways to add'
              ),
              clone: translate(
                'auto.components.sidebar.add.repo.local.start.actions.7edb8ebe24',
                'Clone from URL'
              ),
              ssh: translate(
                'auto.components.sidebar.add.repo.local.start.actions.3d162cc76f',
                'Project on SSH host'
              ),
              create: translate(
                'auto.components.sidebar.add.repo.local.start.actions.c709860596',
                'Create new project'
              )
            }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.start.addRule4',
            '고른 폴더가 Git 저장소가 아니면 확인 창이 한 번 뜹니다: “{{notice}}” — {{openAsFolder}} 를 누르면 폴더 프로젝트로 등록됩니다.',
            {
              notice: translate(
                'auto.components.sidebar.NonGitFolderDialog.8fba4b8cbb',
                "This folder isn't a Git repository. You'll have the editor, terminal, and search, but Git-based features won't be available."
              ),
              openAsFolder: translate(
                'auto.components.sidebar.NonGitFolderDialog.e52454b7f6',
                'Open as Folder'
              )
            }
          )}
        </Rule>
        <Rule>
          {translate(
            'auto.components.sidebar.guide.start.addRule5',
            '관리자 정책이 걸린 설치본에서는 위 항목 중 일부가 아예 보이지 않을 수 있습니다. 안 보이면 없는 기능이 아니라 꺼 둔 기능입니다.'
          )}
        </Rule>
      </RuleList>
    </>
  )
}
