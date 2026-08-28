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
- **거리(focus)**: 선택 행성계 중심 로컬 좌표
- **위성 거리**: 모행성 Group 로컬, `log1p` 매핑 후 렌더 반지름의 2.5~9배 구간
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
  core/SolarSystem.ts          # 씬 그래프: 천체·링·별배경·위성 로컬계
  core/CelestialBody.ts        # Kepler 궤도 운동학
  core/OrbitRenderer.ts        # 궤도선 (init 시 생성, 스케일 변경 시만 갱신)
  ui/ControlPanel.ts           # 제어 HUD
  ui/InfoPanel.ts              # 툴팁 + 인포 (실값/렌더값 분리 표시)
  ui/Labels.ts                 # CSS2D 한/영 이름표
```

## 후속 작업자를 위한 계약

- 오버레이 패널 토글(t_30700e13): `.panel` 클래스 요소가 헤더/컨트롤/인포이며,
  인포 자동 표시는 `InfoPanel.showBody(id)` 호출 지점(main.ts pointerup)을
  훅이나 이벤트로 확장하면 됩니다.
- 렌더러 확장(t_a5d73491): `ScaleManager`·`SolarSystem`·`OrbitRenderer`가
  렌더링 계층, `SOLAR_SYSTEM`이 데이터 계층. 두 값을 혼용하지 말 것.
- 커밋 규약: `<type>: <summary> [<kanban-task-id>]`, 태스크 완료 시 1커밋.

## Known-limitations (이 단계 기준)

- focus 거리 모드는 스케일 전환만 제공하며 행성계 확대 전환 애니메이션은
  렌더러 태스크(t_a5d73491)에서 완성 예정.
- 패널 개별 접기/전역 H 토글·localStorage 복원은 t_30700e13 소관.
