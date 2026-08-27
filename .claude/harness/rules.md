# 프로젝트 규칙 원장

`orca skills get orchestration`의 **Project Rule Ledger** 프로토콜이 읽는 파일이다. 코디네이터가
태스크마다 `scope`가 맞는 블록만 골라(최대 5개) `--spec`에 `[PROJECT RULES]`로 주입한다.

여기에는 **자동 게이트가 잡지 못하고, `CLAUDE.md`/`AGENTS.md`가 이미 말하지 않는 것만** 넣는다.
`pnpm lint`(max-lines 래칫·로컬라이제이션·reliability gates)나 `pnpm typecheck`가 잡는 것은 규칙이
아니다 — 중복은 워커의 컨텍스트만 먹는다.

상한은 **블록 12개 / 200줄**. 초과하면 추가와 함께 폐기 1건을 같이 제안한다. 후보는
`candidates.md`, 폐기 이력은 `retired.md`. 사람이 승인한 것만 이 파일에 들어온다.

---

### R-001 · scope: fork-sync

**언제** upstream 릴리스 태그를 `enterprise/samsungds`에 머지한 직후
**규칙**
- 충돌 파일마다 `git diff --numstat <옛태그> <새태그> -- <경로>`를 **먼저** 돌린다. 빈 출력이면
  upstream 실델타 0이므로 ours 유지가 정답이고 재검토하지 않는다.
- 게이트 대조는 카운트가 아니라 **매칭 라인 문자열**을 정렬 비교한다. 같은 파일에서 1건 삭제 +
  1건 추가면 카운트는 같다.
- `-1000`줄 이상 삭제된 파일은 추출 신호다. 게이트 grep을 그 파일이 아니라 **디렉터리 전체**에
  다시 돌린다.
- 머지 후 실패는 **순정 태그로 먼저 재현**한다. upstream이 깨진 채 릴리스한 전례가 3연속 있다.
**이유** 태그가 이전 태그의 자손이 아니라 merge-base가 뒤로 밀린다. v1.4.180 충돌 10건 중 7건이
이미 내린 결정을 다시 묻는 유령 충돌이었다. 게이트 유실은 충돌 표시도 타입 에러도 없이 일어난다
(v1.4.182에서 4건). `git log`는 델타를 과대 계상하므로 판정은 반드시 트리 diff 기준.
**출처** 세션 메모리 `orca-fork-sync-gate-drift` · 실측 7회 · **적중** 3

### R-002 · scope: dependencies

**언제** `package.json`의 `@tiptap/*` 버전을 건드릴 때
**규칙** 버전을 맞추지 말고 직접 의존 `@tiptap/*` **16개를 전부 exact로 고정**한다(캐럿 제거).
판정은 `npm install --dry-run --ignore-scripts`까지 통과시킨다.
**이유** `@tiptap/*`는 패밀리 전체가 exact peer를 선언한다. 캐럿과 exact를 섞으면 resolver가 캐럿
쪽만 최신으로 띄워 화해 불가능한 peer 충돌이 된다. `pnpm install --frozen-lockfile`은 lockfile이
그래프를 고정하므로 **조용히 통과한다** — 그래서 "고쳤다"고 오판하기 쉽고, 실제로 커밋
`66c6529f58`이 그 함정에 빠져 재발했다.
**출처** 세션 메모리 `orca-tiptap-exact-peer-recurrence` · **적중** 0

### R-003 · scope: submodule-scm

**언제** Source Control의 서브모듈 표시나 되돌리기를 건드릴 때
**규칙**
- 부모 뷰에는 gitlink **경로당 1행**만 넣는다. 내부 파일 행을 펼치는 설계는 배제한다.
- 파괴적 경로는 `assertSubmoduleWorktreeRoot`(`rev-parse --show-prefix`가 빈 문자열)를 반드시
  먼저 통과시킨다. `resolveSubmoduleWorktreePath`는 경로가 부모 안이라는 것만 증명한다.
- gitlink 행에 `git restore`를 걸지 않는다. 복구는 `git submodule update --init`만 실제로 한다.
- main과 relay를 **같은 커밋**에 넣는다.
**이유** 기준은 VS Code 실측 동작이다. 서브모듈이 deinit/이동 상태면 git이 상위로 올라가 **부모의
동명 파일을 덮어쓴다**(실측). 나누어 커밋하면 SSH에서만 옛 동작이 남는다.
**출처** 세션 메모리 `orca-submodule-scm-vscode-parity` · `87aa508be1` · **적중** 0

### R-004 · scope: testing

**언제** 판정 목적으로 전체 테스트 스위트를 돌릴 때
**규칙** 앰비언트 `GIT_CONFIG_*`를 벗기고 돌린다. `out/cli`가 스테일하면 `pnpm build:cli` 먼저.

```
env -u GIT_CONFIG_COUNT -u GIT_CONFIG_KEY_0 -u GIT_CONFIG_KEY_1 \
    -u GIT_CONFIG_VALUE_0 -u GIT_CONFIG_VALUE_1 \
  node ./node_modules/vitest/vitest.mjs run --config config/vitest.config.ts
```

**이유** Claude Code의 Bash 툴이 대화형 프롬프트를 막으려고 `GIT_CONFIG_COUNT=2`를 주입한다.
`src/relay/agent-exec-handler.test.ts`는 spawn 환경의 값이 정확히 `'2'`이길 기대하는데 핸들러가
붙이는 값과 합쳐져 `'4'`가 되며 실패한다. 소스 문제가 아니다.
`src/main/runtime/orchestration-cli-subprocess.test.ts`는 `out/cli/index.js`가 있으면 그 빌드
산출물을 돌린다.
**출처** 세션 메모리 `orca-test-suite-ambient-git-env` · **적중** 0
