# wanderbar

우리끼리 **메뉴 단위로** 맛집을 기록·공유하고, 담아 둔 곳으로 **하루 동선**을 짜서 다음 목적지를 **테슬라**로 보내는 아이폰·안드로이드 앱.
기획: claude.ai 프로젝트의 `claude/food-share-spec.md` (기존 `wanderbar-spec.md`를 합친 문서).

## 구조

```
apps/api/         Next.js API (Vercel) + Drizzle + Neon Postgres
apps/mobile/      Expo (React Native) 앱, expo-router
legacy-android/   기존 Kotlin 앱 v0.2 (태그 kotlin-v0.2). 새 앱이 따라잡을 때까지 계속 사용
```

## 진행 상황

| 마일스톤 | 상태 |
|---|---|
| M1 뼈대: Expo + API + Neon + 구글 로그인 + 그룹·초대 링크 | **코드 완료, 키 설정 후 실기기 확인 필요** (아래 설정) |
| M2 공유 수신(옐프·구글맵 → 앱)·테슬라 전송 검증 | 다음 |
| M3~ | 기획서 참고 |

기존 Kotlin 앱은 그대로 쓸 수 있다. APK: https://github.com/DeweyHur/wanderbar/releases/download/latest/wanderbar.apk
(CI는 `legacy-android/`가 바뀔 때만 다시 빌드한다.) 새 앱은 패키지가 `app.wanderbar.mobile`이라 기존 앱과 함께 설치된다.

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

### 3. API 서버
- 로컬: `npm run api:dev` → `http://<맥 IP>:3000` (폰과 같은 와이파이)
- Vercel: 새 프로젝트, Root Directory `apps/api`, 환경변수 `DATABASE_URL`, `GOOGLE_CLIENT_IDS`, `PUBLIC_BASE_URL`

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
| POST | `/api/auth/google` | `{ idToken }` → 세션 토큰 + 내 정보 + 내 그룹 |
| POST | `/api/auth/logout` | 세션 종료 |
| GET | `/api/me` | 내 정보 + 내 그룹 |
| POST | `/api/groups` | `{ name }` 그룹 만들기 (만든 사람이 그룹장) |
| GET | `/api/groups/:id` | 그룹 + 멤버 |
| POST / DELETE | `/api/groups/:id/invites` | 초대 링크 만들기(7일) / 전부 취소 — 그룹장만 |
| GET | `/api/invites/:token` | 초대 미리보기 (그룹 이름) |
| POST | `/api/invites/:token/accept` | 참여 |

세션 토큰과 초대 토큰은 DB에 해시로만 저장한다. 모든 페이지와 응답에 `X-Robots-Tag: noindex`.

## 개발

```
npm install                    # 루트에서 한 번
npm run api:test               # API 테스트 (PGlite 메모리 Postgres에 실제 마이그레이션 적용)
npm run typecheck -w apps/api
npm run typecheck -w apps/mobile
npm run db:generate -w apps/api   # 스키마 바꾼 뒤 마이그레이션 SQL 생성
```

Expo 패키지는 `npx expo install`로 넣는 게 원칙이지만, 버전 조회 서버에 못 닿는 환경에서는 `node_modules/expo/bundledNativeModules.json`의 버전으로 `npm install -w apps/mobile`을 쓴다.
