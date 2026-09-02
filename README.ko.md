# QW Solar — 로그 스케일 태양계 데모

공개 저장소 이름: **solar-system-by-qwen-3.8-flash-next** (npm 패키지명 `qw-solar`)

Three.js 기반의 브라우저용 인터랙티브 태양계 시각화입니다. 태양부터 명왕성까지와 주요 위성을 실제 천문 데이터(NASA/JPL)로 표현하되, 화면 가독성을 위해 거리·크기의 *렌더 스케일*을 별도로 적용합니다. 시뮬레이션 위치·자전은 실제 공전/자전 주기를 누적 계산해 프레임수와 무관하게 동작합니다.

- 요구사항 원문: `docs/THREEJS_SOLAR_DEMO_PROMPT.md`
- 상세 설계·검증 문서(계약, 스케일 공식, 진단 노트): `README.md`, `docs/orbit-shape-diagnosis.md`

## 주요 기능

- Sun~Pluto + 주요 위성 25개, 실데이터 기반 Kepler 궤도 운동(뉴턴+이분법 수치해, e<1 전 구간 안정)
- 재생/정지/리셋과 배속(1초 = 1일/10일/100일/1년, 기본 10일)의 시뮬레이션 시간축
- 거리 스케일 3종(Log 기본·Linear·Focus), 크기 스케일 5종(Enhanced·Huge 기본(향상 ×3)·Gigantic(×10)·Relative·Uniform), 모드 전환은 0.7초 ease-in-out 보간
- 전 행성·주요 위성·명왕성/카론에 실제 NASA 촬영 기반 표면 텍스처 적용(`public/textures/`, 출처는 `public/textures/ATTRIBUTION.md`)
- 천체 클릭 선택 + 카메라 포커스 트윈, 호버 툴팁, 빈 공간 더블클릭으로 해제
- 8개 표시 언어(English·한국어·日本語·中文·Français·Deutsch·Español·العربية, 기본 영어)를 국기 버튼으로 전환(아랍어는 RTL), 천체 이름은 현재 선택 언어로만 표시, 패널 개별 접기·`H` 단축키 전체 숨김/복원, 접힌 상태에서도 선택 시 인포 패널 자동 복구
- 이름표·인포 패널의 실데이터/렌더값 분리 표시, km↔AU 동일 환산 상수 사용
- 상태(언어·패널 토글)는 브라우저 `localStorage`에만 저장, 서버 통신 없음

## 사전 요구 사항

| 항목 | 값 |
|------|----|
| Node.js | `^20.19.0 \|\| >=22.12.0` (Vite 8.2.2 요구사항) |
| 패키지 매니저 | npm (`package-lock.json` 동봉, lockfileVersion 3) |
| 런타임 의존성 | `three` ^0.185.1 |
| 개발 의존성 | `vite` ^8.2.2, `typescript` ^5.9.3, `@types/three` ^0.185.4 |
| 브라우저 | WebGL2 지원 모던 브라우저 (Chrome 권장, 브라우저 검증 스크립트는 macOS Chrome 경로 가정) |

## 설치 및 실행

```bash
npm install
npm run dev      # 개발 서버 (Vite, 터미널에 표시되는 URL로 접속)
npm run build    # tsc --noEmit + vite build → dist/
npm run preview  # 빌드 결과 로컬 확인
```

`dist/`와 `node_modules/`는 `.gitignore`에 포함되어 있어 커밋되지 않습니다.

## 설정 및 환경 변수 (안전 수칙)

- 이 앱은 **어떤 자격증명·API 키·시크릿도 필요로 하지 않습니다.** 천문 데이터는 `src/data/solarSystemData.ts`에 정적으로 내장되어 있고, 실행 중 외부 네트워크 호출이 없습니다.
- 유일한 빌드 옵션 환경변수는 `VITE_VERIFY=1`입니다. 지정 시 검증용 훅(`window.__qwVerify`, 리스너 회계)이 포함된 빌드가 만들어지며, 일반(미지정) 프로덕션 빌드에서는 죽은 코드로 제외됩니다. 보안 민감 정보가 아니라 테스트 계측기입니다.
- `.gitignore`가 `.env`, `.env.*`를 무시하므로 실수로 시크릿을 커밋할 경로가 차단되어 있습니다. 다만 현재 저장소에 `.env.example`는 없고 앱이 `.env`를 읽지도 않습니다.
- 브라우저에 저장되는 것은 `localStorage`의 두 키(`qwsolar.language.v1`, `qwsolar.overlay.v1`)뿐이며 개인 입력 정보는 어디로도 전송되지 않습니다.

## 사용 예

```bash
# 1) 개발 중 실시간 확인
npm install && npm run dev

# 2) 프로덕션 빌드 후 미리보기
npm run build && npm run preview

# 3) 검증 빌드로 브라우저 회귀 점검 (예: 위성 궤도 형태 검사)
VITE_VERIFY=1 npm run build
npm run preview -- --port 5211
# 별도 터미널에서 headless Chrome을 디버깅 포트로 띄운 뒤:
#   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
#     --headless=new --remote-debugging-port=9333 about:blank
node scripts/orbit-shape-browser-check.mjs http://127.0.0.1:9333 http://localhost:5211/
```

조작 요약 (상세는 `README.md` 조작법 표):

- 좌클릭 드래그 회전, 휠 확대/축소, 우클릭 드래그(터치 두 손가락) 팬
- 천체 클릭 → 선택 + 카메라 포커스 + 인포 패널, 빈 공간 더블클릭 → 선택 해제
- `H` → 모든 UI 패널 숨김/복원(스크린샷용), 헤더의 `EN / 한국어`로 언어 전환

## 검증 명령어

순수 Node 테스트(브라우저 불필요) — 8개 스위트, 이 커밋 기준 전부 통과 확인:

```bash
npm run typecheck   # tsc --noEmit (strict, noUncheckedIndexedAccess)
npm test            # overlay-state, sim-time, body-identity, pick-input,
                    # camera-focus, info-format, orbit-shape, i18n-parity
npm run build       # 타입검사 + 프로덕션 빌드
```

선택적 브라우저 검증(Chrome + 대개 `VITE_VERIFY=1` 서버 필요): `scripts/` 의 `autotest-verify.sh`, `orbit-shape-browser-check.mjs`, `language-browser-check.mjs`, `overlay-browser-check.mjs`, `pick-input-browser-check.mjs`, `integration-browser-check.mjs`, `info-panel-browser-check.mjs` 등. 각 스크립트 상단 주석에 실행 조건이 적혀 있습니다.

## 데이터와 출처

`src/data/solarSystemData.ts`가 유일한 실데이터 소스이며, 렌더링 코드는 천문 수치를 하드코딩하지 않습니다. `src/data/validateSolarSystem.ts`가 거리·주기 순서, 이심률·경사 관계 등 스펙 §15 검사를 DEV 모드 콘솔에서 수행합니다. 출처(2026-08-29 접근):

| 출처 | 사용 데이터 |
|------|-------------|
| JPL SSD Planetary Physical Parameters — https://ssd.jpl.nasa.gov/planets/phys_par.html | 행성·명왕성 반지름, 자전·공전 주기 |
| JPL SSD Approximate Positions (Table 1) — https://ssd.jpl.nasa.gov/planets/approx_pos.html | 수성~해왕성 J2000 궤도 요소 a, e, i |
| JPL SSD Satellite Mean Elements / Phys Par — https://ssd.jpl.nasa.gov/sats/elem/sep.html, https://ssd.jpl.nasa.gov/sats/phys_par/sep.html | 위성 궤도·반지름 (JUP365/SAT441/URA182/NEP097/PLU060) |
| JPL SBDB API (134340 Pluto, DE441) — https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=134340&phys-par=true | 명왕성 궤도 요소 |
| NASA Sun Facts — https://science.nasa.gov/sun/facts/ | 태양 반지름·자전 |

변환 규칙은 연→일 ×365.25, 일→시간 ×24이며 자전 주기의 음수 부호는 IAU 역행 자전 규약을 유지합니다.

## 렌더 스케일 (실데이터 아님)

화면 배치용 거리·크기는 물리 스케일이 아닙니다. 인포 패널의 렌더 섹션과 우하단 고지가 이 사실을 항상 명시합니다. 공식 전문과 모드별 의미는 `README.md` "스케일 공식" 절 참조. 핵심 원칙: 궤도선과 천체는 동일한 매퍼를 공유해 어떤 모드에서도 어긋나지 않으며, 위성 궤적은 궤도당 단 하나의 등방 스케일로 그려져 타원 형태(e, a:b)가 정확히 보존됩니다.

## 저장소 구조

```
src/
  main.ts                      # 부트스트랩: 렌더러·카메라·루프·UI 배선
  data/solarSystemData.ts      # 실데이터 (단일 소스)
  data/validateSolarSystem.ts  # 데이터 검증 유틸
  data/bodyTextures.ts         # 천체 id → 실사 표면 텍스처 파일 매핑
  data/bodyNames.ts            # 천체 id → 언어별 표시 이름 (ja/zh/fr/de/es/ar)
  core/                        # ScaleManager, SimulationClock, Kepler, simMath,
                               # SolarSystem, CameraTween, CelestialBody, textures,
                               # OrbitRenderer, bodyIdentity, pickCoords, pointerGesture
  ui/                          # ControlPanel, InfoPanel, Labels, i18n,
                               # overlayState, OverlayManager, format
  styles.css
public/textures/               # 실제 NASA 촬영 기반 표면 맵 + ATTRIBUTION.md
scripts/                       # 순수 Node 테스트(.test.mjs) + 헤드리스 Chrome 검증 스크립트
docs/                          # 요구사항 원문(THREEJS_SOLAR_DEMO_PROMPT.md), 궤도 형태 진단
index.html, vite.config.ts, tsconfig.json, package.json
```

## 알려진 제한

- Focus 거리 모드는 선택 계 중심으로 압축돼 다른 행성의 궤도선 형태가 왜곡됩니다(천체-궤도 일치 우선). 물리적으로 정확한 형태 비교는 Linear 모드를 사용하십시오.
- 디테일 뷰의 디밍은 천체 mesh 불투명도에만 적용되고, 무관 천체의 궤도선은 그대로 남습니다(의도된 디자인).
- `scripts/` 의 브라우저 검증 스크립트는 macOS의 Chrome 기본 경로와 localhost 디버깅 포트를 가정하며, CI용으로 설계되지 않았습니다.
- 이 저장소는 이전 비공개 개발 작업공간에서 증거 기반으로 **재구성(reconstructed)**한 것입니다(복원본이 아님). 복구 증거와 중간 산출물은 공개 저장소에 포함되지 않습니다.

## 라이선스 및 귀속

- **코드 라이선스는 아직 정의되지 않았습니다.** 저장소에 `LICENSE` 파일이 없고 `package.json`도 `private: true` 상태이므로, 코드 재배포·이용 조건은 공개 시점에 별도로 확정해야 합니다.
- 천문 데이터는 위 표의 NASA/JPL 공개 페이지에서 수집한 값이며, 출처 표기는 위 "데이터와 출처" 절과 `README.md`에 유지됩니다.
- 표면 텍스처는 Solar System Scope 텍스처 팩(CC BY 4.0)과 NASA 퍼블릭 도메인 모자이크(NOAA Science On a Sphere 경유)를 사용합니다 — 파일별 출처는 `public/textures/ATTRIBUTION.md` 참조.
