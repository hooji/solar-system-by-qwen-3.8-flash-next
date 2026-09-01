# 진단: 위성 궤적 라인이 타원이 아니라 cardioid 모양으로 그려지는 이유 (t_5a546f13)

결론: 위성(부모 지역 좌표계) 경로에서 거리 log 매핑이 **반지름 r(θ)에만** 적용되고
극각 θ는 그대로 보존된 채 재투영되기 때문이다. line과 body는 **서로 같은 공식**을
쓰므로 어긋나는 것이 아니라, 공유 공식 자체가 타원을 보존하지 않는다.

## 수치 근거 (달, scripts/orbit-shape.test.mjs가 그대로 재현)

- 실제 궤도: e = 0.0554, a:b = 1.0015:1 (거의 원)
- 렌더 밴드: 근일점 r_p=363,104 km → 2.5×, 원일점 r_a=405,696 km → 9× (부모 반지름 배수)
- log 매핑: `normalized = log1p(r − minKm) / log1p(maxKm − minKm)` (km 단위)
  → 중간 궤점(r=a)의 normalized = 0.935 (선형이면 0.5)
- 재구성 타원: 근·원일점 꼭짓점으로 만든 매핑 타원의 통축(radius at 90°) latus = 4.696
  인데 실제 렌더 반지름은 10.293 → **+119 % 과잉** → 근일점 쪽 오목짐(cardioid)
- 256개 샘플 좌표로 재구성한 타원: 긴 축이 **실제 단축 방향**(축 뒤집힘),
  e′ = 0.4286 (실제의 7.7배), 단위타원 적합 잔차 0.895 (진짜 타원이 아님)
- 같은 지문: Triton 1.119:1(e≈0), Phobos 1.150, Miranda 1.136, Io 1.118,
  Moon/Mimas ≈1.111. 다중 위성 계의 한가운데 위성은 normalized가 거의 상수라
  원에 가깝게 그려짐 — 원인( km 스케역 shifted range의 log1p 비선형성)을 역증명.
- 행성(태양 중심) log 모드도 같은 r-only 워프를 쓰지만 AU 단위라 훨씬 완만 —
  그래서 왜곡이 위성이에서 눈에 띄게 드러난다.

## 수정 대상 함수 (후속 작업자용)

1. `ScaleManager.mapSatelliteDistance` — 반지름 재매핑을 교체: 크기(근/원일점
   배수 2.5×→9×)를 **선형 스케일**로 매핑하든, 장·단축을 함께 매핑해서
   θ와 a:b 비율을 보존할 것.
2. `CelestialBody.updateFromSim` (moon 분기) / `OrbitRenderer.refresh`
   (isMoon 분기) — 공유 매퍼를 그대로 사용 중이므로 (1)만 고치면 자동 추종.
   단, 두 경로가 계속 같은定点 공식인지 `orbit-shape.test.mjs`가 감사한다.

## 수정 후 통과해야 할 속성 (test에 FIX-REVERSES 태그로 표시)

1. 각도 보존 (근일점 +x, 통축 교차 90°) — 현재도 만족
2. 일정한 a:b ≈ 실제 sqrt(1−e²) — 현재 위반(1.107:1, 축까지 뒤집힘)
3. 닫힌 루프 — 현재도 만족
4. line ≡ body 꼭짓점 단위 일치 — 현재도 만족

`node scripts/orbit-shape.test.mjs` (npm test 체인에 포함됨).

## 조치 완료 (t_d17906bf)

위 1~4를 **모든 거리 모드에서** 만족하도록 수정했다. FIX-REVERSES 태그는
삭제되고 속성 주장이 수정 후 계약으로 뒤집혔다(9 tests).

- `ScaleManager.satelliteOrbitScale(a, e, minKm, maxKm, parentR)`: 궤도당
  등방 스케일 1개만 결정 — 크기(mapSatelliteDistance(a), log 밴드)를
  a로 나눈 뒤 원일점이 밴드 천장(9×, 선택 시 ×2.2)을 넘지 않도록 캡.
  초점을 중심으로 한 등방 확대는 원추를 같은 e의 닮은 원추로 옮기므로
  θ·a:b·e가 정의상 보존된다.
- `ScaleManager.mapSatelliteOrbitRadius(r, a, e, …)` = 위 스케일 × r(θ).
  `OrbitRenderer.refresh`(isMoon 분기)와 `CelestialBody.moonRenderDistance`
  가 **이 하나의 함수**를 공유 → line ≡ body가 구조적으로 보장.
  `ScaleManager.renderedDistanceOf`의 위성 줄도 같은 경로를 써서 정보
  패널 수치가 실제 렌더 위치와 일치(스펙 §10).
- `mapSatelliteDistance`는 **크기 매핑 스칼라**로만 남음(위성 간 순서·
  카메라 프레이밍의 system extent, main.ts focusFrameFor). 더 이상
  r(θ)를 꼭짓점마다 통과시키지 않는다.
- 실측(수정 후): 달 a′:b′=1.00154(실제와 동일), 재구성 e′=0.055400(완전
  일치), 포커스-원추 적합 잔차 5.7e-8(float32 한계, 수정 전 0.895),
  트리톤 1.00000:1(완전 원), 합성 고이심률(e=0.25) 위성도 e′=0.250000
  유지·원일점 9× 천장 착지, 로그/선형/포커스 3모드 렌더 기하 동일.
