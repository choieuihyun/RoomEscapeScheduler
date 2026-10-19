# 동호회 1단계 — 로그인·멤버십 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카카오·구글 로그인과 관리자 승인 멤버십을 만들고, 빈자리 알림을 승인된 멤버만 걸 수 있게 한다.

**Architecture:** 멤버 상태와 카카오 연결은 서버 Postgres(`club_member`, `kakao_link`)에 둔다. 인증은 지금처럼 Firebase ID 토큰이다 — 구글은 Firebase 기본 공급자, 카카오는 서버가 카카오 인가 코드를 확인한 뒤 **서비스 계정 키로 Firebase 커스텀 토큰을 직접 서명**해 돌려준다(Admin SDK 없이 — 서버 아키텍처 D16 유지). 화면은 `signInWithCustomToken` / `signInWithPopup` 으로 들어가고, 멤버 상태는 `GET /api/me` 로 받는다.

**Tech Stack:** 앱 — React 19 + TypeScript + Vite, Vitest, Firebase JS SDK 12.9.0(CDN 동적 import). 서버 — Kotlin 2.3 / Spring Boot 4.1 / JDK 21, Spring Data JPA, Flyway, Postgres, `RestClient`, `google-auth-library-oauth2-http`, Jackson 3(`tools.jackson`), JUnit5 + `kotlin.test`.

**Spec:** `docs/superpowers/specs/2026-10-19-club-calendar-design.md` (§6.1, §6.6, §6.7, §6.8-1)

**누가 무엇을:** Task S1~S7 은 **서버 세션(`server-ae`)** 이 `~/ideaProjects/Server` 에서, Task C0 와 F1~F9 는 이 세션이 `~/RoomEscapeScheduler` 에서 한다. 서버 작업 지시는 SendMessage 로 이 문서의 해당 Task 를 넘긴다.

## Global Constraints

- 계약 원본은 Floduler `작업명세서.md` 다. 응답 모양이 바뀌면 그 문서부터 고친다(Task C0).
- **배포 순서: 서버 먼저, 5분 뒤 화면.** 화면은 새 API 가 404 면 동호회 기능을 숨기고 나머지는 그대로 돈다.
- 서버: 새 인증 경로는 `ApiSecurityConfig` 의 `authenticated()` 줄에 반드시 적는다(끝이 `anyRequest().permitAll()`).
- 서버: Flyway 는 앞으로만 — 배포된 V 파일은 고치지 않는다. 이번 파일은 `V6__club_member.sql`.
- 서버: `ddl-auto=validate` — 엔티티와 V6 SQL 이 정확히 맞아야 기동한다.
- 서버: 새 `@Value` 키는 기본값을 주거나 `src/test/resources/application.properties` 에 추가한다(테스트 설정이 운영 파일을 가린다).
- 서버: 비밀값 하나 = properties `${X:기본값}` + compose `environment` + `.env.example` + `배포.md` 네 군데.
- 서버: CORS 허용 메서드는 GET/POST/DELETE 뿐 — 이번 API 는 POST 로만 바꾼다(PUT/PATCH 안 씀).
- 서버: 기계가 읽는 에러 본문은 `{ "error": "<CODE>", "message": "<해요체 한국어>" }` (`WatchLimitDto` 모양).
- 서버: Firebase Admin SDK 를 넣지 않는다(D16). 커스텀 토큰은 `ServiceAccountCredentials.sign()` 으로 서명한다.
- 서버 문서 규칙: 서버 `기획.md` 를 코드보다 먼저, 판단은 `아키텍처.md` §4 에 D 번호로, 같은 커밋에. "Floduler 의 선택 사항"(D7)에 "동호회 기능만 서버 필수" 예외를 적고, §6 "회원 표·세션이 없다"를 고친다.
- 화면 문구는 해요체·사람 말(기획 §4.53).
- 카카오 로그인 버튼은 카카오 디자인 가이드(노란 `#FEE500`, 검은 글자 85%, 말풍선 기호)를, 구글 버튼은 구글 브랜드 가이드를 따른다.
- 조합 계산·공유 링크·테마 불러오기는 로그인 없이 그대로 동작해야 한다.
- 커밋에 `Co-Authored-By: Claude` 를 넣지 않는다.

## Review Focus

1. **카카오 인가 코드를 두 번 쓰는 경우**(새로고침, 뒤로 가기로 `?code=` 가 다시 열림) — 두 번째는 실패하지만, "다시 로그인해 주세요" 한 번만 보이고 주소에서 `code`·`state` 가 지워져 같은 일이 반복되지 않아야 한다. → Task F3 테스트.
2. **카카오로 나갔다 돌아오면 공유 링크 해시(`#s=`·`#z=`)가 사라지는 문제** — 나가기 전 해시를 `state` 와 함께 저장했다가 돌아와서 되살린다. → Task F2 테스트.
3. **마지막 관리자가 자기를 내보내거나 일반 멤버로 내리기** — 막고 `409 LAST_ADMIN`. → Task S4 테스트.
4. **이미 다른 계정에 연결된 카카오 계정을 연결하려는 경우** — `409 KAKAO_ALREADY_LINKED`, 기존 연결은 그대로. → Task S6 테스트.
5. **카카오톡 안의 브라우저에서 로그인 창을 연 경우** — 구글 버튼 대신 "외부 브라우저로 열기" 안내, 카카오 로그인은 그대로. → Task F1 테스트(`isKakaoInApp`), F5 화면.

---

### Task C0: 계약 — 작업명세서에 동호회 계정 API 절 추가

**Files:**
- Modify: `작업명세서.md` — §4.5 뒤에 새 절 `### 4.6 동호회 계정 — 로그인·멤버십 (기획 §4.54)`
- Modify: `기획.md` — §4.53 뒤에 `### 4.54 동호회 1단계 — 카카오·구글 로그인과 승인 멤버십` (결정과 이유, 설계 문서 링크)

**Interfaces — Produces (S·F 모든 Task 가 따르는 계약):**

| 메서드·경로 | 인증 | 요청 | 성공 | 실패 |
|---|---|---|---|---|
| `POST /api/auth/kakao` | 없음 | `{ code, redirectUri }` | `200 { customToken }` | `400 KAKAO_CODE_INVALID`, `400 REDIRECT_NOT_ALLOWED`, `503 KAKAO_UNAVAILABLE` |
| `POST /api/auth/kakao/link` | 필요 | `{ code, redirectUri }` | `200 { linked: true }` | 위 셋 + `409 KAKAO_ALREADY_LINKED` |
| `GET /api/me` | 필요 | — | `200 MeDto` | — |
| `POST /api/me/join` | 필요 | `{ nickname }` | `200 MeDto` | `400 BAD_NICKNAME`, `403 JOIN_BLOCKED` |
| `GET /api/admin/members?status=PENDING\|APPROVED\|ALL` | 관리자 | — | `200 MemberDto[]` | `403 NOT_ADMIN` |
| `POST /api/admin/members/{uid}/approve` · `/reject` · `/remove` | 관리자 | — | `200 MemberDto` | `403 NOT_ADMIN`, `404 NO_SUCH_MEMBER`, `409 LAST_ADMIN` |
| `POST /api/admin/members/{uid}/role` | 관리자 | `{ role: "ADMIN"\|"MEMBER" }` | `200 MemberDto` | 위와 같음 |
| `POST /api/watches` (기존) | 필요 | — | — | 추가: `403 NOT_MEMBER` |

- `MeDto = { uid, nickname: string\|null, role: "ADMIN"\|"MEMBER"\|null, status: "NONE"\|"PENDING"\|"APPROVED"\|"REJECTED"\|"REMOVED", kakaoLinked: boolean }`
- `MemberDto = { uid, nickname, role, status, createdAt (ISO), decidedAt (ISO\|null), hasDevice: boolean }`
- 닉네임: 앞뒤 공백 제거 후 1~20자.
- 카카오로 처음 들어온 사람의 uid 는 `kakao:<카카오 회원번호>`.
- `REJECTED` 는 다시 `join` 하면 `PENDING` 으로 돌아가고, `REMOVED` 는 `403 JOIN_BLOCKED`.

- [ ] **Step 1:** 위 표와 정의를 `작업명세서.md` §4.6 에 그대로 적는다. 에러 본문 모양 `{error, message}` 와 각 `message` 문구(해요체)를 함께 적는다.
- [ ] **Step 2:** `기획.md` §4.54 에 결정(승인 게이트, 기존 계정 연결, 커스텀 토큰 직접 서명, 배포 순서)과 이유를 적는다.
- [ ] **Step 3:** 커밋 — `docs: 동호회 계정 API 계약 (기획 §4.54, 작업명세서 §4.6)`

---

### Task S1: DB 백업 (서버 — `server-ae`)

**Files:**
- Create: `deploy/backup.sh` — `docker compose -f docker-compose.prod.yml exec -T db pg_dump -U roomescape -Fc roomescape > ~/roomescape/backups/roomescape-$(date +%F).dump`, 14일 지난 파일 삭제
- Modify: `배포.md` — "DB 백업" 절(크론 등록 줄 `15 4 * * *`, 되살리는 `pg_restore` 명령, 아직 VM 밖으로는 안 나간다는 한계)

- [ ] **Step 1:** 스크립트를 쓰고 `bash -n deploy/backup.sh` 로 문법 확인 — 출력 없음.
- [ ] **Step 2:** VM 에서 한 번 수동 실행해 덤프 파일이 생기고 `pg_restore --list` 가 테이블 목록을 내는지 확인(사용자 VM 접속 필요 — 결과를 보고에 적는다).
- [ ] **Step 3:** 크론 등록 줄을 `배포.md` 에 적고 커밋 — `ops: 매일 DB 백업 (배포.md)`

---

### Task S2: V6 — `club_member`·`kakao_link` 표와 엔티티 (서버)

**Files:**
- Create: `src/main/resources/db/migration/V6__club_member.sql`
- Modify: `domain/Entities.kt`, `domain/Repositories.kt`
- Modify: `build.gradle.kts` — `testImplementation("org.testcontainers:postgresql")`, `testImplementation("org.testcontainers:junit-jupiter")`
- Test: `src/test/kotlin/com/my_dream/server/domain/MigrationValidationTest.kt`

**Interfaces — Produces:**
- 표 `club_member(id BIGINT IDENTITY PK, user_id VARCHAR(255) NOT NULL UNIQUE, nickname VARCHAR(20) NOT NULL, role VARCHAR(16) NOT NULL CHECK (role IN ('ADMIN','MEMBER')), status VARCHAR(16) NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED','REMOVED')), created_at TIMESTAMPTZ NOT NULL, decided_at TIMESTAMPTZ, decided_by VARCHAR(255))`
- 표 `kakao_link(id BIGINT IDENTITY PK, kakao_id BIGINT NOT NULL UNIQUE, user_id VARCHAR(255) NOT NULL, created_at TIMESTAMPTZ NOT NULL)` + `idx_kakao_link_user`
- `enum class MemberRole { ADMIN, MEMBER }`, `enum class MemberStatus { PENDING, APPROVED, REJECTED, REMOVED }` (`@Enumerated(EnumType.STRING)`)
- `class ClubMember(userId, nickname, role, status, createdAt, decidedAt?, decidedBy?)`, `class KakaoLink(kakaoId: Long, userId, createdAt)`
- `ClubMemberRepository.findByUserId(userId): ClubMember?`, `findByStatus(status): List<ClubMember>`, `countByRoleAndStatus(role, status): Long`, `@Lock(PESSIMISTIC_WRITE) findForUpdateByUserId(userId): ClubMember?`
- `KakaoLinkRepository.findByKakaoId(kakaoId): KakaoLink?`, `existsByUserId(userId): Boolean`

- [ ] **Step 1: 실패하는 테스트** — Testcontainers Postgres 에 Flyway V1~V6 를 돌리고 `ddl-auto=validate` 로 컨텍스트를 띄운다.

```kotlin
@SpringBootTest
@Testcontainers
class MigrationValidationTest {
    companion object {
        @Container @JvmStatic val pg = PostgreSQLContainer("postgres:16-alpine")
        @DynamicPropertySource @JvmStatic fun props(r: DynamicPropertyRegistry) {
            r.add("spring.datasource.url", pg::getJdbcUrl); r.add("spring.datasource.username", pg::getUsername)
            r.add("spring.datasource.password", pg::getPassword)
            r.add("spring.flyway.enabled") { "true" }; r.add("spring.jpa.hibernate.ddl-auto") { "validate" }
        }
    }
    @Autowired lateinit var members: ClubMemberRepository
    @Test fun `V6 까지 돌고 엔티티와 맞는다`() { assertEquals(0, members.count()) }
}
```
(Docker 가 필요하다. 이 머신에 Docker 가 없으면 서버 세션이 사용자에게 알리고, 대신 로컬 `docker compose up db` + `./gradlew bootRun` 기동 성공으로 같은 확인을 한다.)
- [ ] **Step 2:** `./gradlew test --tests '*MigrationValidationTest'` — FAIL(표 없음).
- [ ] **Step 3:** V6 SQL·엔티티·저장소를 위 Interfaces 그대로 만든다. 파일 머리·컬럼마다 "왜" 주석(V4 관례).
- [ ] **Step 4:** 같은 명령 — PASS. `./gradlew test` 전체 — PASS.
- [ ] **Step 5:** 서버 `아키텍처.md` 에 D 번호(회원 표가 생긴 이유, §6 수정), 커밋 — `feat: V6 동호회 멤버·카카오 연결 표`

---

### Task S3: 커스텀 토큰 서명과 카카오 클라이언트 (서버)

**Files:**
- Create: `auth/FirebaseCustomTokens.kt` — `interface FirebaseCustomTokens { fun mint(uid: String): String }` + `@Component class ServiceAccountCustomTokens(@Value("\${auth.firebase.signer-credentials-file:\${notify.fcm.credentials-file:}}") file: String, clock: Clock)`
- Create: `auth/KakaoClient.kt` — `class KakaoClient(builder: RestClient.Builder, @Value("\${kakao.auth-base-url:https://kauth.kakao.com}") authBase, @Value("\${kakao.api-base-url:https://kapi.kakao.com}") apiBase, @Value("\${kakao.rest-api-key:}") restKey, @Value("\${kakao.client-secret:}") secret)` with `fun userIdForCode(code: String, redirectUri: String): Long`
- Modify: `application.properties`, `docker-compose.prod.yml`, `.env.example`, `배포.md` — `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `KAKAO_ALLOWED_REDIRECT_URIS`(기본 `https://choieuihyun.github.io/RoomEscapeScheduler/,http://localhost:5173/`), `FIREBASE_SIGNER_CREDENTIALS_FILE`
- Modify: `src/test/resources/application.properties` — 위 키의 테스트 값
- Test: `auth/FirebaseCustomTokensTest.kt`, `auth/KakaoClientTest.kt`

**Interfaces — Produces:**
- `FirebaseCustomTokens.mint(uid)` → RS256 JWT: `iss`=`sub`=서비스 계정 이메일, `aud`=`https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit`, `uid`, `iat`=now, `exp`=now+3600. 서명은 `ServiceAccountCredentials.sign(bytes)`.
- `KakaoClient.userIdForCode` — `POST {authBase}/oauth/token`(form: `grant_type=authorization_code, client_id, redirect_uri, code, client_secret`) → `access_token` → `GET {apiBase}/v2/user/me` → `id`. 카카오 4xx → `KakaoCodeInvalid`, 5xx·연결 실패 → `KakaoUnavailable`.

- [ ] **Step 1: 실패하는 테스트**
  - `FirebaseCustomTokensTest`: 테스트용 RSA 키로 만든 가짜 서비스 계정 JSON(`@TempDir`)으로 `mint("kakao:42")` → 공개키로 서명 검증 통과, `claims.uid == "kakao:42"`, `aud` 가 위 값, `exp - iat == 3600`.
  - `KakaoClientTest` (`MockRestServiceServer.bindTo(builder)`): 토큰 200 + me 200 `{ "id": 42 }` → `42`. 토큰 400 → `assertFailsWith<KakaoCodeInvalid>`. 토큰 500 → `assertFailsWith<KakaoUnavailable>`. 요청 form 에 `redirect_uri` 와 `client_secret` 이 실린다.
- [ ] **Step 2:** `./gradlew test --tests '*FirebaseCustomTokensTest' --tests '*KakaoClientTest'` — FAIL.
- [ ] **Step 3:** 구현. 서명 키 파일이 비어 있으면 빈은 뜨되 `mint` 가 `KakaoUnavailable("서명 키 없음")` 을 던진다(로컬·테스트 기동이 깨지지 않게).
- [ ] **Step 4:** 같은 명령 — PASS. 전체 `./gradlew test` — PASS.
- [ ] **Step 5:** 아키텍처 D 번호("D16 유지: 커스텀 토큰도 Admin SDK 없이"), 비밀값 네 군데, 커밋 — `feat: 카카오 인가 코드 확인과 Firebase 커스텀 토큰 서명`

---

### Task S4: 멤버십 서비스 (서버)

**Files:**
- Create: `club/MembershipService.kt`, `club/ClubErrors.kt` (`class ClubError(val status: HttpStatus, val code: String, override val message: String) : RuntimeException(message)`)
- Create: `club/BootstrapAdmin.kt` — `ApplicationRunner`, `@Value("\${club.bootstrap-admin-uid:}")`
- Test: `club/MembershipServiceTest.kt` (`@DataJpaTest @Import(MembershipService::class)`)

**Interfaces — Produces:**
- `fun me(uid: String): MeDto`, `fun join(uid: String, nickname: String): MeDto`
- `fun list(adminUid: String, status: String): List<MemberDto>` (`"ALL"` 은 전부)
- `fun approve(adminUid, uid): MemberDto`, `reject(...)`, `remove(...)`, `setRole(adminUid, uid, role: MemberRole): MemberDto`
- 모든 관리 메서드는 `findForUpdateByUserId` 로 대상을 잠그고, 관리자 여부를 서버에서 확인한다.
- `BootstrapAdmin`: 기동 때 `club.bootstrap-admin-uid` 가 있으면 그 uid 를 `APPROVED`·`ADMIN` 으로 만든다(닉네임 없으면 `"관리자"`). 이미 있으면 그대로 둔다.

- [ ] **Step 1: 실패하는 테스트** (`MembershipServiceTest`)
  - `처음 가입하면 승인 대기다`: `join("u1", " 철수 ")` → `status == "PENDING"`, `nickname == "철수"`
  - `닉네임은 1~20자`: `""`·21자 → `ClubError` `code == "BAD_NICKNAME"`
  - `가입은 여러 번 눌러도 하나`: 두 번 `join` → 행 1개
  - `거절된 사람은 다시 신청하면 대기로`: REJECTED → `join` → PENDING
  - `내보낸 사람은 다시 못 들어온다`: REMOVED → `join` → `JOIN_BLOCKED`, status 403
  - `관리자가 아니면 승인 못 한다`: `approve("u2", "u1")` → `NOT_ADMIN` 403
  - `승인하면 decidedAt·decidedBy 가 남는다`
  - `없는 사람` → `NO_SUCH_MEMBER` 404
  - **`마지막 관리자는 자기를 내보내거나 멤버로 못 내린다`** → `LAST_ADMIN` 409 (Review Focus 3)
  - `관리자가 둘이면 하나는 내릴 수 있다`
  - `부트스트랩 관리자`: 프로퍼티 uid → APPROVED·ADMIN, 두 번 돌려도 행 1개
- [ ] **Step 2:** `./gradlew test --tests '*MembershipServiceTest'` — FAIL.
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** PASS, 전체 PASS.
- [ ] **Step 5:** 커밋 — `feat: 동호회 멤버십(가입·승인·역할)`

---

### Task S5: 멤버십·관리자 API + 보안 경로 (서버)

**Files:**
- Create: `api/MeApi.kt` (`/api/me`, `/api/me/join`), `api/AdminMemberApi.kt` (`/api/admin/members/**`), `api/JwtUid.kt` — 공용 `fun Jwt.uid(): String`(DeviceApi·WatchApi 의 private 사본을 이걸로 바꾼다)
- Create: `api/ClubErrorAdvice.kt` — `@RestControllerAdvice` 가 `ClubError` → `ResponseEntity.status(e.status).body(mapOf("error" to e.code, "message" to e.message))`
- Modify: `security/ApiSecurityConfig.kt` — `authenticated()` 에 `"/api/me", "/api/me/**", "/api/admin/**", "/api/auth/kakao/link"`
- Modify: `build.gradle.kts` — `testImplementation("org.springframework.security:spring-security-test")`
- Test: `api/ClubApiSecurityTest.kt` (`@SpringBootTest @AutoConfigureMockMvc`)

- [ ] **Step 1: 실패하는 테스트**
  - 토큰 없이 `GET /api/me` → 401, `GET /api/admin/members` → 401
  - `jwt().jwt { it.subject("u1") }` 로 `POST /api/me/join {"nickname":"철수"}` → 200, `$.status == "PENDING"`
  - 일반 멤버 토큰으로 `GET /api/admin/members?status=PENDING` → 403, `$.error == "NOT_ADMIN"`
  - 관리자 토큰으로 `POST /api/admin/members/u1/approve` → 200, `$.status == "APPROVED"`
  - `POST /api/auth/kakao` 는 토큰 없이도 401 이 아니다(400 등 — 경로가 열려 있는지만 본다)
- [ ] **Step 2:** FAIL 확인.
- [ ] **Step 3:** 구현. 컨트롤러는 얇게 — `jwt.uid()` 로 uid 를 꺼내 서비스에 넘긴다.
- [ ] **Step 4:** PASS, 전체 PASS.
- [ ] **Step 5:** 커밋 — `feat: 멤버십·관리자 API, 새 인증 경로 등록`

---

### Task S6: 카카오 로그인·연결 API (서버)

**Files:**
- Create: `auth/KakaoAuthService.kt`, `api/KakaoAuthApi.kt`
- Test: `auth/KakaoAuthServiceTest.kt` (`@DataJpaTest`, `KakaoClient`·`FirebaseCustomTokens` 는 가짜 구현)

**Interfaces — Produces:**
- `fun login(code: String, redirectUri: String): String` (커스텀 토큰) — `redirectUri` 가 허용 목록에 없으면 `REDIRECT_NOT_ALLOWED`. 연결된 카카오면 그 uid, 아니면 `kakao:<id>` 로 `KakaoLink` 를 만들고 그 uid.
- `fun link(uid: String, code: String, redirectUri: String)` — 그 카카오가 다른 uid 에 연결돼 있으면 `KAKAO_ALREADY_LINKED` 409, 이미 이 uid 면 그대로 성공, 아니면 연결을 만든다. 이 uid 에 다른 카카오가 연결돼 있으면 `KAKAO_ALREADY_LINKED` 409.
- `KakaoCodeInvalid` → `ClubError(400, "KAKAO_CODE_INVALID", "카카오 로그인이 만료됐어요. 다시 눌러 주세요.")`, `KakaoUnavailable` → `503 KAKAO_UNAVAILABLE`.

- [ ] **Step 1: 실패하는 테스트**
  - `처음 들어온 카카오는 kakao:id uid 를 받는다` — 가짜 클라이언트 42 → `mint` 호출 인자 `"kakao:42"`, `KakaoLink(42, "kakao:42")` 생김
  - `연결된 카카오는 기존 uid 로 들어온다` — `KakaoLink(42, "legacy-uid")` 가 있으면 `mint("legacy-uid")`
  - `허용 안 된 redirectUri 는 거절`
  - **`다른 계정에 연결된 카카오는 연결 못 한다`** — `KakaoLink(42, "other")` 상태에서 `link("me", …)` → `KAKAO_ALREADY_LINKED`, 기존 연결 그대로 (Review Focus 4)
  - `같은 계정에 다시 연결은 성공`
  - `만료된 코드` → `KAKAO_CODE_INVALID` 400
- [ ] **Step 2:** FAIL 확인.
- [ ] **Step 3:** 구현 + 컨트롤러(`POST /api/auth/kakao` → `{customToken}`, `POST /api/auth/kakao/link` → `{linked:true}`).
- [ ] **Step 4:** PASS, 전체 PASS.
- [ ] **Step 5:** 커밋 — `feat: 카카오 로그인·계정 연결 API`

---

### Task S7: 빈자리 알림을 승인된 멤버만 (서버)

**Files:**
- Modify: `api/WatchApi.kt` — `WatchService` 생성자에 `ClubMemberRepository` 추가, `register` 첫머리에 승인 확인
- Test: `api/WatchServiceTest.kt` — 기존 테스트의 사용자 `"나"`·`"너"` 를 `setUp` 에서 `APPROVED` 멤버로 만든다

- [ ] **Step 1: 실패하는 테스트**
  - `승인 안 된 사람은 빈자리 알림을 못 건다` → `ClubError` `code == "NOT_MEMBER"`, 403, message `"동호회 승인을 받은 계정만 빈자리 알림을 걸 수 있어요."`
  - `승인 안 된 사람도 이미 건 알림은 보고 지울 수 있다` — 목록·삭제는 그대로
- [ ] **Step 2:** FAIL 확인.
- [ ] **Step 3:** 구현(검사는 404·400 보다 먼저).
- [ ] **Step 4:** 전체 `./gradlew test` — PASS.
- [ ] **Step 5:** 서버 `기획.md`·`아키텍처.md`(D7 예외), 커밋 — `feat: 빈자리 알림은 승인 멤버만 (1인 1계정 장치)`. **배포는 F 작업 전에 먼저.** 배포 후 `curl -s -o /dev/null -w '%{http_code}' https://floduler.duckdns.org/api/me` → `401` 확인.

---

### Task F1: 순수 함수 — 카카오 주소·돌아온 주소 읽기, 카톡 브라우저 판별

**Files:**
- Create: `app/src/kakao.ts`
- Test: `app/src/kakao.test.ts`

**Interfaces — Produces:**
- `export function kakaoAuthUrl(clientId: string, redirectUri: string, state: string): string` — `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=…&redirect_uri=…&state=…`
- `export function readKakaoReturn(search: string): { code: string; state: string } | { error: string } | null` — `?code=&state=` / `?error=` / 없음
- `export function stripKakaoParams(href: string): string` — `code`·`state`·`error`·`error_description` 만 지우고 나머지 쿼리(`view=`)와 해시는 그대로
- `export function isKakaoInApp(ua: string): boolean` — UA 에 `KAKAOTALK`(대소문자 무시)
- `export function appRedirectUri(loc: { origin: string; pathname: string }): string` — `origin + pathname` (쿼리·해시 없이)

- [ ] **Step 1: 실패하는 테스트** — 각 함수: 정상 주소, `error=access_denied`, 파라미터 없음; `stripKakaoParams('https://x/R/?view=calendar&code=a&state=b#s=AAA') === 'https://x/R/?view=calendar#s=AAA'`; `isKakaoInApp('… KAKAOTALK 10.4.5')` true, 일반 크롬 false.
- [ ] **Step 2:** `cd app && npx vitest run src/kakao.test.ts` — FAIL.
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** 커밋 — `feat: 카카오 로그인 주소 도우미`

---

### Task F2: 카카오로 나갔다 돌아오기 — state·해시 보관

**Files:**
- Create: `app/src/kakaoTrip.ts`
- Test: `app/src/kakaoTrip.test.ts` (sessionStorage 를 `vi.stubGlobal` 로 대체)

**Interfaces — Produces:**
- `export type KakaoMode = 'login' | 'link'`
- `export function beginKakaoTrip(mode: KakaoMode, hash: string, rand?: () => string): string` — state 를 만들고 `sessionStorage['flod.kakao.trip'] = JSON.stringify({ state, mode, hash, at: Date.now() })`, state 를 돌려준다
- `export function endKakaoTrip(state: string, now?: number): { mode: KakaoMode; hash: string } | null` — 저장된 state 와 같고 10분 안이면 돌려주고 **지운다**(한 번만), 아니면 null

- [ ] **Step 1: 실패하는 테스트**
  - **`나갈 때 해시를 맡기고 돌아와서 되찾는다`** — `beginKakaoTrip('login', '#s=AAA')` → `endKakaoTrip(state)` → `{ mode: 'login', hash: '#s=AAA' }` (Review Focus 2)
  - `state 가 다르면 null` (CSRF)
  - `한 번 쓰면 다시는 null`
  - `10분 지나면 null`
- [ ] **Step 2:** FAIL. **Step 3:** 구현. **Step 4:** PASS.
- [ ] **Step 5:** 커밋 — `feat: 카카오 왕복 state·해시 보관`

---

### Task F3: 로그인 API·Firebase 함수 (`cloud.ts`, `server.ts`)

**Files:**
- Modify: `app/src/cloud.ts`
- Modify: `app/src/server.ts`
- Test: `app/src/server.test.ts` — `fetch` 를 `vi.stubGlobal` 로 대체

**Interfaces — Produces:**
- `cloud.ts`: `signInWithGoogle(): Promise<Me>`, `linkGoogle(): Promise<void>`, `signInWithCustom(token: string): Promise<Me>`, `providers(): Promise<string[]>` (현재 사용자의 `providerData[].providerId`). `Me` 는 `{ uid; id: string }` 그대로 — 소셜 계정은 `id = ''`(표시 이름은 멤버 닉네임으로).
- `cloud.ts` `say()` 에 추가: `popup-closed-by-user` → `'로그인 창이 닫혔어요.'`, `credential-already-in-use` → `'이 구글 계정은 이미 다른 계정에 연결돼 있어요.'`, `popup-blocked` → `'팝업이 막혔어요. 팝업을 허용하고 다시 눌러 주세요.'`
- `server.ts`: `export interface MeDto`, `export interface MemberDto`(C0 그대로), `kakaoLogin(code, redirectUri): Promise<{ customToken: string }>`(인증 없음), `kakaoLink(code, redirectUri, token)`, `getMe(token)`, `joinClub(nickname, token)`, `listMembers(status, token)`, `memberAction(uid, action: 'approve'|'reject'|'remove', token)`, `setMemberRole(uid, role, token)`
- `server.ts`: `export function sayClub(err: unknown): string` — 본문 `message` 가 있으면 그대로, 404 면 `'서버가 아직 동호회 기능을 몰라요. 잠시 뒤 다시 열어 주세요.'`, 나머지는 `say()`

- [ ] **Step 1: 실패하는 테스트** (`server.test.ts`)
  - `kakaoLogin 은 Authorization 없이 POST 한다` — 요청 URL `/api/auth/kakao`, 본문 `{code, redirectUri}`
  - `joinClub 은 Bearer 를 싣는다`
  - **`카카오 코드 재사용 400 은 서버 문구 그대로`** — `{error:'KAKAO_CODE_INVALID', message:'카카오 로그인이 만료됐어요. 다시 눌러 주세요.'}` → `sayClub` 이 그 문구 (Review Focus 1, 화면 쪽은 F4)
  - `404 면 서버가 모른다는 문구`
- [ ] **Step 2:** `npx vitest run src/server.test.ts` — FAIL. **Step 3:** 구현. **Step 4:** PASS, `npx tsc -b` 통과.
- [ ] **Step 5:** 커밋 — `feat: 소셜 로그인·멤버십 API 호출`

---

### Task F4: `useAuth` — 소셜 로그인, 카카오 돌아오기, 멤버 상태

**Files:**
- Modify: `app/src/useAuth.ts`
- Create: `app/src/authFlow.ts` — React 밖의 순수 흐름 `handleKakaoReturn(deps)` (테스트하려고 분리)
- Test: `app/src/authFlow.test.ts`

**Interfaces:**
- Consumes: F1·F2·F3 함수들.
- Produces (`UseAuthReturn` 추가분): `member: MeDto | null`, `memberLoading: boolean`, `refreshMember(): Promise<void>`, `loginKakao(): void`(주소 이동), `loginGoogle(): Promise<void>`, `linkKakao(): void`, `linkGoogle(): Promise<void>`, `join(nickname: string): Promise<void>`, `inKakaoApp: boolean`, `legacyOpen: boolean` + `setLegacyOpen`. 기존 `mode: 'up'`(아이디 가입)은 없앤다 — `openAuth()` 는 인자 없이.
- `handleKakaoReturn({ search, href, replaceUrl, endTrip, kakaoLogin, kakaoLink, signInWithCustom, idToken, redirectUri })` → `{ kind: 'none' } | { kind: 'signedIn' } | { kind: 'linked' } | { kind: 'error'; message: string }`. **어떤 경우든 먼저 `replaceUrl(stripKakaoParams(href) 의 해시 자리에 trip.hash)`** 를 불러 주소를 정리한다.

- [ ] **Step 1: 실패하는 테스트** (`authFlow.test.ts`, 모든 의존성은 `vi.fn`)
  - `코드가 없으면 아무것도 안 한다`
  - `login 왕복이면 커스텀 토큰으로 들어간다` — `signInWithCustom('tok')` 호출, 결과 `signedIn`
  - **`해시를 되살리고 code 를 지운다`** — `replaceUrl` 인자가 `…/R/?view=calendar#s=AAA`
  - **`같은 코드로 두 번 오면 한 번만 에러, 주소는 정리`** — `endTrip` 이 null → `kakaoLogin` 을 안 부르고 `{kind:'error', message:'카카오 로그인이 만료됐어요. 다시 눌러 주세요.'}`, `replaceUrl` 은 불림 (Review Focus 1)
  - `?error=access_denied` → `{kind:'error', message:'카카오 로그인을 취소했어요.'}`
  - `link 왕복이면 idToken 을 실어 kakaoLink`
- [ ] **Step 2:** FAIL. **Step 3:** `authFlow.ts` 구현, `useAuth` 가 마운트 때 `handleKakaoReturn` 을 한 번 부르고, 로그인 상태가 되면 `getMe` 로 `member` 를 채운다(서버 404 면 `member=null`·동호회 기능 숨김). 로그인 직후 `silentlyRefreshPush(await idToken())`(이미 `notify.ts` 에 있음 — 권한이 허용돼 있을 때만 조용히 등록)를 불러 기기를 등록한다(설계 §6.5 "기기 등록 시점").
- [ ] **Step 4:** PASS, `npx tsc -b`, `npm test` 전체 PASS.
- [ ] **Step 5:** 커밋 — `feat: useAuth 소셜 로그인·카카오 돌아오기·멤버 상태`

---

### Task F5: 화면 — 로그인 창·가입 신청·승인 대기 (목업 먼저)

**Files:**
- Create: Artifact 목업(scratchpad `mockups/phase1-auth.html`) — 로그인 창(일반 브라우저 / 카톡 안 브라우저), 닉네임 신청, 승인 대기, 계정 연결
- Modify: `app/src/components/AuthModal.tsx`, `app/src/components/AcctWidget.tsx`, `app/src/floduler.css`
- Create: `app/src/components/JoinPanel.tsx`

**Interfaces — Consumes:** F4 의 `UseAuthReturn`.

- [ ] **Step 1:** 목업을 Artifact 로 올려 사용자에게 보여 주고 고른다. **고르기 전엔 Step 2 로 가지 않는다.**
- [ ] **Step 2:** 로그인 창: 카카오 버튼(맨 위) → 구글 버튼 → 접힌 "기존 아이디로 로그인"(아이디·비밀번호 칸). `inKakaoApp` 이면 구글 버튼 자리에 "구글 로그인은 카카오톡 안에서는 안 돼요 — 오른쪽 위 ⋮ → 다른 브라우저로 열기"(Review Focus 5).
- [ ] **Step 3:** 로그인했는데 `member.status` 가 `NONE`·`REJECTED` 면 `JoinPanel`(오픈채팅 닉네임 1~20자, "가입 신청"), `PENDING` 이면 "승인을 기다리고 있어요 — 방장에게 카톡으로 알려 주세요", `REMOVED` 면 "동호회에서 나간 계정이에요". 왼쪽 메뉴 아래 계정 자리에 닉네임 표시.
- [ ] **Step 4:** 기존 아이디 계정이고 카카오·구글이 안 붙어 있으면 계정 자리에 "카카오 연결"·"구글 연결" 버튼(`providers()` 로 판단).
- [ ] **Step 5:** 헤드리스 확인(scratchpad 스크립트): 로그인 창 일반 UA·카톡 UA 두 벌 스크린샷, 라이트·다크, 390px. `npm run build`·`npm test`·린트 경고 수 유지. 크롬 정리(CLAUDE.md). 커밋 — `feat: 소셜 로그인 창·가입 신청·승인 대기 (기획 §4.54)`

---

### Task F6: 화면 — 멤버 관리(관리자)

**Files:**
- Modify: `app/src/useView.ts` — `View` 에 `'members'` 추가, 시그니처 `useView(calendarOn: boolean, isAdmin: boolean)`, `export function readView(search: string, calendarOn: boolean, isAdmin: boolean): View` (관리자가 아니면 `'members'` → `'calc'`)
- Modify: `app/src/components/SideNav.tsx` — 관리자에게만 "멤버 관리" 항목
- Create: `app/src/components/MembersPage.tsx`, `app/src/useMembers.ts`
- Modify: `app/src/SchedulerPage.tsx`, `app/src/floduler.css`

**Interfaces — Consumes:** F3 `listMembers`, `memberAction`, `setMemberRole`, `sayClub`.

- [ ] **Step 1:** 목업(F5 Artifact 에 탭 하나 추가)으로 사용자 확인.
- [ ] **Step 2:** "승인 대기" 목록(닉네임, 가입 시각, 승인·거절), "멤버" 목록(닉네임, 역할, 알림 받는 기기 있음/없음, 관리자 지정·해제, 내보내기 — 내보내기는 `confirm`). 처리 후 `showToast`. 서버 에러는 `sayClub` 문구 그대로(`LAST_ADMIN` 등).
- [ ] **Step 3:** `useView` 테스트 추가 — `관리자가 아니면 ?view=members 는 calc 로` (`src/useView.test.ts`, `readView` 를 export 해 순수 함수로 검사).
- [ ] **Step 4:** 헤드리스(관리자 응답을 Playwright `page.route('**/api/**')` 로 흉내) 스크린샷·라이트·다크·390px, 빌드·테스트·린트, 크롬 정리. 커밋 — `feat: 멤버 관리 화면`

---

### Task F7: 빈자리 알림 — 승인 멤버만 (화면)

**Files:**
- Modify: `app/src/useWatches.ts` — `buildWatchControl(w, loggedIn, approved: boolean)`
- Modify: `app/src/SchedulerPage.tsx` — `approved = auth.member?.status === 'APPROVED'`
- Test: `app/src/useWatches.test.ts`

- [ ] **Step 1: 실패하는 테스트** — `승인 전에는 이유를 띄우고 등록하지 않는다`: `buildWatchControl(w, true, false).toggle(172)` → `add` 안 불림, alert 에 `'승인'` 포함(`'동호회 승인을 받으면 빈자리 알림을 걸 수 있어요.'`). 기존 테스트들은 `approved=true` 로 고친다(문구 `'로그인'`·`'최대 3개'` 유지).
- [ ] **Step 2:** FAIL. **Step 3:** 구현. 서버의 `403 NOT_MEMBER` 도 `sayWatch` 가 본문 문구를 쓰게 한다. **Step 4:** PASS.
- [ ] **Step 5:** 커밋 — `feat: 빈자리 알림은 승인 멤버만 (화면)`

---

### Task F8: Firestore 규칙 — 소셜 계정도 개인 일정 쓰기

**Files:**
- Modify: `firestore.rules` — `request.auth.token.email.matches('.*@user[.]resched')` 를 `(… || request.auth.token.firebase.sign_in_provider in ['google.com', 'custom'])` 로

- [ ] **Step 1:** 규칙 수정, 주석에 이유(기획 §4.54).
- [ ] **Step 2:** 사용자에게 Firebase 콘솔 → Firestore → 규칙에 붙여넣기·게시를 부탁한다(이 저장소에서 배포하지 않는다). 게시 후 구글 계정으로 일정 저장이 되는지 사용자 확인.
- [ ] **Step 3:** 커밋 — `fix: Firestore 규칙에 구글·카카오 계정 허용`

---

### Task F9: 설정·배포·확인

**Files:**
- Modify: `app/public/firebase-config.js` — `window.KAKAO_CLIENT_ID = '<REST API 키>'` (카카오 REST 키는 클라이언트 id 라 공개돼도 된다; 비밀인 client secret 은 서버 `.env` 에만)
- Modify: `배포.md` — 카카오 개발자 콘솔 설정(플랫폼 Web 도메인 `https://choieuihyun.github.io`, `http://localhost:5173`, 리다이렉트 URI 두 개 — `KAKAO_ALLOWED_REDIRECT_URIS` 와 같은 값), Firebase 콘솔(구글 공급자 켜기, 승인된 도메인)

- [ ] **Step 1:** 사용자 작업 체크리스트를 보고에 적고 받는다: 카카오 앱 등록·키, 동의 항목은 **필수 없음**(회원번호만 쓴다), Firebase 구글 공급자 켜기, 서버 `.env` 값, `CLUB_BOOTSTRAP_ADMIN_UID`(사용자 기존 계정 uid — Firebase 콘솔 Authentication 목록).
- [ ] **Step 2:** 서버가 배포돼 `/api/me` 가 401 인 것을 확인한 뒤(Task S7), 5분 지나 앱을 푸시한다.
- [ ] **Step 3:** 운영 확인: 로그인 창이 뜨고 카카오 버튼이 `kauth.kakao.com` 으로 가는지(헤드리스), 기존 공유 링크(`#s=`)가 그대로 열리는지, 조합 계산이 로그인 없이 되는지. 실제 카카오·구글 로그인 → 가입 신청 → 관리자 승인 → 빈자리 알림 걸기는 **사용자 실기기 확인**으로 받는다.
- [ ] **Step 4:** `기획.md` §4.54 검증 결과 추가, 커밋 — `docs: 동호회 1단계 배포·확인 (기획 §4.54)`
