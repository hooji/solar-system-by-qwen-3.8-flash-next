/**
 * i18n.ts — type-safe panel language foundation (task t_00139ab5 / root
 * t_ff056f3b). Two rules this module owns:
 *
 *  1. KEY PARITY AT COMPILE TIME. Korean is the source of truth for the key
 *     set (`KO`, `as const`); every other language is typed
 *     `Record<MessageKey, string>`, so the typecheck fails on ANY missing key
 *     (exhaustive mapped type) and on ANY extra key (excess-property check on
 *     the literal). A runtime check across ALL languages lives in
 *     scripts/i18n-parity.test.mjs (npm test), so the dictionaries can never
 *     drift apart silently.
 *  2. THE LANGUAGE IS APP STATE, NOT A WIDGET STRING. Panels read `t(key)`
 *     and subscribe through `onLangChange` — later panel-localisation tasks
 *     reuse this API instead of hardcoding.
 *
 * Default language is English. The explicit language choice persists under
 * LANGUAGE_STORAGE_KEY and is restored on reload. A missing value, an
 * invalid value, or a storage access failure (private mode / disabled) all
 * fall back to English safely — same tolerance pattern as overlayState.ts.
 *
 * Body names are NOT dictionary keys — they live in data/solarSystemData.ts
 * (ko/en) plus data/bodyNames.ts (other languages) and render through
 * ui/format.ts bodyDisplayName.
 */

/** Display order of the header language buttons = declaration order. */
export const LANGS = ["en", "ko", "ja", "zh", "fr", "de", "es", "ar"] as const;
export type Lang = (typeof LANGS)[number];

/** Small flag shown on each language button (regional-indicator emoji). */
export const LANG_FLAGS: Readonly<Record<Lang, string>> = {
  en: "🇺🇸",
  ko: "🇰🇷",
  ja: "🇯🇵",
  zh: "🇨🇳",
  fr: "🇫🇷",
  de: "🇩🇪",
  es: "🇪🇸",
  ar: "🇸🇦",
};

/** Right-to-left display languages (document dir follows the language). */
export const RTL_LANGS: ReadonlySet<Lang> = new Set<Lang>(["ar"]);

/** Explicit localStorage key for the language choice (survives reload). */
export const LANGUAGE_STORAGE_KEY = "qwsolar.language.v1";

/** Korean messages — the source of truth for the key set. */
const KO = {
  "header.title": "로그 태양계 · Logarithmic Solar System",
  "header.subtitle": "실제 천문 데이터를 로그 스케일로 압축한 시각화입니다.",
  "header.langGroup": "표시 언어",
  // Language button labels are AUTONYMS — each language's own name, shown
  // identically in every dictionary (parity: lang.* is exempt from the
  // translated-value check, not from key parity).
  "lang.en": "English",
  "lang.ko": "한국어",
  "lang.ja": "日本語",
  "lang.zh": "中文",
  "lang.fr": "Français",
  "lang.de": "Deutsch",
  "lang.es": "Español",
  "lang.ar": "العربية",
  "disclaimer.text":
    "이 시각화는 실제 천문 데이터를 사용하지만, 궤도 거리는 로그 스케일로 압축되고 천체 크기는 화면 가독성을 위해 과장됩니다. 렌더 크기와 렌더 거리는 하나의 동일한 물리 스케일을 공유하지 않습니다.",

  // --- panel titles / overlay dock (t_292b0645) ------------------------------
  "panel.header": "헤더",
  "panel.control": "제어",
  "panel.info": "인포",
  "overlay.dockAria": "오버레이 패널 복구",
  "overlay.restore": "모두 복구",
  "overlay.hideAll": "패널 숨김",
  "overlay.showAll": "패널 표시",
  "overlay.globalTitle": "모든 오버레이 숨김/표시 (단축키 H)",
  "overlay.collapseAria": "{label} 패널 {verb}",
  "overlay.verbHide": "숨기기",
  "overlay.verbShow": "표시",

  // --- control panel ----------------------------------------------------------
  "control.aria": "시뮬레이션 제어",
  "control.play": "재생",
  "control.pause": "정지",
  "control.reset": "리셋",
  "control.speed": "배속",
  "control.now": "현재 {speed} · {state}",
  "control.statePlaying": "재생 중",
  "control.statePaused": "정지",
  "control.distScale": "거리 스케일",
  "control.sizeScale": "크기 스케일",
  "control.orbits": "궤도선",
  "control.labels": "이름표",
  "control.moons": "위성",
  "control.stars": "별배경",
  "control.camReset": "카메라 리셋",
  "ts.secDay": "1초 = 1일",
  "ts.secTenDays": "1초 = 10일",
  "ts.secHundredDays": "1초 = 100일",
  "ts.secYear": "1초 = 1년",
  "ts.days": "1초 = {v}일",
  "ts.hours": "1초 = {v}시간",
  "sim.elapsedDays": "{value} 일 경과",
  "sim.elapsedYears": "{value} 년 경과",

  // --- info panel rows / separators --------------------------------------------
  "info.aria": "천체 정보",
  "info.sep.real": "실제 천문 데이터 (real astronomical data)",
  "info.sep.render": "화면 렌더 값 — 배치용, 실데이터 아님 (render values)",
  "info.sep.mode": "화면 표현 (display modes)",
  "info.kind": "종류",
  "info.radius": "실제 평균 반지름",
  "info.avgDist": "평균 거리 (반장축)",
  "info.liveDist": "현재 실제 거리",
  "info.period": "공전 주기",
  "info.rotation": "자전 주기",
  "info.ecc": "이심률 (무차원)",
  "info.incl": "공전 경사 (deg)",
  "info.renderRadius": "렌더 반지름",
  "info.renderDist": "렌더 거리",
  "info.distMode": "거리 표현",
  "info.sizeMode": "크기 표현",
  "info.moons": "위성 목록",
  // Body names render in the CURRENT language only ({name} is resolved by
  // the caller through bodyDisplayName) — never as a bilingual pair.
  "info.ref.moon": "{name} 기준",
  "info.ref.sun": "태양 기준",
  "type.star": "항성",
  "type.planet": "행성",
  "type.dwarf-planet": "왜소행성",
  "type.moon": "위성",

  // --- scale-mode labels / distance reference labels ----------------------------
  "scale.dist.log": "로그 거리 스케일 (log scale)",
  "scale.dist.linear": "선형 거리 스케일 (linear scale)",
  "scale.dist.focus": "포커스 스케일 — {name} 중심 (focus scale)",
  "scale.dist.focusSun": "포커스 스케일 — 태양 중심",
  "scale.size.enhanced": "가시성 향상 크기 (enhanced)",
  "scale.size.huge": "거대 크기 (huge, 향상 ×3)",
  "scale.size.gigantic": "초거대 크기 (gigantic, 향상 ×10)",
  "scale.size.relative": "상대 크기 강조 (relative)",
  "scale.size.uniform": "균일 마커 (uniform)",
  "scale.from.parent": "{name} 기준 (parent-local)",
  "scale.from.focus": "기준 {name} (focus)",
  "scale.from.sun": "태양 기준",

  // --- data-label priority (t_8701c121) ---------------------------------------
  // Unit WORDS and the retrograde marker follow the language; Latin unit
  // SYMBOLS (km/AU/h/units/°) are identical everywhere and are not keys.
  "unit.day": "일",
  "unit.days": "일",
  "unit.year": "년",
  "unit.years": "년",
  "rotation.retrograde": "역행(retrograde)",
} as const;

/** Every message key in the app (derived from the Korean dictionary). */
export type MessageKey = keyof typeof KO;

/**
 * The per-language label keys. Compile-time proof they are real MessageKeys:
 * `_LABEL_KEYS_ARE_MESSAGES` only typechecks while the template-literal type
 * stays a subset of MessageKey (renaming a lang label key breaks the build).
 */
export type LangLabelKey = `lang.${Lang}`;
const _LABEL_KEYS_ARE_MESSAGES: Record<LangLabelKey, MessageKey> = {
  "lang.en": "lang.en",
  "lang.ko": "lang.ko",
  "lang.ja": "lang.ja",
  "lang.zh": "lang.zh",
  "lang.fr": "lang.fr",
  "lang.de": "lang.de",
  "lang.es": "lang.es",
  "lang.ar": "lang.ar",
};
void _LABEL_KEYS_ARE_MESSAGES;

/** Shared autonym block — identical in every dictionary (see KO comment). */
const LANG_AUTONYMS: Record<LangLabelKey, string> = {
  "lang.en": "English",
  "lang.ko": "한국어",
  "lang.ja": "日本語",
  "lang.zh": "中文",
  "lang.fr": "Français",
  "lang.de": "Deutsch",
  "lang.es": "Español",
  "lang.ar": "العربية",
};

/**
 * English messages. `Record<MessageKey, string>` over a literal object is
 * checked BOTH ways: every ko key must be present (missing ⇒ type error)
 * and no key outside MessageKey may be added (excess-property ⇒ type error).
 * The same pattern types every non-Korean dictionary below.
 */
const EN: Record<MessageKey, string> = {
  "header.title": "Logarithmic Solar System",
  "header.subtitle": "A visualization that compresses real astronomical data onto a logarithmic scale.",
  "header.langGroup": "Display language",
  ...LANG_AUTONYMS,
  "disclaimer.text":
    "This visualization uses real astronomical data, but orbital distances are compressed on a logarithmic scale and body sizes are exaggerated for on-screen readability. Render size and render distance do not share a single common physical scale.",

  "panel.header": "Header",
  "panel.control": "Control",
  "panel.info": "Info",
  "overlay.dockAria": "Restore overlay panels",
  "overlay.restore": "Restore all",
  "overlay.hideAll": "Hide panels",
  "overlay.showAll": "Show panels",
  "overlay.globalTitle": "Hide / show all overlays (hotkey H)",
  "overlay.collapseAria": "{label} panel {verb}",
  "overlay.verbHide": "hide",
  "overlay.verbShow": "show",

  "control.aria": "Simulation control",
  "control.play": "Play",
  "control.pause": "Pause",
  "control.reset": "Reset",
  "control.speed": "Speed",
  "control.now": "Now {speed} · {state}",
  "control.statePlaying": "playing",
  "control.statePaused": "paused",
  "control.distScale": "Distance scale",
  "control.sizeScale": "Size scale",
  "control.orbits": "Orbits",
  "control.labels": "Labels",
  "control.moons": "Moons",
  "control.stars": "Starfield",
  "control.camReset": "Reset camera",
  "ts.secDay": "1s = 1 day",
  "ts.secTenDays": "1s = 10 days",
  "ts.secHundredDays": "1s = 100 days",
  "ts.secYear": "1s = 1 year",
  "ts.days": "1s = {v} days",
  "ts.hours": "1s = {v} hours",
  "sim.elapsedDays": "{value} days elapsed",
  "sim.elapsedYears": "{value} years elapsed",

  "info.aria": "Celestial body info",
  "info.sep.real": "Real astronomical data",
  "info.sep.render": "Render values — for screen layout, NOT real data",
  "info.sep.mode": "Display modes",
  "info.kind": "Type",
  "info.radius": "Mean real radius",
  "info.avgDist": "Mean distance (semi-major axis)",
  "info.liveDist": "Current real distance",
  "info.period": "Orbital period",
  "info.rotation": "Rotation period",
  "info.ecc": "Eccentricity (dimensionless)",
  "info.incl": "Orbital inclination (deg)",
  "info.renderRadius": "Render radius",
  "info.renderDist": "Render distance",
  "info.distMode": "Distance display",
  "info.sizeMode": "Size display",
  "info.moons": "Moons",
  "info.ref.moon": "relative to {name}",
  "info.ref.sun": "relative to the Sun",
  "type.star": "Star",
  "type.planet": "Planet",
  "type.dwarf-planet": "Dwarf planet",
  "type.moon": "Moon",

  "scale.dist.log": "Log distance scale",
  "scale.dist.linear": "Linear distance scale",
  "scale.dist.focus": "Focus scale — centred on {name}",
  "scale.dist.focusSun": "Focus scale — centred on the Sun",
  "scale.size.enhanced": "Enhanced visibility size",
  "scale.size.huge": "Huge size (enhanced ×3)",
  "scale.size.gigantic": "Gigantic size (enhanced ×10)",
  "scale.size.relative": "Relative size emphasis",
  "scale.size.uniform": "Uniform markers",
  "scale.from.parent": "from {name} (parent-local)",
  "scale.from.focus": "from {name} (focus)",
  "scale.from.sun": "from the Sun",

  "unit.day": "day",
  "unit.days": "days",
  "unit.year": "year",
  "unit.years": "years",
  "rotation.retrograde": "retrograde",
};

const JA: Record<MessageKey, string> = {
  "header.title": "対数スケール太陽系",
  "header.subtitle": "実際の天文データを対数スケールに圧縮した可視化です。",
  "header.langGroup": "表示言語",
  ...LANG_AUTONYMS,
  "disclaimer.text":
    "この可視化は実際の天文データを使用していますが、軌道距離は対数スケールで圧縮され、天体の大きさは画面の見やすさのために誇張されています。レンダリング上の大きさと距離は同一の物理スケールを共有していません。",

  "panel.header": "ヘッダー",
  "panel.control": "コントロール",
  "panel.info": "情報",
  "overlay.dockAria": "オーバーレイパネルの復元",
  "overlay.restore": "すべて復元",
  "overlay.hideAll": "パネルを隠す",
  "overlay.showAll": "パネルを表示",
  "overlay.globalTitle": "すべてのオーバーレイを隠す／表示（ショートカット H）",
  "overlay.collapseAria": "{label}パネルを{verb}",
  "overlay.verbHide": "隠す",
  "overlay.verbShow": "表示",

  "control.aria": "シミュレーション操作",
  "control.play": "再生",
  "control.pause": "一時停止",
  "control.reset": "リセット",
  "control.speed": "速度",
  "control.now": "現在 {speed} · {state}",
  "control.statePlaying": "再生中",
  "control.statePaused": "停止中",
  "control.distScale": "距離スケール",
  "control.sizeScale": "大きさスケール",
  "control.orbits": "軌道線",
  "control.labels": "名前ラベル",
  "control.moons": "衛星",
  "control.stars": "星空背景",
  "control.camReset": "カメラをリセット",
  "ts.secDay": "1秒 = 1日",
  "ts.secTenDays": "1秒 = 10日",
  "ts.secHundredDays": "1秒 = 100日",
  "ts.secYear": "1秒 = 1年",
  "ts.days": "1秒 = {v}日",
  "ts.hours": "1秒 = {v}時間",
  "sim.elapsedDays": "経過 {value} 日",
  "sim.elapsedYears": "経過 {value} 年",

  "info.aria": "天体情報",
  "info.sep.real": "実際の天文データ",
  "info.sep.render": "レンダリング値 — 画面配置用、実データではありません",
  "info.sep.mode": "表示モード",
  "info.kind": "種類",
  "info.radius": "実際の平均半径",
  "info.avgDist": "平均距離（軌道長半径）",
  "info.liveDist": "現在の実距離",
  "info.period": "公転周期",
  "info.rotation": "自転周期",
  "info.ecc": "離心率（無次元）",
  "info.incl": "軌道傾斜角 (deg)",
  "info.renderRadius": "レンダリング半径",
  "info.renderDist": "レンダリング距離",
  "info.distMode": "距離表示",
  "info.sizeMode": "大きさ表示",
  "info.moons": "衛星一覧",
  "info.ref.moon": "{name}基準",
  "info.ref.sun": "太陽基準",
  "type.star": "恒星",
  "type.planet": "惑星",
  "type.dwarf-planet": "準惑星",
  "type.moon": "衛星",

  "scale.dist.log": "対数距離スケール",
  "scale.dist.linear": "線形距離スケール",
  "scale.dist.focus": "フォーカススケール — {name}中心",
  "scale.dist.focusSun": "フォーカススケール — 太陽中心",
  "scale.size.enhanced": "視認性強化サイズ",
  "scale.size.huge": "特大サイズ（強化 ×3）",
  "scale.size.gigantic": "超特大サイズ（強化 ×10）",
  "scale.size.relative": "相対サイズ強調",
  "scale.size.uniform": "均一マーカー",
  "scale.from.parent": "{name}基準（親天体系）",
  "scale.from.focus": "{name}基準（フォーカス）",
  "scale.from.sun": "太陽基準",

  "unit.day": "日",
  "unit.days": "日",
  "unit.year": "年",
  "unit.years": "年",
  "rotation.retrograde": "逆行",
};

const ZH: Record<MessageKey, string> = {
  "header.title": "对数太阳系",
  "header.subtitle": "将真实天文数据压缩到对数尺度上的可视化。",
  "header.langGroup": "显示语言",
  ...LANG_AUTONYMS,
  "disclaimer.text":
    "本可视化使用真实天文数据，但轨道距离按对数尺度压缩，天体大小为便于屏幕阅读而放大。渲染大小与渲染距离并不共享同一物理尺度。",

  "panel.header": "标题栏",
  "panel.control": "控制",
  "panel.info": "信息",
  "overlay.dockAria": "恢复浮层面板",
  "overlay.restore": "全部恢复",
  "overlay.hideAll": "隐藏面板",
  "overlay.showAll": "显示面板",
  "overlay.globalTitle": "隐藏/显示所有面板（快捷键 H）",
  "overlay.collapseAria": "{verb}{label}面板",
  "overlay.verbHide": "隐藏",
  "overlay.verbShow": "显示",

  "control.aria": "模拟控制",
  "control.play": "播放",
  "control.pause": "暂停",
  "control.reset": "重置",
  "control.speed": "速度",
  "control.now": "当前 {speed} · {state}",
  "control.statePlaying": "播放中",
  "control.statePaused": "已暂停",
  "control.distScale": "距离尺度",
  "control.sizeScale": "大小尺度",
  "control.orbits": "轨道线",
  "control.labels": "名称标签",
  "control.moons": "卫星",
  "control.stars": "星空背景",
  "control.camReset": "重置相机",
  "ts.secDay": "1秒 = 1天",
  "ts.secTenDays": "1秒 = 10天",
  "ts.secHundredDays": "1秒 = 100天",
  "ts.secYear": "1秒 = 1年",
  "ts.days": "1秒 = {v}天",
  "ts.hours": "1秒 = {v}小时",
  "sim.elapsedDays": "已经过 {value} 天",
  "sim.elapsedYears": "已经过 {value} 年",

  "info.aria": "天体信息",
  "info.sep.real": "真实天文数据",
  "info.sep.render": "渲染值 — 仅用于屏幕布局，并非真实数据",
  "info.sep.mode": "显示模式",
  "info.kind": "类型",
  "info.radius": "真实平均半径",
  "info.avgDist": "平均距离（半长轴）",
  "info.liveDist": "当前真实距离",
  "info.period": "公转周期",
  "info.rotation": "自转周期",
  "info.ecc": "离心率（无量纲）",
  "info.incl": "轨道倾角 (deg)",
  "info.renderRadius": "渲染半径",
  "info.renderDist": "渲染距离",
  "info.distMode": "距离显示",
  "info.sizeMode": "大小显示",
  "info.moons": "卫星列表",
  "info.ref.moon": "相对于{name}",
  "info.ref.sun": "相对于太阳",
  "type.star": "恒星",
  "type.planet": "行星",
  "type.dwarf-planet": "矮行星",
  "type.moon": "卫星",

  "scale.dist.log": "对数距离尺度",
  "scale.dist.linear": "线性距离尺度",
  "scale.dist.focus": "聚焦尺度 — 以{name}为中心",
  "scale.dist.focusSun": "聚焦尺度 — 以太阳为中心",
  "scale.size.enhanced": "增强可见性大小",
  "scale.size.huge": "巨大尺寸（增强 ×3）",
  "scale.size.gigantic": "超巨尺寸（增强 ×10）",
  "scale.size.relative": "相对大小强调",
  "scale.size.uniform": "统一标记",
  "scale.from.parent": "距{name}（母星系）",
  "scale.from.focus": "距{name}（聚焦）",
  "scale.from.sun": "距太阳",

  "unit.day": "天",
  "unit.days": "天",
  "unit.year": "年",
  "unit.years": "年",
  "rotation.retrograde": "逆行",
};

const FR: Record<MessageKey, string> = {
  "header.title": "Système solaire logarithmique",
  "header.subtitle": "Une visualisation qui compresse des données astronomiques réelles sur une échelle logarithmique.",
  "header.langGroup": "Langue d'affichage",
  ...LANG_AUTONYMS,
  "disclaimer.text":
    "Cette visualisation utilise des données astronomiques réelles, mais les distances orbitales sont compressées sur une échelle logarithmique et la taille des corps est exagérée pour la lisibilité à l'écran. Taille et distance de rendu ne partagent pas une même échelle physique.",

  "panel.header": "En-tête",
  "panel.control": "Commandes",
  "panel.info": "Infos",
  "overlay.dockAria": "Restaurer les panneaux",
  "overlay.restore": "Tout restaurer",
  "overlay.hideAll": "Masquer les panneaux",
  "overlay.showAll": "Afficher les panneaux",
  "overlay.globalTitle": "Masquer / afficher tous les panneaux (raccourci H)",
  "overlay.collapseAria": "Panneau {label} — {verb}",
  "overlay.verbHide": "masquer",
  "overlay.verbShow": "afficher",

  "control.aria": "Commandes de simulation",
  "control.play": "Lecture",
  "control.pause": "Pause",
  "control.reset": "Réinitialiser",
  "control.speed": "Vitesse",
  "control.now": "Actuellement {speed} · {state}",
  "control.statePlaying": "en lecture",
  "control.statePaused": "en pause",
  "control.distScale": "Échelle de distance",
  "control.sizeScale": "Échelle de taille",
  "control.orbits": "Orbites",
  "control.labels": "Étiquettes",
  "control.moons": "Lunes",
  "control.stars": "Fond étoilé",
  "control.camReset": "Réinitialiser la caméra",
  "ts.secDay": "1s = 1 jour",
  "ts.secTenDays": "1s = 10 jours",
  "ts.secHundredDays": "1s = 100 jours",
  "ts.secYear": "1s = 1 an",
  "ts.days": "1s = {v} jours",
  "ts.hours": "1s = {v} heures",
  "sim.elapsedDays": "{value} jours écoulés",
  "sim.elapsedYears": "{value} années écoulées",

  "info.aria": "Informations sur le corps céleste",
  "info.sep.real": "Données astronomiques réelles",
  "info.sep.render": "Valeurs de rendu — mise en page écran, PAS des données réelles",
  "info.sep.mode": "Modes d'affichage",
  "info.kind": "Type",
  "info.radius": "Rayon moyen réel",
  "info.avgDist": "Distance moyenne (demi-grand axe)",
  "info.liveDist": "Distance réelle actuelle",
  "info.period": "Période orbitale",
  "info.rotation": "Période de rotation",
  "info.ecc": "Excentricité (sans dimension)",
  "info.incl": "Inclinaison orbitale (deg)",
  "info.renderRadius": "Rayon de rendu",
  "info.renderDist": "Distance de rendu",
  "info.distMode": "Affichage des distances",
  "info.sizeMode": "Affichage des tailles",
  "info.moons": "Lunes",
  "info.ref.moon": "par rapport à {name}",
  "info.ref.sun": "par rapport au Soleil",
  "type.star": "Étoile",
  "type.planet": "Planète",
  "type.dwarf-planet": "Planète naine",
  "type.moon": "Lune",

  "scale.dist.log": "Échelle de distance logarithmique",
  "scale.dist.linear": "Échelle de distance linéaire",
  "scale.dist.focus": "Échelle focus — centrée sur {name}",
  "scale.dist.focusSun": "Échelle focus — centrée sur le Soleil",
  "scale.size.enhanced": "Taille à visibilité renforcée",
  "scale.size.huge": "Taille énorme (renforcée ×3)",
  "scale.size.gigantic": "Taille gigantesque (renforcée ×10)",
  "scale.size.relative": "Accent sur la taille relative",
  "scale.size.uniform": "Marqueurs uniformes",
  "scale.from.parent": "depuis {name} (référentiel parent)",
  "scale.from.focus": "depuis {name} (focus)",
  "scale.from.sun": "depuis le Soleil",

  "unit.day": "jour",
  "unit.days": "jours",
  "unit.year": "an",
  "unit.years": "ans",
  "rotation.retrograde": "rétrograde",
};

const DE: Record<MessageKey, string> = {
  "header.title": "Logarithmisches Sonnensystem",
  "header.subtitle": "Eine Visualisierung, die reale astronomische Daten auf eine logarithmische Skala komprimiert.",
  "header.langGroup": "Anzeigesprache",
  ...LANG_AUTONYMS,
  "disclaimer.text":
    "Diese Visualisierung verwendet reale astronomische Daten, aber die Bahnabstände sind logarithmisch komprimiert und die Größen der Körper zur besseren Lesbarkeit überzeichnet. Darstellungsgröße und Darstellungsabstand teilen sich keine gemeinsame physikalische Skala.",

  "panel.header": "Kopfzeile",
  "panel.control": "Steuerung",
  "panel.info": "Info",
  "overlay.dockAria": "Overlay-Panels wiederherstellen",
  "overlay.restore": "Alle wiederherstellen",
  "overlay.hideAll": "Panels ausblenden",
  "overlay.showAll": "Panels einblenden",
  "overlay.globalTitle": "Alle Overlays aus-/einblenden (Taste H)",
  "overlay.collapseAria": "Panel {label} {verb}",
  "overlay.verbHide": "ausblenden",
  "overlay.verbShow": "einblenden",

  "control.aria": "Simulationssteuerung",
  "control.play": "Abspielen",
  "control.pause": "Pause",
  "control.reset": "Zurücksetzen",
  "control.speed": "Tempo",
  "control.now": "Jetzt {speed} · {state}",
  "control.statePlaying": "läuft",
  "control.statePaused": "pausiert",
  "control.distScale": "Distanzskala",
  "control.sizeScale": "Größenskala",
  "control.orbits": "Bahnlinien",
  "control.labels": "Beschriftungen",
  "control.moons": "Monde",
  "control.stars": "Sternenhimmel",
  "control.camReset": "Kamera zurücksetzen",
  "ts.secDay": "1s = 1 Tag",
  "ts.secTenDays": "1s = 10 Tage",
  "ts.secHundredDays": "1s = 100 Tage",
  "ts.secYear": "1s = 1 Jahr",
  "ts.days": "1s = {v} Tage",
  "ts.hours": "1s = {v} Stunden",
  "sim.elapsedDays": "{value} Tage vergangen",
  "sim.elapsedYears": "{value} Jahre vergangen",

  "info.aria": "Himmelskörper-Info",
  "info.sep.real": "Reale astronomische Daten",
  "info.sep.render": "Darstellungswerte — nur Bildschirmlayout, KEINE realen Daten",
  "info.sep.mode": "Anzeigemodi",
  "info.kind": "Typ",
  "info.radius": "Realer mittlerer Radius",
  "info.avgDist": "Mittlere Entfernung (große Halbachse)",
  "info.liveDist": "Aktuelle reale Entfernung",
  "info.period": "Umlaufzeit",
  "info.rotation": "Rotationsperiode",
  "info.ecc": "Exzentrizität (dimensionslos)",
  "info.incl": "Bahnneigung (deg)",
  "info.renderRadius": "Darstellungsradius",
  "info.renderDist": "Darstellungsentfernung",
  "info.distMode": "Distanzanzeige",
  "info.sizeMode": "Größenanzeige",
  "info.moons": "Monde",
  "info.ref.moon": "relativ zu {name}",
  "info.ref.sun": "relativ zur Sonne",
  "type.star": "Stern",
  "type.planet": "Planet",
  "type.dwarf-planet": "Zwergplanet",
  "type.moon": "Mond",

  "scale.dist.log": "Logarithmische Distanzskala",
  "scale.dist.linear": "Lineare Distanzskala",
  "scale.dist.focus": "Fokusskala — zentriert auf {name}",
  "scale.dist.focusSun": "Fokusskala — zentriert auf die Sonne",
  "scale.size.enhanced": "Größe mit verbesserter Sichtbarkeit",
  "scale.size.huge": "Riesige Größe (verbessert ×3)",
  "scale.size.gigantic": "Gigantische Größe (verbessert ×10)",
  "scale.size.relative": "Betonung relativer Größen",
  "scale.size.uniform": "Einheitliche Marker",
  "scale.from.parent": "von {name} (Muttersystem)",
  "scale.from.focus": "von {name} (Fokus)",
  "scale.from.sun": "von der Sonne",

  "unit.day": "Tag",
  "unit.days": "Tage",
  "unit.year": "Jahr",
  "unit.years": "Jahre",
  "rotation.retrograde": "retrograd",
};

const ES: Record<MessageKey, string> = {
  "header.title": "Sistema solar logarítmico",
  "header.subtitle": "Una visualización que comprime datos astronómicos reales en una escala logarítmica.",
  "header.langGroup": "Idioma de la interfaz",
  ...LANG_AUTONYMS,
  "disclaimer.text":
    "Esta visualización usa datos astronómicos reales, pero las distancias orbitales están comprimidas en una escala logarítmica y los tamaños de los cuerpos están exagerados para facilitar la lectura en pantalla. El tamaño y la distancia de render no comparten una misma escala física.",

  "panel.header": "Cabecera",
  "panel.control": "Controles",
  "panel.info": "Información",
  "overlay.dockAria": "Restaurar paneles",
  "overlay.restore": "Restaurar todo",
  "overlay.hideAll": "Ocultar paneles",
  "overlay.showAll": "Mostrar paneles",
  "overlay.globalTitle": "Ocultar/mostrar todos los paneles (tecla H)",
  "overlay.collapseAria": "Panel {label}: {verb}",
  "overlay.verbHide": "ocultar",
  "overlay.verbShow": "mostrar",

  "control.aria": "Control de la simulación",
  "control.play": "Reproducir",
  "control.pause": "Pausa",
  "control.reset": "Reiniciar",
  "control.speed": "Velocidad",
  "control.now": "Ahora {speed} · {state}",
  "control.statePlaying": "reproduciendo",
  "control.statePaused": "en pausa",
  "control.distScale": "Escala de distancia",
  "control.sizeScale": "Escala de tamaño",
  "control.orbits": "Órbitas",
  "control.labels": "Etiquetas",
  "control.moons": "Lunas",
  "control.stars": "Fondo estelar",
  "control.camReset": "Reiniciar cámara",
  "ts.secDay": "1s = 1 día",
  "ts.secTenDays": "1s = 10 días",
  "ts.secHundredDays": "1s = 100 días",
  "ts.secYear": "1s = 1 año",
  "ts.days": "1s = {v} días",
  "ts.hours": "1s = {v} horas",
  "sim.elapsedDays": "{value} días transcurridos",
  "sim.elapsedYears": "{value} años transcurridos",

  "info.aria": "Información del cuerpo celeste",
  "info.sep.real": "Datos astronómicos reales",
  "info.sep.render": "Valores de render — solo para el diseño en pantalla, NO datos reales",
  "info.sep.mode": "Modos de visualización",
  "info.kind": "Tipo",
  "info.radius": "Radio medio real",
  "info.avgDist": "Distancia media (semieje mayor)",
  "info.liveDist": "Distancia real actual",
  "info.period": "Período orbital",
  "info.rotation": "Período de rotación",
  "info.ecc": "Excentricidad (adimensional)",
  "info.incl": "Inclinación orbital (deg)",
  "info.renderRadius": "Radio de render",
  "info.renderDist": "Distancia de render",
  "info.distMode": "Visualización de distancia",
  "info.sizeMode": "Visualización de tamaño",
  "info.moons": "Lunas",
  "info.ref.moon": "respecto a {name}",
  "info.ref.sun": "respecto al Sol",
  "type.star": "Estrella",
  "type.planet": "Planeta",
  "type.dwarf-planet": "Planeta enano",
  "type.moon": "Luna",

  "scale.dist.log": "Escala de distancia logarítmica",
  "scale.dist.linear": "Escala de distancia lineal",
  "scale.dist.focus": "Escala de enfoque — centrada en {name}",
  "scale.dist.focusSun": "Escala de enfoque — centrada en el Sol",
  "scale.size.enhanced": "Tamaño de visibilidad mejorada",
  "scale.size.huge": "Tamaño enorme (mejorado ×3)",
  "scale.size.gigantic": "Tamaño gigantesco (mejorado ×10)",
  "scale.size.relative": "Énfasis en el tamaño relativo",
  "scale.size.uniform": "Marcadores uniformes",
  "scale.from.parent": "desde {name} (sistema padre)",
  "scale.from.focus": "desde {name} (enfoque)",
  "scale.from.sun": "desde el Sol",

  "unit.day": "día",
  "unit.days": "días",
  "unit.year": "año",
  "unit.years": "años",
  "rotation.retrograde": "retrógrado",
};

const AR: Record<MessageKey, string> = {
  "header.title": "النظام الشمسي اللوغاريتمي",
  "header.subtitle": "تصوّر يضغط بيانات فلكية حقيقية على مقياس لوغاريتمي.",
  "header.langGroup": "لغة العرض",
  ...LANG_AUTONYMS,
  "disclaimer.text":
    "يستخدم هذا التصوّر بيانات فلكية حقيقية، لكن المسافات المدارية مضغوطة على مقياس لوغاريتمي وأحجام الأجرام مبالغ فيها لسهولة القراءة على الشاشة. حجم العرض ومسافة العرض لا يشتركان في مقياس فيزيائي واحد.",

  "panel.header": "الترويسة",
  "panel.control": "التحكم",
  "panel.info": "المعلومات",
  "overlay.dockAria": "استعادة اللوحات",
  "overlay.restore": "استعادة الكل",
  "overlay.hideAll": "إخفاء اللوحات",
  "overlay.showAll": "إظهار اللوحات",
  "overlay.globalTitle": "إخفاء/إظهار كل اللوحات (الاختصار H)",
  "overlay.collapseAria": "{verb} لوحة {label}",
  "overlay.verbHide": "إخفاء",
  "overlay.verbShow": "إظهار",

  "control.aria": "التحكم في المحاكاة",
  "control.play": "تشغيل",
  "control.pause": "إيقاف مؤقت",
  "control.reset": "إعادة ضبط",
  "control.speed": "السرعة",
  "control.now": "الآن {speed} · {state}",
  "control.statePlaying": "قيد التشغيل",
  "control.statePaused": "متوقف",
  "control.distScale": "مقياس المسافة",
  "control.sizeScale": "مقياس الحجم",
  "control.orbits": "خطوط المدارات",
  "control.labels": "الأسماء",
  "control.moons": "الأقمار",
  "control.stars": "خلفية النجوم",
  "control.camReset": "إعادة ضبط الكاميرا",
  "ts.secDay": "‏1 ث = يوم واحد",
  "ts.secTenDays": "‏1 ث = 10 أيام",
  "ts.secHundredDays": "‏1 ث = 100 يوم",
  "ts.secYear": "‏1 ث = سنة واحدة",
  "ts.days": "‏1 ث = {v} يوم",
  "ts.hours": "‏1 ث = {v} ساعة",
  "sim.elapsedDays": "انقضى {value} يوم",
  "sim.elapsedYears": "انقضت {value} سنة",

  "info.aria": "معلومات الجرم السماوي",
  "info.sep.real": "بيانات فلكية حقيقية",
  "info.sep.render": "قيم العرض — لتخطيط الشاشة فقط، ليست بيانات حقيقية",
  "info.sep.mode": "أوضاع العرض",
  "info.kind": "النوع",
  "info.radius": "نصف القطر الحقيقي المتوسط",
  "info.avgDist": "المسافة المتوسطة (نصف المحور الأكبر)",
  "info.liveDist": "المسافة الحقيقية الحالية",
  "info.period": "مدة الدوران المداري",
  "info.rotation": "مدة الدوران المحوري",
  "info.ecc": "الشذوذ المداري (بلا أبعاد)",
  "info.incl": "الميل المداري (deg)",
  "info.renderRadius": "نصف قطر العرض",
  "info.renderDist": "مسافة العرض",
  "info.distMode": "عرض المسافة",
  "info.sizeMode": "عرض الحجم",
  "info.moons": "الأقمار",
  "info.ref.moon": "بالنسبة إلى {name}",
  "info.ref.sun": "بالنسبة إلى الشمس",
  "type.star": "نجم",
  "type.planet": "كوكب",
  "type.dwarf-planet": "كوكب قزم",
  "type.moon": "قمر",

  "scale.dist.log": "مقياس مسافة لوغاريتمي",
  "scale.dist.linear": "مقياس مسافة خطي",
  "scale.dist.focus": "مقياس التركيز — متمركز على {name}",
  "scale.dist.focusSun": "مقياس التركيز — متمركز على الشمس",
  "scale.size.enhanced": "حجم محسّن الوضوح",
  "scale.size.huge": "حجم ضخم (محسّن ×3)",
  "scale.size.gigantic": "حجم هائل (محسّن ×10)",
  "scale.size.relative": "إبراز الحجم النسبي",
  "scale.size.uniform": "علامات موحّدة",
  "scale.from.parent": "من {name} (النظام الأم)",
  "scale.from.focus": "من {name} (التركيز)",
  "scale.from.sun": "من الشمس",

  "unit.day": "يوم",
  "unit.days": "أيام",
  "unit.year": "سنة",
  "unit.years": "سنوات",
  "rotation.retrograde": "تراجعي",
};

/** Runtime dictionaries (exported for the parity test; one lookup path). */
export const MESSAGES: Record<Lang, Record<MessageKey, string>> = {
  en: EN,
  ko: KO,
  ja: JA,
  zh: ZH,
  fr: FR,
  de: DE,
  es: ES,
  ar: AR,
};

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v);
}

/** Tolerant parse: ONLY exact declared language codes are accepted, else null. */
export function parseLang(raw: string | null | undefined): Lang | null {
  return isLang(raw) ? raw : null;
}

/** Stored choice, or English when nothing valid/reachable is stored. */
export function loadLang(): Lang {
  try {
    return parseLang(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)) ?? "en";
  } catch {
    return "en"; // private mode / disabled storage — still English, still works
  }
}

export function saveLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    /* storage unavailable — the session language still works */
  }
}

// --- current-language state ---------------------------------------------------

let current: Lang = "en"; // default until main.ts restores the stored choice

type LangListener = (lang: Lang) => void;
const listeners = new Set<LangListener>();

export function getLang(): Lang {
  return current;
}

/**
 * Bootstrap restore (main.ts, once at startup): load the stored choice into
 * the state WITHOUT re-persisting or notifying (nothing subscribes yet).
 */
export function restoreLang(): Lang {
  current = loadLang();
  return current;
}

/**
 * Set the language, persist the explicit choice, then notify subscribers
 * (panels re-render from `t()` — nothing else caches translated strings).
 */
export function setLang(lang: Lang): Lang {
  current = lang;
  saveLang(lang);
  for (const fn of [...listeners]) fn(lang);
  return current;
}

/** Advance to the NEXT language in LANGS order (wraps) and return it. */
export function toggleLang(): Lang {
  const idx = LANGS.indexOf(current);
  return setLang(LANGS[(idx + 1) % LANGS.length] as Lang);
}

/** Subscribe to language changes; returns the unsubscribe function. */
export function onLangChange(fn: LangListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// --- translation lookup ---------------------------------------------------------

/** Parameters interpolate `{token}` placeholders in a message. */
export type MessageParams = Record<string, string | number>;

/**
 * Look up a message in `lang` (default: the current language). Keys are
 * compile-checked; a key that only exists at runtime-bypass level (cast)
 * still returns a VISIBLE placeholder, never `undefined`/`blank`/throw.
 * An interpolation token with no matching param stays visible as `{token}`
 * so a wiring gap is obvious instead of silently dropping content.
 */
export function t(key: MessageKey, params?: MessageParams, lang: Lang = current): string {
  const table: Record<string, string | undefined> = MESSAGES[lang];
  const raw = table[key];
  if (typeof raw !== "string") return `?${String(key)}?`;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (token: string, name: string): string =>
    name in params ? String(params[name]) : token,
  );
}
