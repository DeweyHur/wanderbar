# wanderbar

우리끼리 **메뉴 단위로** 맛집을 기록·공유하고, 담아 둔 곳으로 **하루 동선**을 짜서 다음 목적지를 **테슬라**로 보내는 아이폰·안드로이드 앱.
기획: claude.ai 프로젝트의 `claude/food-share-spec.md` (기존 `wanderbar-spec.md`를 합친 문서).

- 웹: https://wanderbar-api.vercel.app (API와 같은 주소. 앱을 안 깔아도 브라우저로 쓴다)

## 구조

```
apps/api/         Next.js API (Vercel) + Drizzle + Neon Postgres. 빌드 때 Expo 웹 앱을 public/에 넣어 같이 서빙
apps/mobile/      Expo (React Native) 앱·웹, expo-router
  src/core/         그룹·인증·API·i18n 공통 코드
  src/core/platform/  기기마다 다른 부분: *.ts = 앱(iOS·안드로이드), *.web.ts(x) = 웹
  src/modules/food/   맛집·동선 모듈 (ModuleDefinition, 번역)
  src/modules/fitness/  피트니스 모듈 (루틴, 운동 흐름, 휴식 알림, 출석)
  src/locales/      공통 번역 en / ko
packages/route/   앱과 API가 같이 쓰는 순수 로직 (동선 흐름, 영업시간, 공유 파싱, 가게 키·카테고리·가격, 운동 세트·휴식 흐름)
e2e/              Playwright 테스트 (데스크톱·폰 화면). 기본은 가짜 구글 응답, E2E_LIVE_GOOGLE=1이면 실제 구글
```

기존 Kotlin 앱(v0.2)은 2026-11-02에 저장소에서 지웠다. 코드는 태그 `kotlin-v0.2`에 남아 있다.

## 진행 상황

| 마일스톤 | 상태 |
|---|---|
| M1 뼈대: Expo + API + Neon + 구글 로그인 + 그룹·초대 링크, en/ko | 완료 |
| M2 공유 수신(옐프·구글맵 → 앱)·테슬라 전송 + 기존 wanderbar 동선 기능 이식 (기획서 M4 포함) | 완료. 구글 장소 검색·운전 시간은 서버 키로 서버에서 호출 |
| M3 가게와 메뉴: 공유로 가게 저장, 중복 판정(옐프 별칭·구글 장소), 구글 연결·영업시간, 가게·메뉴·가격 CRUD, 동선에 추가 | 완료 |
| M5 사진 업로드 (R2, 촬영 시각) | 다음. Cloudflare R2 버킷·키 필요 |
| M6 방문 기록과 평점 → M7 위시리스트와 추천 | 기획서 참고 |
| 보드게임 나이트 (기획서 M8·M9를 앞당김) | 완료: 정기 모임(요일·시간·N주마다, 그룹 시간대), 다음 모임 자동 생성, 고르는 사람(자원·넘기기·순번 제안), 게임 라이브러리(BGG·BGA·TTS·룰북·룰 영상·기타 링크, 태그), 큐, 10점 평점·코멘트, 리더보드(평점순·많이 한 순, 태그 필터), 지난 모임. "새 그룹"에서 보드게임 그룹을 만든다 |
| 피트니스 (기획서 `claude/fitness-module-spec.md`, 앞당김) | 완료(F2~F5): 멤버별 분할 루틴(날·동작·세트·횟수 또는 초·무게·휴식, 주간 목표, kg/lb), 운동 시작 = 출석, 순서 자유 동작 선택, "세트 n / N" 큰 화면, 휴식 타이머(±조정·건너뛰기·방금 세트 고치기), 휴식 끝 로컬 알림(안드로이드 정확한 알람 권한 안내), 시간 세트(플랭크), 폰에 먼저 저장 후 동기화, 완료 요약과 다음 사이클, 이번 주 출석판, 그룹 출석 피드(무게·횟수는 본인만), 완료 푸시. F1(실기기 알림 오차 측정)은 남음 |

APK는 안드로이드용 구글 키가 들어가므로, 저장소가 공개인 동안은 GitHub 릴리스·아티팩트로 올리지 않는다
(2026-11-02에 기존 공개 APK와 릴리스를 모두 삭제). CI는 릴리스 APK를 빌드해 에뮬레이터에서 실행·공유 받기를 확인한 뒤, **초안(draft) 릴리스**로 올린다.
초안은 저장소에 쓰기 권한이 있는 사람(주인)에게만 보인다: 폰에서 GitHub 로그인 → 저장소 → Releases → 최신 초안 → `wanderbar-mobile.apk`.
새 앱의 패키지는 `app.wanderbar.mobile`. 지도 표시용 앱 키는 이 패키지와 서명으로 제한하고 Maps SDK for Android만 열어 둔다.

## 처음 설정 (한 번만)

### 1. Neon (완료)
- 조직 Digitz, 프로젝트 `wanderbar` (`late-sky-25700084`), 리전 AWS us-east-1, Postgres 18
- 연결 주소(Pooled)는 `apps/api/.env.local`의 `DATABASE_URL` (커밋 안 됨)
- 테이블 생성·갱신: `npm run db:migrate -w apps/api` — Neon HTTPS 드라이버로 적용하므로 HTTP만 열린 환경에서도 된다.
  프록시 뒤에서는 `NODE_USE_ENV_PROXY=1`을 붙인다.
- CLI: `NEON_API_KEY=$(cat .neon-api-key) neon ...` (`.neon-api-key`는 커밋 안 됨)

### 2. 구글 로그인 (Google Cloud Console → API 및 서비스 → 사용자 인증 정보)
기존 Maps 키가 있는 같은 프로젝트를 써도 된다. OAuth 동의 화면을 "외부 / 테스트"로 두고 그룹원 이메일을 테스트 사용자로 넣는다.

| 클라이언트 유형 | 값 | 어디에 쓰나 |
|---|---|---|
| 웹 애플리케이션 | (설정 없음) | 서버 `GOOGLE_CLIENT_IDS`, 앱 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| iOS | 번들 ID `app.wanderbar.mobile` | 앱 `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`(역순 ID) |
| Android | 패키지 `app.wanderbar.mobile` + 서명 SHA-1 | 코드에는 안 넣지만 있어야 로그인된다 |

Android SHA-1: `npx expo prebuild` 후 `cd apps/mobile/android && ./gradlew signingReport` (debug). TestFlight·배포용 키를 쓰면 그 SHA-1도 추가.

### 2-1. 웹 로그인
구글 콘솔의 **웹 클라이언트** → Authorized JavaScript origins에 추가:
`https://wanderbar-api.vercel.app` (로컬 개발용 `http://localhost:3000`도 원하면)

### 3. API 서버
- 로컬: `npm run api:dev` → `http://<맥 IP>:3000` (폰과 같은 와이파이)
- Vercel 프로젝트 `wanderbar-api`, Root Directory `apps/api`. 환경변수 `DATABASE_URL`(Secret), `GOOGLE_CLIENT_IDS`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`(웹 빌드용)
- `npm run build -w apps/api` = Expo 웹 export(`public/`) + `next build`. API가 아닌 경로는 모두 웹 앱의 `index.html`로 간다
- 웹은 httpOnly 쿠키 세션(`SameSite=Lax`) + 쓰기 요청마다 `x-wanderbar-client: web` 헤더 검사(CSRF), 앱은 Bearer 토큰

### 4. 앱
1. `apps/mobile/.env.local` (`.env.example` 참고): API 주소와 구글 클라이언트 ID
2. 개발 빌드 (구글 로그인은 Expo Go에서 안 된다)
   - 아이폰: `cd apps/mobile && npx expo run:ios --device`
   - 안드로이드(Flip 6, USB 디버깅): `npx expo run:android --device`
3. 이후 JS만 바뀌면 `npm run mobile:start`로 바로 반영된다. 네이티브 설정(플러그인, 클라이언트 ID)이 바뀌면 다시 빌드.

## M1 확인 체크리스트

| # | 할 일 | 아이폰 | Flip 6 |
|---|---|---|---|
| 1 | 구글로 로그인 → 그룹 만들기 화면 | | |
| 2 | 그룹 만들기 → 멤버 1명(그룹장) | | |
| 3 | "초대 링크 보내기" → 메시지로 다른 사람에게 보냄 | | |
| 4 | 받은 사람이 링크 열기 → "앱에서 열기" → 로그인 → 참여하기 → 멤버 2명 | | |
| 5 | 앱을 껐다 켜도 로그인 유지 | | |

## API

모든 응답은 JSON, 인증은 `Authorization: Bearer <세션 토큰>`. 그룹 데이터는 멤버가 아니면 404.

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/auth/google` | `{ idToken, client: "app" \| "web" }` → 앱: 세션 토큰 / 웹: 쿠키 + 내 정보 + 내 그룹 |
| POST | `/api/auth/logout` | 세션 종료 |
| GET / PATCH | `/api/me` | 내 정보 + 내 그룹 / `{ locale }` 언어 저장 (null = 기기 언어) |
| POST | `/api/groups` | `{ name, module, defaultLocale, timezone, currency }` 그룹 만들기 (만든 사람이 그룹장) |
| GET | `/api/groups/:id` | 그룹 + 멤버 |
| POST / DELETE | `/api/groups/:id/invites` | 초대 링크 만들기(7일) / 전부 취소 — 그룹장만 |
| GET | `/api/invites/:token` | 초대 미리보기 (그룹 이름) |
| POST | `/api/invites/:token/accept` | 참여 |

에러는 문장이 아니라 코드(`invite.expired` 등)로 돌려주고 앱이 번역한다. 세션 토큰과 초대 토큰은 DB에 해시로만 저장한다. 모든 페이지와 응답에 `X-Robots-Tag: noindex`.

### 보드게임 모듈

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/groups/:id/boardgame` | 정기 모임, 다가오는 모임(다음 모임이 없으면 만들어 둔다), 지난 모임, 큐 |
| GET / POST | `/api/groups/:id/games` | 게임 목록(링크·태그·평균·플레이 횟수) / 추가 `{ name, links: [{kind,url,label}], tags, memo }` |
| GET / PATCH / DELETE | `/api/games/:id` | 게임 상세(모두의 평점·코멘트, 했던 모임) |
| PUT / DELETE | `/api/games/:id/rating` | 내 평점 `{ score: 1..10, review }` |
| POST / DELETE | `/api/games/:id/queue` | 큐에 담기 / 빼기 |
| POST | `/api/groups/:id/series` · PATCH / DELETE `/api/series/:id` | 정기 모임 `{ weekday 0..6, time "19:00", everyWeeks 1..4, location }` — 그룹장·진행자 |
| POST | `/api/groups/:id/nights` · GET / PATCH / DELETE `/api/nights/:id` | 한 번만 하는 모임 `{ date, time, location }`, 고르는 사람 `{ pickerId }`, 메모 |
| POST | `/api/nights/:id/games` · DELETE `/api/nights/:id/games/:gameId` | 그날 할 게임 — 고르는 사람·그룹장·진행자 (넣으면 큐에서 빠짐) |

## E2E (Playwright)

배포되는 것과 같은 빌드(Expo 웹 export + Next.js API)를 로컬에서 띄우고, 메모리 Postgres(PGlite, `DATABASE_URL=pglite:memory`)에서
데스크톱·폰 화면 크기로 브라우저 테스트를 돌린다. 구글 로그인 대신 테스트 전용 로그인(`/api/auth/test-login`)을 쓴다.
이 로그인은 `E2E_TEST_LOGIN=1` **이고** 메모리 DB일 때만 켜지며, Vercel에서는 무조건 꺼진다(단위 테스트로 고정).

```
npx playwright install chromium   # 처음 한 번 (e2e/에서)
npm run e2e                       # 빌드 + 서버 + 테스트. 이미 빌드했으면 E2E_SKIP_BUILD=1
```

시나리오: 로그아웃 화면, 첫 로그인 개인 그룹, 언어 전환, CSRF, 동선 전체 흐름(추가·완료·건너뛰기·순서·안 가기·되돌리기·다시 시작),
장소 편집과 영업시간 배지, 구글맵 공유 붙여넣기, 링크로 추가(구글맵·옐프), 초대와 동선 비공개. GitHub Actions에서 매 푸시마다 돈다.

## 개발

```
npm install                    # 루트에서 한 번
npm run api:test               # API 테스트 (PGlite 메모리 Postgres에 실제 마이그레이션 적용)
npm run typecheck -w apps/api
npm run typecheck -w apps/mobile
npm run check:i18n -w apps/mobile # en/ko 번역 키 일치 검사
npm run db:generate -w apps/api   # 스키마 바꾼 뒤 마이그레이션 SQL 생성
```

Expo 패키지는 `npx expo install`로 넣는 게 원칙이지만, 버전 조회 서버에 못 닿는 환경에서는 `node_modules/expo/bundledNativeModules.json`의 버전으로 `npm install -w apps/mobile`을 쓴다.
