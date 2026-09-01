# QW Solar — 로그 스케일 태양계 데모

Three.js 기반 인터랙티브 태양계 시각화. Sun~Pluto와 주요 위성을 실제 천문
데이터로 표현하되, 화면 가독성을 위해 거리·크기 렌더 스케일을 별도로 적용합니다.
요구사항 원본: `docs/THREEJS_SOLAR_DEMO_PROMPT.md` (1~18절 전문 준수).

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # TypeScript 검사 + 프로덕션 빌드
npm run preview  # 빌드 결과 확인
```

Node 20.19+ / 22.12+ 필요 (Vite 8 요구사항).

## 조작법 (카메라·선택)

| 조작 | 결과 |
|------|------|
| 좌클릭-드래그 | 카메라 궤도 회전 |
| 휠 / 트랙패드 | 확대·축소 |
| 우클릭-드래그 (터치: 두 손가락 드래그) | 팬 |
| 천체 클릭(탭) | 선택 + ease-in-out 카메라 포커스 + 인포 패널 표시 |
| 호버 | 이름·종류 툴팁 |
| 빈 공간 더블클릭 | 선택 해제, 전체 태양계로 |
| 제어 패널 `카메라 리셋` 버튼 / `리셋` | 선택 해제 후 전체 태양계 뷰로 돌아가기 |

선택 시 기본 뷰가 화면에 맞게 자동으로 거리를 잡는다. 행성을 누르면 그
행성과 위성이, 위성을 누르면 위성과 모행성이 함께 화면에 담기고, 태양을
누르면 전체 태양계가 다시 보인다. 초기 뷰는 Sun~Pluto가 한 화면에 들어오는
기울어진(수직 아닌) 시점이다.

## 패널 표시/숨김과 단축키

- 각 패널(헤더·제어·인포) 우 상단의 접기 버튼으로 개별 숨김/표시.
- `H` 키: 화면의 모든 UI 패널을 한 번에 숨기거나(스크린샷용) 이전 레이아웃대로
  되돌린다. 하단 독(dock)의 개별 복구 칩(`제어` 등)으로 하나씩 되살릴 수도 있다.
- 접어둔 상태에서도 천체를 클릭하면 인포 패널이 자동으로 다시 열린다.
- 토글 상태는 `localStorage["qwsolar.overlay.v1"]`에 저장되어 새로고침 후
  복원된다.
- 제어 패널: 재생/정지/리셋, 배속(1초=1일/10일/100일/1년, 기본 10일), 거리
  스케일(Log 기본·Linear·Focus), 크기 스케일(Enhanced 기본·Relative·Uniform),
  궤도선·이름표·위성·별배경 표시 토글, 카메라 리셋.

## 스케일 모드 뜻

- **거리 Log(기본)**: 중거리 로그 압축 — 안쪽 행성도 구분되고 밖까지 한 화면.
- **거리 Linear**: 실제 AU 비례. 수성~화성이 태양에 붙어 안 보이는 것이 목적
  (실제 거리 차의 극단성을 보여주는 비교 모드).
- **거리 Focus**: 선택 행성계를 중심으로 배치하고 바깥은 완만하게 압축.
- **크기 Enhanced(기본)**: 제곱근 압축+최소 가시 크기. 목성·토성≫지구 관계는
  유지하면서 명왕성·위성도 식별 가능.
- **크기 Relative**: 실제 비례 강조(크기 차이 부각).
- **크기 Uniform**: 전 천체 동일 마커 — 궤도 구조만 보는 모드.
- 렌더 거리·크기는 어디까지나 배치용 표시값이며 실제 물리 스케일이 아니다
  (우하단 고지문·인포 패널의 렌더 섹션이 매번 그 사실을 명시).

## 데이터

`src/data/solarSystemData.ts` 가 유일한 실데이터 소스이며, 렌더링 코드는
어떤 천문 수치도 하드코딩하지 않습니다. 필드: `radiusKm`, `semiMajorAxis`
(AU=일중심, km=위성), `eccentricity`, `inclinationDeg`, `orbitalPeriodDays`,
`rotationPeriodHours` (음수=역행 자전), `axialTiltDeg`, `jplId`, `nameKo`/
`nameEn`, `parentId`, 색·표현 메타데이터(`displayColor`, `render`).

### 출처 (2026-08-29 접근)

| # | 출처 | 사용 데이터 |
|---|------|-------------|
| S1 | JPL SSD Planetary Physical Parameters — https://ssd.jpl.nasa.gov/planets/phys_par.html | 행성·명왕성 평균 반지름(km), 항성시간 회전주기, 항성 공전주기. 기준: IAU Working Group (Archinal+2018), Explanatory Supplement to the Astronomical Almanac (Seidelmann 1992) |
| S2 | JPL SSD Approximate Positions of the Planets, Table 1 — https://ssd.jpl.nasa.gov/planets/approx_pos.html | 수성~해왕성 J2000 근점 요소 a(AU), e, i(°). Earth는 Earth/Moon Barycenter 값 |
| S3 | JPL SSD Satellite Mean Elements / Phys Par — https://ssd.jpl.nasa.gov/sats/elem/sep.html, https://ssd.jpl.nasa.gov/sats/phys_par/sep.html | 위성 공전 a(km), e, i, P(일), 평균 반지름. Jupiter=JUP365, Saturn=SAT441, Uranus=URA182, Neptune=NEP097, Pluto=PLU060 (Brozović & Jacobson 2024) |
| S4 | JPL SBDB API (134340 Pluto, DE441) — https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=134340&phys-par=true | 명왕성 궤도 a=39.6 AU, e=0.252, i=17.1° |
| — | NASA Sun Facts — https://science.nasa.gov/sun/facts/ | 태양 반지름 ≈695,700 km(지름 1.4M km), 적도 자전 ≈25일 |

변환 규칙: 연→일 ×365.25, 일→시간 ×24. 그 외 원값 사용.
달(Moon) 공전 주기는 조석 고정으로 자전과 동일.

### 접근 범위 노트
- Pluto 위성의 e/i는 PLU060 표기 정밀도에 맞춰 최소 유효숫자로 반올림 표기함
  (JPL mean-elements 표의 0.000 등 저정밀 값은 표 자체의 자릿수).
- 행성 `rotationPeriodHours` 부호는 IAU 규약(음수=역행: 금성·천왕성·명왕성) 유지.

### 검증
`src/data/validateSolarSystem.ts` 가 스펙 §15의 관계 검사를 수행:
id 중복/필수 필드, parentId 해석, 행성 거리·공전주기 순서, 목성·토성 ≫ 지구
크기, 명왕성 최고 이심률·경사, 위성 거리-주기 순서. DEV 모드에서 콘솔 출력.

## 스케일 공식 (렌더 ≠ 실데이터)

- **거리(log, 기본)**: `d = 16 + log1p(AU)/log1p(39.6) × (190−16)`
  (min/max는 스펙 §4 권장값, maxAU는 실데이터 최대 a)
- **거리(linear)**: `d = AU × 4.7` — 안쪽 행성 밀집이 목적(스펙 §4)
- **거리(focus)**: 선택 행성계를 화면 중심으로 두고, 모든 천체를 앵커 기준
  **실제 오프셋(AU)**으로 배치한 뒤 압축: 오프셋 ≤1.2AU는 준선형
  (`off × 0.75·26 units/AU`), 그 너머는 `log1p`로 캡(300 units)까지 완만하게
  압축. 행성·위성 구분 없이 모든 궤도선이 같은 매퍼를 지나므로
  천체와 궤도가 항상 일치한다(스펙 §4/§13).
- **위성 거리**: 모행성 Group 로컬 좌표. 크기는 반장축 a를 `log1p` 매핑해
  렌더 반지름의 2.5~9배 밴드에 올리고(매핑 범위는 반장축이 아니라 각 위성의
  실제 반지름 스팬 `a(1±e)`의 최솟값/최댓값 — 이심률이 큰 위성이나 단일
  위성계(달·트리톤)에서도 9배 밴드를 초과하지 않는다), 궤적 자체는 **궤도당
  단 하나의 등방 스케일(units/km)**로만 그려진다 — 반지름을 꼭짓점마다
  재매핑하지 않으므로 θ·a:b·e가 정확히 보존되어 타원이 타원으로 남는다
  (t_5a546f13 진단, t_d17906bf 수정, docs/orbit-shape-diagnosis.md). 행성
  선택 시 모계 밴드가 2.2배 확장(스펙 §13 디테일 뷰)되며 이 확장도 등방
  스케일이라 형태는 그대로다.
- ** 크기(enhanced, 기본)**: `clamp(0.55 + 0.65·√(R/R⊕), 0.55, 4.0)`, 위성은
  `clamp(0.16 + 0.4·√(R/R⊕), 0.16, 0.75)`, 태양 별도 고정 8
- **크기(relative)**: 실제 비례 강조 `clamp(0.25 + 0.35·(R/R⊕), 0.25, 6.5)`
- **크기(uniform)**: 전 천체 0.6 동일 마커
- 궤도 위상은 Kepler 방정식 수치해(Newton, tol 1e-6) + 평균이상 누적.
  위치는 simulation day 누적으로만 계산(프레임수 무관, 스펙 §8).

UI의 인포 패널과 우하단 고지는 렌더 값이 실제 물리 스케일이 아님을 명시합니다.

## 구조

```
src/
  main.ts                      # 부트스트랩: 렌더러·카메라·루프·UI 배선
  styles.css
  data/solarSystemData.ts      # 실데이터 (단일 소스)
  data/validateSolarSystem.ts  # 데이터 검증 유틸
  core/ScaleManager.ts         # 실데이터→렌더 단위 변환 (3거리·3크기 모드)
  core/SimulationClock.ts      # 배속/재생/정지/리셋
  core/Kepler.ts               # 케플러 방정식 수치해·궤도면 위치 (순수 함수)
  core/simMath.ts              # 자전각·경사도 매핑 순수 함수 (three/DOM 의존 없음)
  core/SolarSystem.ts          # 씬 그래프: 천체·링·별배경·위성 로컬계·전환 보간
  core/CameraTween.ts          # 카메라 포커스: 거리 매핑 + live-추적 ease-in-out 트윈 (pure)
  core/CelestialBody.ts        # Kepler 궤도 운동학·자전·디밍 (공유 지오메트리)
  core/OrbitRenderer.ts        # 궤도선 (init 시 생성, 스케일 변경 시만 갱신)
  ui/ControlPanel.ts           # 제어 HUD
  ui/InfoPanel.ts              # 툴팁 + 인포 (실값/렌더값 분리 표시)
  ui/Labels.ts                 # CSS2D 한/영 이름표
  ui/overlayState.ts           # 오버레이 토글 순수 상태·localStorage (t_30700e13)
  ui/OverlayManager.ts         # 접기 버튼·dock·H 단축키·ARIA·선택 이벤트 (t_30700e13)
```

## 후속 작업자를 위한 계약

- 천체 식별·선택 상태(t_766b495f): `core/bodyIdentity.ts`가 유일한 식별/상태
  계약. 천체 ID는 `CelestialBodyData.id`(부모는 `parentId`)이고, 씬 노드는
  `userData.bodyId`(mesh·group·링 모두)로만 자신을 advertised한다 —
  `name`("tilt:<id>" 등)은 장식용이니 절대 파싱하지 말 것. Mesh 자식(링 등)
  클릭 해석은 `resolveBodyIdFromObject(node)`: 부모 체인을 거치며 데이터셋에
  실재하는 첫 `userData.bodyId`를 채택, 없으면 null(빈 공간 — 예외 없음).
  선택 상태 전체(선택 ID/디테일 뷰 시스템 부모/focus 앵커)는 `selectionFor(id)`
  한 번의 파생으로 얻는다(위성 → parent, 항성 → null). Raycast 재귀 타깃은
  `SolarSystem.pickTargets()`(mesh+링), 좌표는 `getBoundingClientRect()` 기준
  NDC — dpr 무관, 창 크기 변경 후에도 정확. 위성의 `group.position`은
  parent-local(`coordFrameOf`)이므로 씬 비교는 반드시 `getWorldPosition()`.
  검증: `node scripts/body-identity.test.mjs` (14 항목, 순수).
- 오버레이 패널 토글(t_30700e13): `ui/overlayState.ts`(순수 상태·localStorage)와
  `ui/OverlayManager.ts`(DOM·dock·H 단축키·ARIA)가 계층 전체. `.panel`을
  `overlay.register(id, el)`로 등록하면 개별 접기 버튼이 주입된다.
  천체 선택은 반드시 `main.ts`의 `selectBody(id)` 1개 경유만 지나며, 여기서
  `qw:body-selected` 커스텀 이벤트(detail `{id}`)를 발행 → 인포 패널이
  개별/전역 숨김 상태에서도 자동 표시됨(`__qwOverlay.notifyBodySelected(id)`로
  직접 호출 가능, 테스트 지점). 토글 상태는 `localStorage["qwsolar.overlay.v1"]`.
  상태 전이 규칙 검증: `npm test`. 실제 브라우저 검증:
  `node scripts/overlay-browser-check.mjs` (headless Chrome + CDP, 28 항목).
- 렌더러 확장(t_a5d73491): `ScaleManager`·`SolarSystem`·`OrbitRenderer`가
  렌더링 계층, `SOLAR_SYSTEM`이 데이터 계층. 두 값을 혼용하지 말 것.
  모드 전환·시스템 선택은 `SolarSystem.animateScaleChange()`(0.7초 easeInOut
  보간; 스펙 §13 "interpolate, never snap")를 경유하고, 즉시 재매핑이 필요할
  때만 `refreshScales(simDays)`를 쓴다. 궤도선은 천체와 동일한 ScaleManager
  매퍼를 공유하므로 어떤 모드에서도 어긋지 않는다. 디테일 뷰에서는 무관한
  천체가 15% 불투명으로 디밍된다(`CelestialBody.setDimmed`).
  지오메트리는 공유 단위 구 1개(모듈 init 시 생성) — `disposeSharedGeometries()`
  는 `SolarSystem.dispose()`에서만 호출할 것.
- 시뮬레이션 시간(t_1f6e8acc): 위치·자전·경사도는 오직 누적 `simDays`의 함수
  (프레임수 무관, 스펙 §7/§8). Kepler 해는 Newton+이분법 브래킷으로 e<1 전
  구간 안정(`core/Kepler.ts`), 자전각·경사도 매핑은 순수 함수 `core/simMath.ts`
  에 있어 천체·위성·궤도선이 같은 수식을 공유한다. 배속 전환은
  `SimulationClock.setTimeScale(daysPerSecond)`, 재생/정지/리셋은
  `setPlaying/reset` — HUD는 `ControlPanel.setStatus()`가 초당 최대 5회 갱신
  (경과 시간·현재 배속·재생 상태). 크기/거리 모드 전환 보간과 카메라 트윈은
  실시간 dt 기반(`SolarSystem.update(simDays, dtSec)`) — 60fps 가정이 없다.
  검증: `node scripts/sim-time.test.mjs` (22 항목, 순수 수학),
  autotest의 `t_clock_*` 태그(정지 동결·리셋·배속), `scripts/hud-check.sh`.
- 라벨·인포 패널(t_d9203468): 실제값 표시 규칙은 `ui/format.ts`가 유일
  (순수·Node 테스트 `scripts/info-format.test.mjs` 11항목). 누락 데이터는
  절대 `undefined`/`NaN`으로 새지 않고 `MISSING_DISPLAY`("—")로 통일,
  km↔AU는 IAU 정확 상수(149,597,870.7 km) 하나로 동일 반올림 규칙을 공유해
  두 단위 표기가 서로 어긋나지 않는다. 이중 언어 이름은 `bilingualName`
  ("목성 · Jupiter") 단일 규칙. `InfoPanel`은 실데이터 섹션과 렌더 값
  섹션(`units`, "실데이터 아님" 명시)을 헤더로 분리하고, `showBody(id)`로
  선택을 받고 `refresh()`로만 갱신한다 — 프레임 루프(200ms)가 현재 선택을
  라이브 sim 시간으로 재렌더하므로 움직이는 천체·모드 전환과 항상 일치,
  직접 DOM 수정 경로가 없어 표시 상태가 갈라질 수 없다. 패널 개별/전역
  숨김 상태에서도 `selectBody` → `qw:body-selected` 경로로 자동 복구
  (`__qwVerify.select(id)`도 동일 경유). 검증:
  `node scripts/info-panel-browser-check.mjs` (headless Chrome CDP, 행성·
  위성과 선택·레이블 동기화·복구·420px까지).
- 카메라 포커스(t_31402ac4): 초점 경로 하나 — `main.reframeCamera()`가
  `selectionFor`로 파생된 선택 상태를 적용한 **뒤**에 `focusFrameFor(id)`로
  렌더 단위 입력(원래/부스팅 반지름 분리, parent-local 위성의 모계 렌더 링
  범위, 링 outer 반지름)을 만들어 `core/CameraTween.cameraFocusDistance()`에
  전달한다. 매핑: 행성·위성=max(모계 범위, 실효 반지름)×2.2, **항성(태양)
  선택=전역 거리 그대로**(명세 §9 "태양 선택 시 전체 태양계", 태양은 원점이라
  같은 화면), 미선택=340. 카메라와 focus 거리 스케일 매핑이 같은 숫자를 읽으므로 서로
  어긋날 수 없고, 거리 모드 전환·리셋도 같은 경유(`onDistanceMode`/
  `__qwVerify.setDistanceMode` → `reframeCamera`). 비행은 `CameraTween`이
  소유: 현재 카메라 상태(controls.target/camera.position)에서 시작해 시선
  방향을 유지하고, 매 스텝 `follow(out)`으로 천체의 **현재** 월드 위치를
  다시 읽어(sim 시간 병주 추적) 종료 스텝에서 target ≡ 월드 위치, 카메라는
  그로부터 정확히 mapping 거리. 도중 재선택은 `start()` 재호출로 이전 구간의
  적용이 중단되는 안전 취소, 완료 후 `update()`는 콜백도 부르지 않는 불능
  상태(dispose 안전), follow가 NaN을 주면 그 스텝을 건너뛴다. 검증:
  `node scripts/camera-focus.test.mjs` (14 항목, 순수), autotest의
  `t_cam_*` 태그(정지·moving target·위성 io·연속 재선택·focus 모드·전역 복귀).
- Raycaster 선택·포인터 생명주기(t_06891a0f): 입력 판정은 두 순수 모듈이
  전부 — `core/pickCoords.ndcFromClientPoint(x, y, rect)`는 클릭 지점을
  `getBoundingClientRect()` 기준 NDC로 변환(dpr 무관, 매 픽처 새 rect라
  창 크기·회전 후에도 정확, 0크기 rect는 예외 대신 null). tap-vs-drag 판정은
  `core/pointerGesture.TapGestureTracker`(순수): pointerdown/up 좌표로
  `TAP_MOVE_TOLERANCE_PX`(6px, 경계 포함) 이내 정지 탭만 허용, 두 번째
  포인터가 끼는 순간 제스처 전체가 실격(핀치 중 손가락을 하나씩 들어도 선택
  없음), 전부 해제될 때만 실격 초기화, pointercancel은 유령 down을 남기지
  않는다. `main.ts`는 canvas에 pointerdown/up/cancel+dblclick+pointermove를
  1회 등록하고 전부 named handler — `teardownPicking()`/`__qwTeardownPicking()`
  이 전역 teardown과 separately 제거 가능(중복 등록 없음). hover raycast는
  포인터가 내려간 동안(OrbitControls 드래그 중) 스킵. pick nearest-valid는
  `pickAt`가 `pickTargets()` 재귀 정렬 결과에서 `resolveBodyIdFromObject`로
  첫 유효 id를 채택(링 자식 → 행성), 빈 공간은 선택 유지·예외 없음, 빈 공간
  더블클릭만 선택 해제(기존 UX). 검증: `node scripts/pick-input.test.mjs`
  (18 항목, 순수) + `node scripts/pick-input-browser-check.mjs` (CDP
  실제 입력 16 항목: 행성·링 자식·위성 moon→earth 파생·빈 공간·더블클릭·
  드래그와 OrbitControls 병존·터치 탭·핀치 실격·dpr-2 리사이즈·애니메이션
  중 재선택·teardown, 콘솔 에러 0).
- 통합 teardown·리스너 회계(t_92052608): `teardownAll()`(beforeunload 및
  `__qwTeardownAll()`)이 rAF 루프(cancel 후 미재무장), canvas 픽처 5개 +
  OrbitControls 내부 리스너(`controls.dispose()`), window resize/beforeunload,
  오버레이, 씬 리소스를 한 번에 해제하고 중복 호출은 무해(idempotent).
  `VITE_VERIFY=1` 빌드에서는 `EventTarget.prototype` 회계 훅이 (target,
  이벤트)별 live 수를 세어(오버-리무브는 0에서 포화 — OrbitControls의
  add/remove churn 대응) 마운트 중에는 전부 live, teardown 후에는 전부
  0임을 증명. 프로덕션 빌드에는 dead code로 빠진다. 검증:
  `node scripts/integration-browser-check.mjs` (CDP 14 항목: 루프 정지,
  리스너 전량 해제, teardown 후 canvas 무반응, 리마운트 후 1회 재등록·
  선택 재작동, dpr-2 리사이즈 클릭, 콘솔 에러 0).
- 위성 궤도 형태 브라우저 회귀 (t_b4bcc438): `orbit-shape.test.mjs`가 Node에서
  실제 클래스를 검증한다면 `scripts/orbit-shape-browser-check.mjs`는 WebGL에
  실제 업로드된 LineLoop 버텍스를 CDP로 읽어 검증한다 — 25개 parent-local
  위성 전원의 타원 재구성(e′=실제 e, focus-conic 잔차 <1e-6)·본체- line 일치·
  2.5×~9×(×2.2 부스트) 밴드·log/linear/focus 비트 단위 동일성·행성 line
  회귀(focus 앵커 line 숨김 포함)·중심 천체 전환(전 위성계 + 달 직접 선택)
  후 레이아웃 유지·화면 사영에서 부모 구가 각 위성의 바깥 링 안에 포함됨.
  실행: `VITE_VERIFY=1 npm run build && npm run preview -- --port 5211` +
  headless Chrome `--remote-debugging-port=9333` 후
  `node scripts/orbit-shape-browser-check.mjs http://127.0.0.1:9333 http://localhost:5211/`
  (391 항목, 대표 스크린샷 8장 출력).
- 커밋 규약: `<type>: <summary> [<kanban-task-id>]`, 태스크 완료 시 1커밋.

## Known-limitations (이 단계 기준)

- focus 거리 모드는 앵커 중심 압축이라 타 행성의 궤도선 형태가 왜곡된다 —
  천체-궤도 일관성을 우선한 선택(스펙 §4 "local scale centered on the
  selected planetary system"). 절대 물리 궤도 형태가 필요한 비교는 linear
  모드를 쓸 것.
- 디테일 뷰 디밍은 mesh 불투명도에만 적용되고, 무관 천체의 궤도선은 그대로
  유지된다 — 의도된 디자인.
