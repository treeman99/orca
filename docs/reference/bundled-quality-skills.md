# 번들 품질 스킬

이 포크는 Orca 자체 스킬 8종 외에 **엔지니어링 규율 스킬 5종을 함께 번들**한다. 오케스트레이션
가이드가 워커 spec에 이름으로 주입하는 스킬들이고, 폐쇄망에서도 `npx`·GitHub·플러그인
마켓플레이스 없이 설치된다.

| 스킬 | 출처 | 라이선스 | 역할 |
| --- | --- | --- | --- |
| `verification-before-completion` | obra/superpowers | MIT | 완료를 주장하기 전에 검증 명령을 돌리고 출력을 읽게 한다 |
| `test-driven-development` | obra/superpowers | MIT | RED-GREEN-REFACTOR를 강제한다 |
| `systematic-debugging` | obra/superpowers | MIT | 증상 땜질 대신 근본원인까지 추적하게 한다 |
| `karpathy-guidelines` | multica-ai/andrej-karpathy-skills | MIT | 과설계·범위이탈을 억제한다 |
| `claude-md-improver` | Anthropic `claude-md-management` | Apache-2.0 | 프로젝트 메모리(CLAUDE.md) 품질을 심사한다 |

각 스킬의 `skill-guides/<name>.md` 끝에 `## 출처와 라이선스` 절이 있고, 상류 커밋·저작권·번들하며
가한 수정이 거기에 전부 적혀 있다. 라이선스 전문은 `skills/<name>/LICENSE`로 함께 설치된다.

## 네트워크 접근이 없다는 것은 게이트다

이 스킬들이 사내 배포판에 들어갈 수 있는 유일한 근거가 "밖으로 나가지 않는다"이므로, 문서의
주장이 아니라 **테스트**로 고정했다. `config/scripts/bundled-quality-skills.test.mjs`가
`skills/<name>/**`의 모든 파일에서 아래를 금지한다.

`https?://` · `WebFetch` · `WebSearch` · `mcp__` · `curl` · `wget` · `uvx` · `npx ` ·
`pip install` · `npm install`

예외는 두 가지뿐이고 둘 다 테스트에 명시되어 있다.

- `LICENSE` 파일 — 상류 라이선스 본문이 자기 정본 URL을 인용한다. 조회가 아니라 출처 표기다.
- `claude-md-improver/SKILL.md`의 `npm install` — CLAUDE.md에 써 넣을 Quick Start **예시 블록**
  안의 문자열이다. 실행하는 코드가 아니다.

`npm test` / `pnpm test`는 금지 목록에 없다. 사용자 저장소의 테스트를 돌릴 뿐 아무것도 받아오지
않는다. `systematic-debugging`의 `find-polluter.sh`가 그 경우다.

## 번들 파이프라인

세 지점을 모두 거쳐야 실제로 배포된다.

1. **소스** — `skill-guides/<name>.md`. `skills/<name>/SKILL.md`는 **생성물**이므로 직접 고치지
   말 것. 참조 문서(`writing-good-tests.md`, `references/*.md` 등)와 `LICENSE`는 손으로 쓴
   파일이고 `skills/<name>/` 아래에 그대로 둔다.
2. **등록** — `config/scripts/generate-bundled-skill-guides.mjs`의 `CANONICAL_GUIDE_NAMES`와
   `GUIDE_ALIASES`. 이 5종은 **`STUB_TOPICS`에 넣지 않는다.** 스텁은 "`orca skills get`으로
   본문을 받아라"라고 말하는 포인터인데, 이 스킬들은 Codex·Gemini·OpenCode 워커에게도 건네지고
   그쪽에는 Orca CLI가 있다는 보장이 없다. 설치되는 바이트가 곧 스킬이어야 한다.
3. **생성** — 아래 두 개를 순서대로 돌린다. `pnpm lint`가 `verify:*`로 최신 여부를 검사한다.

```bash
pnpm generate:bundled-skill-guides
pnpm generate:skill-bundle-manifest
```

패키징은 `config/electron-builder.config.cjs`가 `skills/` → `Resources/skills/packages`로
복사한다. 새 스킬 디렉터리는 자동으로 실린다.

### 실행 파일은 실을 수 없다

`generate-skill-bundle-manifest.mjs`가 실행 비트가 선 파일을 거부한다
(`Executable file is not allowed in a shipped skill`). `find-polluter.sh`는 그래서 644로 싣고
호출 표기를 `bash find-polluter.sh`로 바꿨다.

### `skills/` 아래 `.ts` 파일은 피할 것

`skills/`는 oxlint의 `ignorePatterns`에 없다. 벤더 코드가 리포 린트 게이트를 흔들지 않도록
`systematic-debugging`의 예제 `.ts`는 `.md` 안의 코드펜스로 옮겼다.

## 자동 설치

`src/main/skills/bundled-skill-auto-install.ts`가 앱 시작 시 이 머신의 에이전트 스킬 홈과
번들 내용을 대조한다. `src/main/index.ts`에서 스킬 트랜잭션 복구 직후에 fire-and-forget으로
호출된다.

**대상 디렉터리**는 공유 루트 `~/.agents/skills`(항상) + 홈이 이미 존재하는 에이전트뿐이다.
존재 판정은 `~/.claude/skills`가 아니라 부모인 `~/.claude`로 한다 — 스킬 디렉터리는 첫 스킬이
놓여야 생기므로, 그걸 조건으로 삼으면 첫 스킬이 영원히 안 들어간다.

**판정 규칙** (`decidePlacement`):

| 놓인 사본 | 결정 |
| --- | --- |
| 없음 | 설치 |
| 트리 해시 = 번들 해시 | 이미 최신, 아무것도 안 함 |
| 트리 해시 = 업데이터 락에 기록된 해시(`source: "orca-bundled"`) | 우리가 쓴 것이고 손대지 않았으므로 갱신 |
| 그 외 전부 | **손대지 않는다** (`kept-user-copy`) |

마지막 줄이 핵심이다. 사용자가 고친 스킬도, `npx skills add`로 들어온 사본도 여기 해당한다.
번들 스킬이 낡은 채 남는 것이 남의 편집을 조용히 지우는 것보다 훨씬 작은 문제다.

**패키징된 빌드에서만 동작한다.** 개발 체크아웃은 개발자가 실제로 설치해 쓰는 Orca와 같은
머신을 공유하므로, 릴리스되지 않은 트리로 `~/.claude/skills`를 덮으면 쓰던 스킬이 발밑에서
바뀐다. 개발 중에는 `orca skills install`을 직접 쓴다.

정책 스위치는 두지 않았다. 사내 배포판이 이 스킬을 놓는 것은 배포의 목적 자체이고,
`orca skills` CLI와 Settings UI로 언제든 지우거나 되돌릴 수 있다.

## 상류 스킬과의 중복

사용자가 superpowers 플러그인을 따로 설치하면 같은 이름의 스킬이 두 벌 존재할 수 있다.
플러그인은 `~/.claude/plugins/` 아래, 이쪽은 `~/.claude/skills/` 아래이므로 파일 충돌은 없지만
설명이 중복되어 보인다. 사내 배포판만 쓰는 머신에서는 발생하지 않는다.

## 재벤더링 절차

상류가 스킬을 고쳐 그것을 따라갈 때:

1. 상류 파일을 받아 `skill-guides/<name>.md`의 `## 출처와 라이선스` **위쪽 본문만** 교체한다.
2. 각주의 커밋 해시를 갱신하고, 가한 수정이 바뀌었으면 그것도 고쳐 적는다.
3. 참조 문서를 `skills/<name>/`에 갱신한다. 실행 비트와 `.ts` 확장자 제약을 다시 확인한다.
4. `pnpm generate:bundled-skill-guides && pnpm generate:skill-bundle-manifest`
5. `pnpm test config/scripts/bundled-quality-skills.test.mjs` — 네트워크 게이트가 여기서 잡는다.
