/**
 * YG 주간 대시보드 플랫폼 — Google Apps Script 단독 운영판 (2026-11)
 *
 * 이 프로젝트 하나가 ① 대시보드 화면(Index.html) ② 관리자 설정 화면(Admin.html) ③ 데이터(시트·캘린더)를
 * 모두 제공한다. GitHub 없이 운영 가능.
 *   - 대시보드:    웹 앱 URL(.../exec)
 *   - 관리자 설정:  웹 앱 URL + ?page=admin
 *   - 기존 운영 프로젝트("광고IP사업")와 별개의 새 Apps Script 프로젝트로 설치한다(기존 것은 손대지 않음).
 *     시트·캘린더는 같은 것을 읽지만, 저장 기록(사업 일정 직접 선택·인사이트 확정·차주 배지 선택)은
 *     프로젝트마다 따로 보관된다 — 설치 때 한 번 옮겨 오는 방법은 설치 안내서 참고.
 *   - 구 GitHub 화면용 JSON 방식(?section=...&password=...)도 호환용으로 남겨 둠.
 *
 * 코드에 고정돼 있던 값(시트·캘린더 연결, 기준 연도, KPI 예비 목표, 사업 일정 키워드, 계약 알림 시점,
 * 섹션 구성 등)은 모두 "관리자 설정" 화면에서 입력·저장한다(스크립트 속성 PLATFORM_CONFIG_JSON).
 * 저장값이 없으면 아래 DEFAULT_CONFIG(2026 운영값)로 동작한다.
 *
 * 스크립트 속성(프로젝트 설정 ⚙ → 스크립트 속성):
 *   - DASHBOARD_PASSWORD: 팀 공통 비밀번호(대시보드 입장)
 *   - ADMIN_PASSWORD:     관리자 비밀번호(설정 화면 입장) — 설치 시 1회 직접 입력, 이후 설정 화면에서 변경 가능
 * 설치·배포 절차는 platform/설치_안내서.md 참고.
 */

var CAL_FOLDER_ID = '1WSM_HwsjxzTC2EmU4i2r7aEuA1u7zqhq'; // 사업 캘린더 구버전(05_검토 Tracker) — 'calendar' 섹션 하위 호환용, 현재 화면은 미사용
var MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// ============================================================
// 플랫폼 설정 — 관리자 설정 화면에서 바꾸는 값들의 기본값(2026 운영값)
// ============================================================
var PLATFORM_SECTION_KEYS = ['kpi', 'agenda', 'bizcal', 'trend', 'teamcal']; // 월별 트래킹은 2026-11 삭제
var DEFAULT_CONFIG = {
  general: { title: '주간회의 대시보드', teamName: '광고IP사업팀', teamNameEn: 'AD/IP BUSINESS', year: 2026 },
  sources: {
    kpiFile: '1Ej7edr36XJFFC_JQPwidWY_ikaet867hT6gD--BomlU',       // 실적현황(KPI 현황 + 인사이트)
    kpiSourceUrl: 'https://docs.google.com/spreadsheets/d/1HlGmNBPK69IWX3OqfVV6Q-MezsXQAG6rC6tdi7cgJmA/edit?usp=sharing', // KPI 카드 "원본 시트" 링크
    agendaFolder: '1Au_nUt3pQ7nVStq-oITUGTAgwZkprWiP',               // 팀 AGENDA 폴더(가장 최근 수정 시트 사용)
    trendFolder: '1Yqn8wrnsTePtN9OMIaEgBgBIqr1QEmc6',                // 트렌드 리포트 폴더(가장 최근 수정 시트 사용)
    bizCalSheet: '1hS_eFCaFaVo-shSL3oZiGgG1IEsKc5VnNa8oH6vcPig',     // 사업 캘린더(main) 시트
    masterSheet: '1HlGmNBPK69IWX3OqfVV6Q-MezsXQAG6rC6tdi7cgJmA',     // 광고IP사업 마스터 데이터('1. 실적관리' → 사업 원장 이관 원천)
    teamCalendar: 'c_ba39a76170dcab8c99022cc72144d5706bda1be2cfd589a88eabe857259799a3@group.calendar.google.com',
    teamCalendarLabel: '광고 IP 사업팀 캘린더',
    dbSheet: '', // 협업 DB(구글 시트) — 관리자 설정 [협업 DB 만들기]로 생성. 연결되면 KPI·AGENDA·트렌드·계약 알림을 DB에서 읽음
  },
  // 시트에 목표가 없을 때만 쓰는 예비값(억원). 평소엔 최신 주차 시트의 목표를 그대로 씀.
  kpi: { goalAnnual: 222, goalH2: 101 },
  bizCal: {
    alertMonths: [3, 1], // 계약 종료일 기준 N개월 전 알림
    keywords: ['운영종료', '서비스종료', '행사', '전시', '촬영', '업로드', '게시', '시딩', 'SNS'],
    useMark: true, mark: '◈', // 팀 캘린더 제목에 이 표시가 있으면 사업 일정
  },
  teamCal: { upcomingKeywords: ['출장', '촬영', '업로드'], upcomingDays: 10 }, // "차주엔~" 배지
  sections: [
    { key: 'kpi', title: '{year} KPI 현황', visible: true },
    { key: 'agenda', title: '팀 AGENDA', visible: true },
    { key: 'bizcal', title: '사업 캘린더', visible: true },
    { key: 'trend', title: '트렌드 리포트', visible: true },
    { key: 'teamcal', title: '팀 일정 캘린더', visible: true },
  ],
};
var CONFIG_PROP = 'PLATFORM_CONFIG_JSON';
var CONFIG_HISTORY_INDEX_PROP = 'PLATFORM_CONFIG_HISTORY'; // [{key, at, by, memo}] 최신순
var CONFIG_HISTORY_MAX = 20;
var ADMIN_MAX_FAILS = 5;     // 관리자 비밀번호 연속 실패 허용 횟수
var ADMIN_LOCK_MINUTES = 30; // 초과 시 잠금 시간(분)

var CFG_CACHE_ = null;    // 한 번 실행 안에서 설정을 여러 번 읽지 않게 보관
var CFG_OVERRIDE_ = null; // 연결 테스트 때 "저장 전 입력값"으로 잠시 바꿔 끼우는 용도

function cfg_() {
  if (CFG_OVERRIDE_) return CFG_OVERRIDE_;
  if (CFG_CACHE_) return CFG_CACHE_;
  var raw = PropertiesService.getScriptProperties().getProperty(CONFIG_PROP);
  var saved = null;
  try { saved = raw ? JSON.parse(raw) : null; } catch (e) { saved = null; }
  CFG_CACHE_ = sanitizeConfig_(saved || {});
  return CFG_CACHE_;
}

// URL을 붙여 넣어도 ID만 뽑아냄: 문서/시트(/d/ID), 폴더(/folders/ID), id=ID,
// 구글 캘린더 공유 링크(src=ID 또는 cid=base64). 그 외엔 입력값 그대로(이미 ID인 경우).
function extractId_(input) {
  var s = String(input || '').trim();
  if (!s) return '';
  var m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || s.match(/\/folders\/([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  m = s.match(/[?&]src=([^&#]+)/);
  if (m) return decodeURIComponent(m[1]);
  m = s.match(/[?&]cid=([^&#]+)/);
  if (m) {
    try {
      var b64 = decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      return Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString();
    } catch (e) { return s; }
  }
  return s;
}

function cleanList_(v, maxLen) {
  var arr = Array.isArray(v) ? v : String(v || '').split(/[,\n]/);
  var seen = {}, out = [];
  arr.forEach(function (x) {
    var t = String(x || '').trim();
    if (t && !seen[t] && out.length < maxLen) { seen[t] = true; out.push(t.slice(0, 30)); }
  });
  return out;
}

function clampInt_(v, min, max, fallback) {
  var n = parseInt(v, 10);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cleanText_(v, maxLen, fallback) {
  var t = String(v == null ? '' : v).trim();
  return t ? t.slice(0, maxLen) : fallback;
}

// 저장값(일부만 있어도 됨)을 기본값 위에 얹고, 형식이 틀린 값은 기본값으로 되돌림.
function sanitizeConfig_(input) {
  var d = DEFAULT_CONFIG, c = input || {};
  var g = c.general || {}, src = c.sources || {}, k = c.kpi || {}, b = c.bizCal || {}, t = c.teamCal || {};
  var num = function (v, fb) { var n = parseFloat(v); return isNaN(n) || n < 0 ? fb : n; };
  var months = (Array.isArray(b.alertMonths) ? b.alertMonths : String(b.alertMonths || '').split(/[,\s]+/))
    .map(function (x) { return parseInt(x, 10); })
    .filter(function (n, i, arr) { return n >= 1 && n <= 24 && arr.indexOf(n) === i; })
    .sort(function (x, y) { return y - x; }).slice(0, 4);
  var sectionsIn = Array.isArray(c.sections) ? c.sections : [];
  var sections = [];
  sectionsIn.forEach(function (s) {
    if (!s || PLATFORM_SECTION_KEYS.indexOf(s.key) < 0) return;
    if (sections.some(function (x) { return x.key === s.key; })) return;
    var def = d.sections.filter(function (x) { return x.key === s.key; })[0];
    sections.push({ key: s.key, title: cleanText_(s.title, 40, def.title), visible: s.visible !== false });
  });
  d.sections.forEach(function (def) { // 빠진 섹션은 기본 순서대로 뒤에 붙임
    if (!sections.some(function (x) { return x.key === def.key; })) sections.push({ key: def.key, title: def.title, visible: def.visible });
  });
  return {
    general: {
      title: cleanText_(g.title, 40, d.general.title),
      teamName: cleanText_(g.teamName, 40, d.general.teamName),
      teamNameEn: cleanText_(g.teamNameEn, 40, d.general.teamNameEn),
      year: clampInt_(g.year, 2000, 2100, d.general.year),
    },
    sources: {
      kpiFile: extractId_(src.kpiFile) || d.sources.kpiFile,
      kpiSourceUrl: src.kpiSourceUrl === undefined ? d.sources.kpiSourceUrl : String(src.kpiSourceUrl || '').trim(),
      agendaFolder: extractId_(src.agendaFolder) || d.sources.agendaFolder,
      trendFolder: extractId_(src.trendFolder) || d.sources.trendFolder,
      bizCalSheet: extractId_(src.bizCalSheet) || d.sources.bizCalSheet,
      masterSheet: extractId_(src.masterSheet) || d.sources.masterSheet,
      teamCalendar: extractId_(src.teamCalendar) || d.sources.teamCalendar,
      teamCalendarLabel: cleanText_(src.teamCalendarLabel, 40, d.sources.teamCalendarLabel),
      dbSheet: extractId_(src.dbSheet),
    },
    kpi: { goalAnnual: num(k.goalAnnual, d.kpi.goalAnnual), goalH2: num(k.goalH2, d.kpi.goalH2) },
    bizCal: {
      alertMonths: months.length ? months : d.bizCal.alertMonths.slice(),
      keywords: b.keywords === undefined ? d.bizCal.keywords.slice() : cleanList_(b.keywords, 40),
      useMark: b.useMark === undefined ? d.bizCal.useMark : b.useMark !== false,
      mark: cleanText_(b.mark, 3, d.bizCal.mark),
    },
    teamCal: {
      upcomingKeywords: t.upcomingKeywords === undefined ? d.teamCal.upcomingKeywords.slice() : cleanList_(t.upcomingKeywords, 20),
      upcomingDays: clampInt_(t.upcomingDays, 1, 31, d.teamCal.upcomingDays),
    },
    sections: sections,
    codes: sanitizeCodes_(c.codes),
  };
}

// 협업 DB 드롭다운 목록(진행 단계·가중치, 아티스트 그룹 등) — 비어 있으면 Db.gs의 기본값 사용.
// 진행 단계는 "이름|가중치(%)|설명" 줄 단위 또는 객체 배열 모두 받음.
function sanitizeCodes_(codes) {
  var c = codes || {}, out = {};
  var stagesIn = Array.isArray(c.stages) ? c.stages : String(c.stages || '').split('\n');
  var stages = [];
  stagesIn.forEach(function (x) {
    var name, weight, desc;
    if (x && typeof x === 'object') { name = x.name; weight = x.weight; desc = x.desc; }
    else { var p = String(x || '').split('|'); name = p[0]; weight = p[1]; desc = p[2]; }
    name = String(name || '').trim();
    if (!name || stages.some(function (s) { return s.name === name; }) || stages.length >= 12) return;
    var w = parseFloat(weight);
    stages.push({ name: name.slice(0, 20), weight: isNaN(w) ? 0 : Math.max(0, Math.min(100, w)), desc: String(desc || '').trim().slice(0, 60) });
  });
  if (stages.length) out.stages = stages;
  ['groups', 'ctypes', 'ckinds', 'items', 'currencies'].forEach(function (k) {
    if (c[k] === undefined) return;
    var list = cleanList_(c[k], 40);
    if (list.length) out[k] = list;
  });
  return out;
}

// 화면(로그인 전 포함)에 내려주는 설정 — 시트·캘린더 ID는 빼고 표시용 값만.
function uiConfig_() {
  var c = cfg_();
  return {
    general: c.general,
    sources: { kpiSourceUrl: c.sources.kpiSourceUrl, teamCalendarLabel: c.sources.teamCalendarLabel },
    bizCal: c.bizCal,
    teamCal: c.teamCal,
    sections: c.sections,
  };
}

function getPassword_() {
  return PropertiesService.getScriptProperties().getProperty('DASHBOARD_PASSWORD');
}

function getAdminPassword_() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 진입점
// ============================================================
// section 파라미터가 있으면 기존 JSON API(구 GitHub 화면용), 없으면 HTML 화면(대시보드 / ?page=admin 설정).
function doGet(e) {
  var params = (e && e.parameter) || {};
  if (!params.section) return renderPage_(params);
  return jsonOutput_(handleApi_(params));
}

function renderPage_(params) {
  var isAdmin = params.page === 'admin';
  var t = HtmlService.createTemplateFromFile(isAdmin ? 'Admin' : 'Index');
  var ui = uiConfig_();
  // </script> 등이 섞여도 스크립트 블록이 깨지지 않게 "<"를 이스케이프해서 심음.
  t.uiConfigJson = JSON.stringify(ui).replace(/</g, '\\u003c');
  t.ui = ui;
  t.appUrl = ScriptApp.getService().getUrl();
  return t.evaluate()
    .setTitle(isAdmin ? ui.general.title + ' · 관리자 설정' : ui.general.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 새 화면(Index.html)이 google.script.run으로 부르는 데이터 API — 기존 JSON API와 같은 규칙·같은 응답.
// 숫자 NaN이 기존(JSON) 방식처럼 null로 바뀌도록 문자열(JSON)로 돌려준다.
function api(section, password, paramsJson) {
  var params = {};
  try { params = JSON.parse(paramsJson || '{}') || {}; } catch (e) { params = {}; }
  params.section = section;
  params.password = password;
  return JSON.stringify(handleApi_(params));
}

function handleApi_(params) {
  var pw = getPassword_();
  if (!pw || params.password !== pw) return { ok: false, error: 'unauthorized' };
  var viewYear = parseInt(params.viewYear, 10);
  if (viewYear >= 2000 && viewYear <= 2100 && viewYear !== cfg_().general.year) {
    var copy = JSON.parse(JSON.stringify(cfg_()));
    copy.general.year = viewYear;
    CFG_OVERRIDE_ = copy;
    try { return handleApiInner_(params); } finally { CFG_OVERRIDE_ = null; }
  }
  return handleApiInner_(params);
}

function handleApiInner_(params) {
  try {
    switch (params.section) {
      case 'kpi': return dbReady_() ? getKpiDataDb_() : getKpiData_();
      case 'insight': return getInsightData_();
      case 'saveInsight':
        saveInsightOverride_(resolveInsightWeekKey_(params), String(params.text || '').trim());
        return { ok: true };
      case 'agenda': return dbReady_() ? getAgendaDataDb_() : getByWeekSectionData_(cfg_().sources.agendaFolder, extractAgendaFromSheet_);
      case 'trend': return dbReady_() ? getTrendDataDb_() : getByWeekSectionData_(cfg_().sources.trendFolder, extractTrendFromSheet_);
      case 'calendar': return getCalendarData_();
      case 'businessCalendar': return dbReady_() ? getBusinessCalendarDataDb_() : getBusinessCalendarData_();
      case 'teamCalendar':
        return getTeamCalendarData_(parseInt(params.year, 10), parseInt(params.month, 10));
      case 'upcomingSelection': return { ok: true, selection: getUpcomingSelection_() };
      case 'saveUpcomingSelection':
        saveUpcomingSelection_(params.mode, params.ids);
        return { ok: true };
      case 'bizEventOverrides': return { ok: true, overrides: getBizEventOverrides_() };
      case 'saveBizEventOverrides':
        return { ok: true, overrides: saveBizEventOverrides_(params.include, params.exclude, params.clear) };
      default:
        return { ok: false, error: 'unknown_section' };
    }
  } catch (err) {
    return { ok: false, error: 'server_error', message: String(err) };
  }
}

// ============================================================
// 관리자 설정 API (Admin.html → google.script.run.adminApi)
// ============================================================
// 관리자 비밀번호 확인(관리자 화면·플랫폼 관리자 모드 공용). 통과하면 null, 아니면 오류 객체.
// 무작위 대입 방지: 연속 5회 틀리면 30분 동안 관리자 기능 차단(맞게 입력하면 횟수 초기화)
function checkAdminPassword_(adminPassword) {
  var adminPw = getAdminPassword_();
  if (!adminPw) {
    return { ok: false, error: 'admin_not_configured', message: '관리자 비밀번호가 아직 설정되지 않았습니다. Apps Script 프로젝트 설정 → 스크립트 속성에 ADMIN_PASSWORD를 추가해 주세요.' };
  }
  var cache = CacheService.getScriptCache();
  var lockedUntil = Number(cache.get('adminLockUntil') || 0);
  if (lockedUntil > new Date().getTime()) {
    return { ok: false, error: 'locked', message: '비밀번호를 연속으로 틀려 관리자 기능이 잠겼습니다. ' + Math.ceil((lockedUntil - new Date().getTime()) / 60000) + '분 뒤 다시 시도해 주세요.' };
  }
  if (adminPassword !== adminPw) {
    var fails = Number(cache.get('adminFail') || 0) + 1;
    if (fails >= ADMIN_MAX_FAILS) {
      cache.put('adminLockUntil', String(new Date().getTime() + ADMIN_LOCK_MINUTES * 60000), ADMIN_LOCK_MINUTES * 60);
      cache.remove('adminFail');
      return { ok: false, error: 'locked', message: '비밀번호를 ' + ADMIN_MAX_FAILS + '회 틀려 ' + ADMIN_LOCK_MINUTES + '분 동안 관리자 기능이 잠겼습니다.' };
    }
    cache.put('adminFail', String(fails), ADMIN_LOCK_MINUTES * 60);
    return { ok: false, error: 'unauthorized', message: '관리자 비밀번호가 틀렸습니다. (' + fails + '/' + ADMIN_MAX_FAILS + '회, ' + ADMIN_MAX_FAILS + '회 틀리면 ' + ADMIN_LOCK_MINUTES + '분 잠김)' };
  }
  cache.remove('adminFail');
  return null;
}

function adminApi(action, adminPassword, payloadJson) {
  var denied = checkAdminPassword_(adminPassword);
  if (denied) return JSON.stringify(denied);
  var payload = {};
  try { payload = JSON.parse(payloadJson || '{}') || {}; } catch (e) { payload = {}; }
  try {
    var res;
    switch (action) {
      case 'load': res = { ok: true, config: cfg_(), defaults: sanitizeConfig_({}), codeDefaults: DEFAULT_CODES, history: getConfigHistoryIndex_() }; break;
      case 'test': res = { ok: true, results: testConnections_(sanitizeConfig_(payload.config)) }; break;
      case 'save': res = { ok: true, config: saveConfig_(sanitizeConfig_(payload.config), payload.by, payload.memo) }; break;
      case 'restore': res = { ok: true, config: restoreConfig_(payload.key, payload.by) }; break;
      case 'reset': res = { ok: true, config: saveConfig_(sanitizeConfig_({}), payload.by, '기본값으로 복원') }; break;
      case 'passwords': changePasswords_(payload.dashboard, payload.admin); res = { ok: true }; break;
      case 'createDb': res = { ok: true, db: createDb_(payload.by), config: cfg_() }; break;
      case 'migrate': res = { ok: true, report: migrateFromSheets_(cleanText_(payload.by, 20, '관리자')) }; break;
      case 'recalc': res = { ok: true, count: withLock_(function () { return recalcDeals_(payload.by); }) }; break;
      default: res = { ok: false, error: 'unknown_action' };
    }
    if (res.ok && res.config) res.history = getConfigHistoryIndex_();
    return JSON.stringify(res);
  } catch (err) {
    return JSON.stringify({ ok: false, error: 'server_error', message: String(err && err.message || err) });
  }
}

function getConfigHistoryIndex_() {
  var raw = PropertiesService.getScriptProperties().getProperty(CONFIG_HISTORY_INDEX_PROP);
  try { var arr = JSON.parse(raw || '[]'); return Array.isArray(arr) ? arr : []; } catch (e) { return []; }
}

// 저장할 때마다 그 설정 전체를 별도 속성(PLATFORM_CONFIG_HIST_<시각>)에 스냅숏으로 남기고, 최근 20건만 유지.
function saveConfig_(config, by, memo) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var json = JSON.stringify(config);
    var stamp = new Date();
    var key = 'PLATFORM_CONFIG_HIST_' + stamp.getTime();
    props.setProperty(CONFIG_PROP, json);
    props.setProperty(key, json);
    var index = getConfigHistoryIndex_();
    index.unshift({
      key: key,
      at: Utilities.formatDate(stamp, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
      by: cleanText_(by, 20, ''),
      memo: cleanText_(memo, 80, ''),
    });
    index.slice(CONFIG_HISTORY_MAX).forEach(function (old) { props.deleteProperty(old.key); });
    props.setProperty(CONFIG_HISTORY_INDEX_PROP, JSON.stringify(index.slice(0, CONFIG_HISTORY_MAX)));
    CFG_CACHE_ = null;
    clearDataCaches_(config);
    return cfg_();
  } finally {
    lock.releaseLock();
  }
}

function restoreConfig_(key, by) {
  var entry = getConfigHistoryIndex_().filter(function (h) { return h.key === key; })[0];
  if (!entry) throw new Error('해당 변경 이력을 찾을 수 없습니다.');
  var raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) throw new Error('해당 시점의 설정 기록이 없습니다.');
  return saveConfig_(sanitizeConfig_(JSON.parse(raw)), by, '되돌리기: ' + entry.at + ' 설정');
}

// 연결 대상이 바뀌면 60초 캐시에 남은 예전 시트 데이터가 보이지 않게 비움.
function clearDataCaches_(config) {
  var keys = ['kpiByWeek', 'insightByWeek'];
  var y = config.general.year;
  [y - 1, y, y + 1].forEach(function (yy) { for (var m = 1; m <= 12; m++) keys.push('teamCal_' + yy + '_' + m); });
  try { CacheService.getScriptCache().removeAll(keys); } catch (e) {}
}

function changePasswords_(dashboard, admin) {
  var props = PropertiesService.getScriptProperties();
  var d = String(dashboard || '').trim(), a = String(admin || '').trim();
  if (!d && !a) throw new Error('변경할 비밀번호를 입력해 주세요.');
  if ((d && d.length < 4) || (a && a.length < 4)) throw new Error('비밀번호는 4자 이상이어야 합니다.');
  if (d) props.setProperty('DASHBOARD_PASSWORD', d);
  if (a) props.setProperty('ADMIN_PASSWORD', a);
}

// 입력한 설정(저장 전)으로 각 데이터 연결을 실제로 열어 보고, 필요한 표가 있는지까지 확인.
function testConnections_(config) {
  var results = [];
  var add = function (name, fn) {
    try {
      var r = fn();
      results.push({ name: name, ok: r.ok, detail: r.detail });
    } catch (err) {
      results.push({ name: name, ok: false, detail: '열 수 없음 — ' + String(err && err.message || err) });
    }
  };
  var weekSheets = function (ss) {
    return ss.getSheets().filter(function (sh) { return !!monthWeekFromSheetName_(sh.getName()); })
      .sort(function (a, b) {
        var ma = monthWeekFromSheetName_(a.getName()), mb = monthWeekFromSheetName_(b.getName());
        return weekOrder_(mb.monthAbbr, mb.weekNum) - weekOrder_(ma.monthAbbr, ma.weekNum);
      });
  };
  CFG_OVERRIDE_ = config;
  try {
    add('실적현황 시트 (KPI·인사이트)', function () {
      var ss = SpreadsheetApp.openById(config.sources.kpiFile);
      var sheets = weekSheets(ss);
      if (!sheets.length) return { ok: false, detail: ss.getName() + ' — 주차 시트(예: NOV_2)가 없습니다.' };
      var status = extractKpiStatusFromSheet_(sheets[0]);
      return status
        ? { ok: true, detail: ss.getName() + ' · 주차 시트 ' + sheets.length + '개 · 최신 ' + sheets[0].getName() + '에서 KPI 표 확인' }
        : { ok: false, detail: ss.getName() + ' · 최신 ' + sheets[0].getName() + '에서 "구분/목표" KPI 표를 찾지 못했습니다.' };
    });
    var folderCheck = function (folderId, extractor, label) {
      var folder = DriveApp.getFolderById(folderId);
      var file = resolveLatestFile_(folderId);
      if (!file) return { ok: false, detail: folder.getName() + ' 폴더에 구글 시트가 없습니다.' };
      var sheets = weekSheets(SpreadsheetApp.openById(file.getId()));
      if (!sheets.length) return { ok: false, detail: file.getName() + ' — 주차 시트(예: NOV_1)가 없습니다.' };
      var data = extractor(sheets[0]);
      var n = !data ? 0 : Array.isArray(data) ? data.length
        : Object.keys(data).reduce(function (sum, k) { return sum + (Array.isArray(data[k]) ? data[k].length : 0); }, 0);
      return n
        ? { ok: true, detail: folder.getName() + ' › ' + file.getName() + ' · 최신 ' + sheets[0].getName() + ' ' + label + ' ' + n + '개 확인' }
        : { ok: false, detail: file.getName() + ' · 최신 ' + sheets[0].getName() + '에서 ' + label + '을(를) 찾지 못했습니다(표 머리글 확인 필요).' };
    };
    add('팀 AGENDA 폴더', function () { return folderCheck(config.sources.agendaFolder, extractAgendaFromSheet_, '안건'); });
    add('트렌드 리포트 폴더', function () { return folderCheck(config.sources.trendFolder, extractTrendFromSheet_, '리포트 구분'); });
    add('사업 캘린더 시트', function () {
      var ss = SpreadsheetApp.openById(config.sources.bizCalSheet);
      var data = getBusinessCalendarData_();
      return findBusinessCalendarRows_(ss)
        ? { ok: true, detail: ss.getName() + ' · 계약 ' + data.items.length + '건(종료일 미정 포함) 확인' }
        : { ok: false, detail: ss.getName() + ' — "프로젝트·계약 종료일·D-DAY" 머리글 표를 찾지 못했습니다.' };
    });
    add('마스터 데이터 시트', function () {
      var ss = SpreadsheetApp.openById(config.sources.masterSheet);
      var sh = masterLedgerSheet_(ss);
      if (!sh) return { ok: false, detail: ss.getName() + ' — "실적관리" 탭을 찾지 못했습니다.' };
      var n = readMasterLedger_(sh).rows.length;
      return n ? { ok: true, detail: ss.getName() + ' › ' + sh.getName() + ' · 사업 ' + n + '건 확인' }
        : { ok: false, detail: sh.getName() + ' — "상태 · 광고/사업명" 머리글 표를 찾지 못했습니다.' };
    });
    add('팀 구글 캘린더', function () {
      var cal = CalendarApp.getCalendarById(config.sources.teamCalendar);
      if (!cal) return { ok: false, detail: '캘린더를 열 수 없습니다(ID 또는 공유 권한 확인).' };
      var now = new Date(), later = new Date(now.getTime() + 30 * 86400000);
      return { ok: true, detail: cal.getName() + ' · 앞으로 30일 일정 ' + cal.getEvents(now, later).length + '건' };
    });
    add('협업 DB', function () {
      if (!config.sources.dbSheet) return { ok: true, detail: '아직 없음 — [협업 DB 만들기]로 생성하면 화면 입력·저장이 가능해집니다(그 전엔 기존 시트를 읽음).' };
      var ss = SpreadsheetApp.openById(config.sources.dbSheet);
      var missing = DB_TABLE_ORDER.filter(function (k) { return !ss.getSheetByName(DB_TABLES[k].sheet); });
      return missing.length
        ? { ok: false, detail: ss.getName() + ' — 없는 탭: ' + missing.map(function (k) { return DB_TABLES[k].sheet; }).join(', ') }
        : { ok: true, detail: ss.getName() + ' · 탭 ' + DB_TABLE_ORDER.length + '개 확인' };
    });
    add('KPI 원본 시트 링크', function () {
      var u = config.sources.kpiSourceUrl;
      if (!u) return { ok: true, detail: '비워 둠 — KPI 카드의 "원본 시트" 링크를 표시하지 않습니다.' };
      return /^https:\/\//.test(u) ? { ok: true, detail: '링크 형식 정상' } : { ok: false, detail: 'https://로 시작하는 주소를 입력해 주세요.' };
    });
  } finally {
    CFG_OVERRIDE_ = null;
  }
  return results;
}

// 배포 전에 딱 한 번 수동 실행해서 Calendar 권한 승인 팝업을 미리 띄우기 위한 함수.
// 스크립트 에디터에서 이 함수를 선택해 ▶ 실행하면 됨(웹 앱 요청에서는 호출되지 않음).
// 이름 끝에 밑줄(_)을 안 붙인 이유: Apps Script가 밑줄로 끝나는 함수는 "내부용"으로 보고
// 상단 실행 드롭다운에 안 보여주기 때문 — 이 함수는 사람이 직접 선택해서 실행해야 하므로 예외.
function manualAuthTest() {
  Logger.log(getTeamCalendarData_(new Date().getFullYear(), new Date().getMonth() + 1));
}

// ---- 공통 유틸 ----

// 시트 셀에 "222억"처럼 단위가 붙어있는 값에서 숫자만 뽑음.
function stripUnit_(v) {
  if (v === null || v === undefined || v === '') return NaN;
  var m = String(v).match(/-?[\d.]+/);
  return m ? parseFloat(m[0]) : NaN;
}

// 퍼센트 서식(예: "2.80%")이 적용된 셀에서 퍼센트 값을 뽑음. getValues()는 퍼센트 서식 셀을
// 화면 표시값이 아니라 그 소수값(2.80% → 0.028)으로 반환하므로, 숫자 타입이면 100을 곱해야
// "2.8"이라는 사람이 읽는 퍼센트 숫자가 나온다(문자열로 "2.8%"처럼 직접 입력된 경우는 그대로 파싱).
function percentCellToPct_(v) {
  if (typeof v === 'number') return v * 100;
  return stripUnit_(v);
}

// 시트명("AUG_2", "SEP_1" 등)에서 월 약어 + 주차 숫자를 함께 뽑음. 폴더 안 파일이 "팀아젠다",
// "트렌드리포트_AUG"처럼 파일명은 그대로 두고 그 안에 월이 바뀔 때마다 시트만 계속 추가되는
// 방식으로 운영되고 있어서(파일명 기준으로는 몇 월 파일인지 신뢰할 수 없음), 월 판별은 항상
// "시트 이름"에서 한다. 반환값 예: {monthAbbr:'SEP', weekNum:1}
function monthWeekFromSheetName_(name) {
  var m = /^([A-Za-z]{3})_(\d+)\s*$/.exec((name || '').trim());
  if (!m) return null;
  var abbr = m[1].toUpperCase();
  if (MONTH_ABBR.indexOf(abbr) < 0) return null;
  return { monthAbbr: abbr, weekNum: parseInt(m[2], 10) };
}

// 월/주차를 하나의 정렬 가능한 숫자로("SEP 1주차" > "AUG 4주차"가 되도록).
function weekOrder_(monthAbbr, weekNum) {
  return MONTH_ABBR.indexOf(monthAbbr) * 100 + weekNum;
}

// 폴더 안에서 가장 최근에 수정된 스프레드시트 파일 하나를 고름. 지금 운영 방식상 폴더당 파일이
// 보통 하나뿐이고(월이 바뀌어도 파일을 새로 안 만들고 시트만 추가), 혹시 여러 개가 있어도
// "최근 수정 순"이 가장 안전한 기준.
function resolveLatestFile_(folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var it = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  var files = [];
  while (it.hasNext()) files.push(it.next());
  if (!files.length) return null;
  files.sort(function (a, b) { return b.getLastUpdated() - a.getLastUpdated(); });
  return files[0];
}

// KPI/팀AGENDA/트렌드 공통 패턴: 폴더의 최신 파일을 찾아, "월약어_숫자" 이름의 시트마다
// extractorFn(sheet)를 돌려서 { "SEP_1": {monthAbbr,weekNum,data} } 형태로 모음. 월이 바뀌어도
// (예: SEP_1 시트가 새로 생겨도) 코드 수정 없이 자동으로 인식됨 — 주차 숫자만으로 키를 만들면
// 다음 달 1주차가 이전 달 1주차 데이터를 덮어써버리므로, 반드시 월까지 포함한 키를 쓴다.
function getByWeekSectionData_(folderId, extractorFn) {
  var file = resolveLatestFile_(folderId);
  if (!file) return { ok: true, byWeek: {} };
  var ss = SpreadsheetApp.openById(file.getId());
  var byWeek = {};
  ss.getSheets().forEach(function (sh) {
    var mw = monthWeekFromSheetName_(sh.getName());
    if (!mw) return;
    var key = mw.monthAbbr + '_' + mw.weekNum;
    byWeek[key] = { monthAbbr: mw.monthAbbr, weekNum: mw.weekNum, data: extractorFn(sh) };
  });
  return { ok: true, byWeek: byWeek };
}

// ---- ① KPI 섹션 ----

// 2026-10(SEP_5)부터 시트 양식이 바뀜 — "1. 2026 KPI 현황" 표가 Stretch/Base 목표를 나란히 두는
// "구분 | 목표(Stretch) | 목표(Base) | 실적 | 달성률(S) | 달성률(B) | 잔여 KPI(S) | 잔여 KPI(B)"
// 구조가 됨(이전: "구분 | 목표 | 실적 | 달성률 | 잔여 KPI"). 예전처럼 열 "위치"로 읽으면 신양식에선
// 3번째 열(목표(Base))을 실적으로 잘못 읽어 화면에 엉뚱한 숫자가 조용히 나오므로, 열은 항상 헤더
// "이름"으로 찾는다. 신·구 양식 모두 이 매핑 하나로 처리되어 과거 주차 시트도 그대로 읽힘.
// defaultBasis: "(S)/(B)" 표시 없이 그냥 "목표"라고만 적힌 구양식 열을 Stretch/Base 중 어디로 볼지
// (표 제목에 "Baseline 기준"이라고 적혀 있으면 'B', 그 외는 'S').
// 같은 행 오른쪽에 참고용 표("ZUS COFFEE/치타토 하반기 집계시" 등)가 붙어 있는 경우가 있어서,
// 같은 이름의 열이 두 번 나오면 왼쪽(첫 번째)만 쓴다.
function mapKpiHeader_(header, startCol, defaultBasis) {
  var col = {};
  var setOnce = function (k, j) { if (col[k] === undefined) col[k] = j; };
  for (var j = startCol; j < header.length; j++) {
    var h = String(header[j] || '').replace(/\s+/g, '');
    if (!h) continue;
    var basis = /\((Stretch|S)\)/i.test(h) ? 'S' : /\((Base|Baseline|B)\)/i.test(h) ? 'B' : null;
    var b = basis || defaultBasis;
    if (h.indexOf('목표') === 0) setOnce(b === 'B' ? 'goalBase' : 'goal', j);
    else if (h.indexOf('실적') === 0) setOnce('actual', j);
    else if (h.indexOf('달성률') === 0) setOnce(b === 'B' ? 'achBase' : 'ach', j);
    else if (h.indexOf('잔여') === 0) setOnce(b === 'B' ? 'remainBase' : 'remain', j);
  }
  return col;
}

// 매핑된 열에서 값을 꺼내 {goal, goalBase, actual, ach, achBase, remain, remainBase}로 만듦.
// goal/ach/remain = Stretch 기준(기존 필드명 그대로 — 운영 화면 하위 호환), *Base = Base 기준.
// 잔여 KPI는 시트 부호 그대로 전달(신양식은 "실적-목표"라 미달이 음수) — 화면은 이 값을 쓰지 않고
// 목표-실적으로 직접 다시 계산해 신·구 양식 부호 차이에 영향받지 않게 함.
function readKpiRow_(row, col) {
  var pick = function (k, pct) {
    if (col[k] === undefined) return NaN;
    return pct ? percentCellToPct_(row[col[k]]) : stripUnit_(row[col[k]]);
  };
  return {
    goal: pick('goal'), goalBase: pick('goalBase'), actual: pick('actual'),
    ach: pick('ach', true), achBase: pick('achBase', true),
    remain: pick('remain'), remainBase: pick('remainBase'),
  };
}

// "1-2", "2." 처럼 다음 섹션 번호로 시작하는 제목 행인지("2026년 전체"는 숫자로 시작해도 아님).
function isSectionTitle_(label) {
  return /^\d+(\.|-\d)/.test(label);
}

// 시트 안 "1. 2026 KPI 현황" 표를 읽어 {annual:{...}, h1:{...}, h2:{...}, parts:[...]} 형태로 반환.
function extractKpiStatusFromSheet_(sheet) {
  var values = sheet.getDataRange().getValues();
  var headerIdx = -1;
  for (var i = 0; i < values.length; i++) {
    var c0 = String(values[i][0] || '').trim();
    var c1 = String(values[i][1] || '');
    if (c0 === '구분' && c1.indexOf('목표') >= 0) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return null;
  var titleAbove = headerIdx > 0 ? String(values[headerIdx - 1][0] || '') : '';
  var col = mapKpiHeader_(values[headerIdx], 1, /Baseline/i.test(titleAbove) ? 'B' : 'S');
  var out = {};
  for (var j = headerIdx + 1; j < values.length; j++) {
    var label = String(values[j][0] || '').trim();
    if (!label) continue;
    if (isSectionTitle_(label)) break; // 다음 섹션("1-1 파트별 ..." / "2. 월별 팀 KPI PLAN") 시작
    var rec = readKpiRow_(values[j], col);
    if (isNaN(rec.goal) && isNaN(rec.goalBase) && isNaN(rec.actual)) continue;
    if (label.indexOf('전체') >= 0) out.annual = rec;
    else if (label.indexOf('상반기') >= 0) out.h1 = rec;
    else if (label.indexOf('하반기') >= 0) out.h2 = rec;
  }
  out.parts = extractKpiPartsFromRows_(values);
  return (out.annual || out.h2) ? out : null;
}

// "1-1 파트별 2026 KPI 현황" 표: 파트 | 구분(연간/상반기/하반기) | 목표(S) | 목표(B) | 실적 | ...
// 파트명(광고/IP)은 그 파트의 첫 행에만 적혀 있고 아래 행은 비어 있으므로 직전 파트명을 이어 씀.
// 반환: [{ name:'광고', annual:{...}, h1:{...}, h2:{...} }, ...] — 표가 없는 주차(SEP_1/2)는 [].
function extractKpiPartsFromRows_(values) {
  var headerIdx = -1;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === '파트' && String(values[i][1] || '').trim() === '구분') { headerIdx = i; break; }
  }
  if (headerIdx < 0) return [];
  var titleAbove = headerIdx > 0 ? String(values[headerIdx - 1][0] || '') : '';
  var col = mapKpiHeader_(values[headerIdx], 2, /Baseline/i.test(titleAbove) ? 'B' : 'S');
  var parts = [], cur = null;
  for (var j = headerIdx + 1; j < values.length; j++) {
    var name = String(values[j][0] || '').trim();
    if (name && isSectionTitle_(name)) break;
    var period = String(values[j][1] || '').trim();
    if (name) { cur = { name: name, annual: null, h1: null, h2: null }; parts.push(cur); }
    if (!cur || !period) continue;
    var rec = readKpiRow_(values[j], col);
    if (isNaN(rec.goal) && isNaN(rec.goalBase) && isNaN(rec.actual)) continue;
    if (period.indexOf('연간') >= 0) cur.annual = rec;
    else if (period.indexOf('상반기') >= 0) cur.h1 = rec;
    else if (period.indexOf('하반기') >= 0) cur.h2 = rec;
  }
  return parts.filter(function (p) { return p.annual || p.h1 || p.h2; });
}

// getByWeekSectionData_와 같은 동작이지만, 폴더를 뒤져 "최근 수정 파일"을 찾는 대신 지정한
// 파일 ID를 직접 연다. KPI 섹션은 원래 PERF_FOLDER_ID 폴더를 뒤졌는데, 월별 트래킹·인사이트
// 바는 이미 실적현황 파일(설정 sources.kpiFile)로 같은 파일을 고정 ID로 열고 있었음 — 같은 파일을 찾는 방법이
// 두 가지로 갈라져 있었던 것. 그 폴더에 스프레드시트가 하나라도 더 생기면(백업본, 복사본 등)
// KPI 카드와 월별 트래킹이 서로 다른 파일을 읽어 화면에 두 파일의 숫자가 섞여 나올 수 있었음 —
// 오류 없이 조용히. 고정 ID 쪽이 안전하므로 KPI도 이 방식으로 통일한다.
function getByWeekFromFile_(fileId, extractorFn) {
  var ss = SpreadsheetApp.openById(fileId);
  var byWeek = {};
  ss.getSheets().forEach(function (sh) {
    var mw = monthWeekFromSheetName_(sh.getName());
    if (!mw) return;
    byWeek[mw.monthAbbr + '_' + mw.weekNum] = {
      monthAbbr: mw.monthAbbr, weekNum: mw.weekNum, data: extractorFn(sh),
    };
  });
  return { ok: true, byWeek: byWeek };
}

// 목표값은 가장 최근 주차 시트에서 읽고, 시트에 없거나 파싱 안 되면 그때만 상수로 폴백한다.
// (예전엔 시트값과 무관하게 항상 상수로 덮어썼음 — 시트에서 목표를 바꿔도 대시보드가 조용히
// 예전 숫자를 계속 쓰는 문제가 있었음. 상수는 "공개 저장소에 숫자가 안 보이게" 하려던 목적이라,
// 시트에서 읽어 응답에 실어 보내도 숫자는 여전히 저장소가 아니라 시트/Apps Script에만 있으므로
// 그 목적은 그대로 유지된다 — 화면 코드는 여전히 서버가 준 값만 그린다.)
// 같은 파일(실적현황 파일(설정 sources.kpiFile))을 kpi/insight/monthlyTracking 세 섹션이 페이지 하나 불러올 때마다
// 각자 다시 열어서 전체 시트를 훑던 게 "로딩이 느리다"는 민원의 주 원인이었음(회의 전 다른
// 아티팩트 버전에서 이미 한 번 겪었던 같은 종류의 문제 — 8/31 README 참고). CacheService로 60초만
// 캐시해서, 거의 동시에 들어오는 세 요청 중 하나만 실제로 열고 나머지는 캐시를 재사용하게 함.
// 응답 JSON 모양은 그대로 — 서버 내부 최적화만.
function getKpiByWeekCached_() {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'kpiByWeek';
  var cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  var base = getByWeekFromFile_(cfg_().sources.kpiFile, extractKpiStatusFromSheet_);
  try { cache.put(cacheKey, JSON.stringify(base), 60); } catch (e) {} // 캐시 실패해도 결과는 그대로 반환
  return base;
}

function getKpiData_() {
  var base = getKpiByWeekCached_();

  var latest = null, latestOrder = -1;
  Object.keys(base.byWeek).forEach(function (k) {
    var e = base.byWeek[k], o = weekOrder_(e.monthAbbr, e.weekNum);
    if (o > latestOrder && e.data) { latestOrder = o; latest = e.data; }
  });
  var sheetGoal = latest && latest.annual ? latest.annual.goal : NaN;
  var sheetH2Goal = latest && latest.h2 ? latest.h2.goal : NaN;
  base.goal = isNaN(sheetGoal) ? cfg_().kpi.goalAnnual : sheetGoal;
  base.h2Goal = isNaN(sheetH2Goal) ? cfg_().kpi.goalH2 : sheetH2Goal;
  // Base 목표(2026-10 신양식부터) — 구양식 시트만 있으면 null(화면은 Base 줄을 숨김). 고정값
  // 폴백 상수는 두지 않음(Base는 시트에만 있는 값).
  var sheetGoalBase = latest && latest.annual ? latest.annual.goalBase : NaN;
  var sheetH2GoalBase = latest && latest.h2 ? latest.h2.goalBase : NaN;
  base.goalBase = isNaN(sheetGoalBase) ? null : sheetGoalBase;
  base.h2GoalBase = isNaN(sheetH2GoalBase) ? null : sheetH2GoalBase;
  return base;
}

// ---- 최상단 AI 인사이트 바 ----
//
// 9월부터 수동 문구 대신 자동 생성으로 전환(엘라 지시: "해당 주 신규 실적"과 "연간 실적에 가장
// 큰 영향을 미치는 프로젝트"를 매번 데이터에서 뽑아서 보여줄 것). 실적현황 파일(설정 sources.kpiFile) 파일 안의 각
// (월+주차) 시트마다 아래 두 가지를 읽는다(= KPI/팀AGENDA/트렌드와 동일한 by-week 패턴 —
// 2026-09-11부터 전체 주차 토글에 포함되도록 전환, 예전엔 "가장 최근 시트"만 봤음):
// 1) "3. 월별 KPI 실적 구성 상세" 표 중, weekLabel이 그 시트 자신의 주차(예: "9월/1주차")와
//    일치하는 행만 = 그 주에 새로 반영된 실적. 시트 전체를 이전 주차와 비교(diff)하는 방식은
//    과거에 시도했다가 폐기된 적 있음(오타 정정이 "새 변화"로 잘못 잡히는 문제) — 각 행에 週가
//    이미 라벨로 박혀 있어서 diff 없이 라벨 매칭만으로 안전하게 뽑을 수 있음.
// 2) "실적 인정 사업 리스트"(하반기 누적 확정 실적) 표를 신규 계약금 내림차순 정렬한 상위 항목
//    = 하반기 실적에 가장 큰 영향을 미치는 프로젝트(이 표 자체가 하반기 기준 리스트라 "연간"이
//    아니라 "하반기"라고 표현해야 함 — 문구는 프런트 buildAutoInsightText에서 조합).
// 문장 조합(사람이 읽는 텍스트로 만드는 것)은 프런트에서 함 — 여기선 원본 수치만 정리해서 내려줌.
function extractInsightFromSheet_(sheet) {
  var mw = monthWeekFromSheetName_(sheet.getName());
  if (!mw) return { thisWeek: [], topAnnual: [] };
  var rows = sheet.getDataRange().getValues();
  var weekLabel = (MONTH_ABBR.indexOf(mw.monthAbbr) + 1) + '월/' + mw.weekNum + '주차';

  // "3. 월별 KPI 실적 구성 상세" 표에서 그 주차 라벨과 일치하는 행만 추림.
  var detailHeaderIdx = -1;
  for (var k = 0; k < rows.length; k++) {
    if (String(rows[k][0] || '').trim() === '구분' && String(rows[k][1] || '').indexOf('월/주차') >= 0) { detailHeaderIdx = k; break; }
  }
  var thisWeek = [];
  if (detailHeaderIdx >= 0) {
    for (var m = detailHeaderIdx + 1; m < rows.length; m++) {
      var r = rows[m];
      var col0 = String(r[0] || '').trim();
      var restEmpty = !r[1] && !r[2] && !r[3] && !r[4];
      if (col0 && restEmpty) break; // 다음 섹션 제목 행 도달
      var proj = String(r[2] || '').trim();
      if (!proj) continue;
      if (String(r[1] || '').trim() !== weekLabel) continue; // 그 주 항목만
      thisWeek.push({
        category: col0, project: proj,
        actual: stripUnit_(r[3]), contribPct: percentCellToPct_(r[4]),
      });
    }
  }

  // "실적 인정 사업 리스트" 표에서 신규 계약금 큰 순 상위 항목.
  var perfHeaderIdx = -1;
  for (var p = 0; p < rows.length; p++) {
    if (String(rows[p][0] || '').trim() === '아티스트' && String(rows[p][2] || '').indexOf('브랜드') >= 0) { perfHeaderIdx = p; break; }
  }
  var topAnnual = [];
  if (perfHeaderIdx >= 0) {
    for (var q = perfHeaderIdx + 1; q < rows.length; q++) {
      var rr = rows[q];
      var name = String(rr[3] || '').trim();
      var amount = stripUnit_(rr[4]);
      if (!name || isNaN(amount)) continue;
      topAnnual.push({
        artist: String(rr[0] || '').trim(), category: String(rr[1] || '').trim(),
        brand: String(rr[2] || '').trim(), name: name, amount: amount,
      });
    }
    topAnnual.sort(function (a, b) { return b.amount - a.amount; });
    topAnnual = topAnnual.slice(0, 5);
  }

  return { thisWeek: thisWeek, topAnnual: topAnnual };
}

// KPI(getKpiByWeekCached_)와 동일한 이유로 60초 캐시.
function getInsightByWeekCached_() {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'insightByWeek';
  var cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  var base = getByWeekFromFile_(cfg_().sources.kpiFile, extractInsightFromSheet_);
  try { cache.put(cacheKey, JSON.stringify(base), 60); } catch (e) {}
  return base;
}

function getInsightData_() {
  var base = dbReady_() ? getInsightDataDb_() : getInsightByWeekCached_();
  var overrides = getInsightOverrides_();
  var latestKey = null, latestOrder = -1;
  Object.keys(base.byWeek).forEach(function (key) {
    var entry = base.byWeek[key];
    var ov = overrides[key];
    entry.overrideText = ov ? ov.text : null;
    entry.overrideEditedAt = ov ? ov.editedAt : null;
    var order = weekOrder_(entry.monthAbbr, entry.weekNum);
    if (order > latestOrder) { latestOrder = order; latestKey = key; }
  });

  // 하위 호환: 운영(index.html)은 아직 주차 토글 없이 "가장 최근 주차 인사이트"만 최상위 필드로
  // 읽는 예전 방식 그대로라, byWeek만 내려주면 운영 인사이트 바가 깨진다(로딩 오버레이가 안
  // 사라지는 문제까지 발생). index.html이 이 by-week 방식으로 승격되기 전까지는 반드시 최상위
  // weekLabel/thisWeek/topAnnual/overrideText/overrideEditedAt도 "가장 최근 주차" 기준으로
  // 함께 내려줘야 함 — 지우지 말 것.
  if (latestKey) {
    var latest = base.byWeek[latestKey];
    base.weekLabel = (MONTH_ABBR.indexOf(latest.monthAbbr) + 1) + '월/' + latest.weekNum + '주차';
    base.thisWeek = latest.data.thisWeek;
    base.topAnnual = latest.data.topAnnual;
    base.overrideText = latest.overrideText;
    base.overrideEditedAt = latest.overrideEditedAt;
  } else {
    base.weekLabel = null; base.thisWeek = []; base.topAnnual = [];
    base.overrideText = null; base.overrideEditedAt = null;
  }
  return base;
}

// 인사이트 문구 "확정"/수동 수정 — AI 자동 생성 문구 위에 사람이 고치거나 그대로 확정한 내용을
// 주차별(weekKey, 예: "SEP_1")로 스크립트 속성에 저장해서 팀원 모두에게 같은 내용이 보이게 함.
// 예전엔 override 슬롯이 하나뿐이라 다른 주차를 확정하면 이전 주차 확정 내용이 사라졌는데(주차
// 토글로 과거 주차를 오가며 각각 확정해야 하는 지금 방식엔 안 맞음), 이제 { weekKey: {text,
// editedAt} } 맵 하나를 JSON으로 저장해 주차마다 독립적으로 유지되게 함.
function getInsightOverrides_() {
  var raw = PropertiesService.getScriptProperties().getProperty('INSIGHT_OVERRIDES_JSON');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

// 하위 호환: 운영(index.html)은 아직 "확정 버튼/주차별 저장" 이전 방식이라 weekKey 없이
// weekLabel만(혹은 그마저도 없이) 저장 요청을 보낸다 — 그 경우 항상 "가장 최근 주차"에 저장해서
// 예전 단일 슬롯 동작(최신 주차 하나만 수정 가능)과 똑같이 동작하게 함. 개발 서버(preview.html)는
// 항상 weekKey를 함께 보내므로 이 폴백을 타지 않는다.
function resolveInsightWeekKey_(params) {
  if (params.weekKey) return params.weekKey;
  var base = dbReady_() ? getInsightDataDb_() : getInsightByWeekCached_();
  var latestKey = null, latestOrder = -1;
  Object.keys(base.byWeek).forEach(function (key) {
    var e = base.byWeek[key];
    var order = weekOrder_(e.monthAbbr, e.weekNum);
    if (order > latestOrder) { latestOrder = order; latestKey = key; }
  });
  return latestKey || '';
}

function saveInsightOverride_(weekKey, text) {
  var props = PropertiesService.getScriptProperties();
  var overrides = getInsightOverrides_();
  if (!text) {
    delete overrides[weekKey];
  } else {
    overrides[weekKey] = { text: text, editedAt: new Date().toISOString() };
  }
  props.setProperty('INSIGHT_OVERRIDES_JSON', JSON.stringify(overrides));
}

// ---- ② 팀 AGENDA 섹션 ----

// 9월부터 3섹션 체계로 변경: ① Win / ② Share / ③ Challenge, 각 행은 "구분(광고/IP/공통) |
// 프로젝트명 | 내용" 3열. 이전(8월) 포맷은 섹션이 Wins/Challenges&Asks 2개였고 열 구성은
// "팀 | 프로젝트/건 | 내용"으로 사실상 같은 3열 구조라, 아래 로직 하나로 신구 포맷을 모두 처리한다
// (헤더 행에서 "Win"/"Share"/"Challenge" 키워드만으로 섹션을 구분하므로 "Wins"/"Challenges & Asks"도
// 자연히 매칭됨). 8월 데이터는 Share 섹션이 없어 그냥 비어 보이는 정도로, 별도 처리 불필요.
function extractAgendaFromSheet_(sheet) {
  var rows = sheet.getDataRange().getValues();
  var sections = { wins: [], share: [], challenge: [] };
  var mode = null;
  rows.forEach(function (r) {
    var first = String(r[0] || '').trim();
    if (!first) return;
    if (/win/i.test(first)) { mode = 'wins'; return; }
    if (/share/i.test(first)) { mode = 'share'; return; }
    if (/challenge/i.test(first)) { mode = 'challenge'; return; }
    if (first === '팀' || first.indexOf('구분') === 0) return; // 헤더 행
    if (first.indexOf('프로젝트 현황') >= 0) { mode = null; return; }
    if (!mode) return;
    var proj = r[1], content = r[2];
    if (!proj && !content) return;
    sections[mode].push({ label: first, proj: proj, content: content });
  });
  return sections;
}

// ---- ③ 사업 캘린더(검토 Tracker) 섹션 ----

var ARTIST_ABBR_PATTERNS = [
  [/(?<![가-힣])베이비몬스터(?![가-힣])/g, 'BM'], [/(?<![A-Za-z])BABYMONSTER(?![A-Za-z])/gi, 'BM'],
  [/(?<![가-힣])트레저(?![가-힣])/g, 'TR'], [/(?<![A-Za-z])TREASURE(?![A-Za-z])/gi, 'TR'],
  [/(?<![가-힣])블랙핑크(?![가-힣])/g, 'BP'], [/(?<![A-Za-z])BLACKPINK(?![A-Za-z])/gi, 'BP'],
  [/(?<![가-힣])위너(?![가-힣])/g, 'WIN'], [/(?<![A-Za-z])WINNER(?![A-Za-z])/gi, 'WIN'],
  [/(?<![가-힣])빅뱅(?![가-힣])/g, 'BB'], [/(?<![A-Za-z])BIGBANG(?![A-Za-z])/gi, 'BB'],
];
function abbreviateArtists_(text) {
  var out = text;
  ARTIST_ABBR_PATTERNS.forEach(function (pair) { out = out.replace(pair[0], pair[1]); });
  return out;
}

// 날짜 셀이 실제 Date 객체로 오는 경우(시트에서 날짜 형식으로 입력된 셀)와, "2026-08-21" 같은
// 문자열로 오는 경우를 둘 다 처리.
function parseTrackerDate_(raw) {
  if (Object.prototype.toString.call(raw) === '[object Date]') {
    return { year: raw.getFullYear(), month: raw.getMonth() + 1, day: raw.getDate() };
  }
  var m = String(raw || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
}

// 여러 표 중 "05_검토 Tracker" 표를 시트 이름이 아니라 헤더 셀 내용("권장 Review Date"+"Next Due")
// 으로 직접 찾음(시트 이름/개수에 안 흔들리게).
function findReviewTrackerRows_(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var values = sheets[i].getDataRange().getValues();
    for (var r = 0; r < Math.min(values.length, 5); r++) {
      var row = values[r].map(function (c) { return String(c); });
      if (row.indexOf('권장 Review Date') >= 0 && row.indexOf('Next Due') >= 0) return values;
    }
  }
  return null;
}

// 이 함수는 파일 전체(여러 달에 걸친 모든 프로젝트)의 Review/Next Due 항목을 날짜와 함께 전부
// 내려준다 — 몇 월인지에 따라 서버에서 미리 걸러내지 않는다. "이번 달 것만" 걸러내는 건 프런트에서
// isDateInMonth로 하고, 달을 넘길 때마다 새로 fetch할 필요 없이 이미 받아둔 전체 목록에서
// 다시 걸러내기만 하면 되게 만들었다(요청 수 절약 + 달 이동이 항상 같은 데이터 기준으로 일관되게).
function getCalendarData_() {
  var file = resolveLatestFile_(CAL_FOLDER_ID);
  if (!file) return { ok: true, items: [] };
  var ss = SpreadsheetApp.openById(file.getId());
  var rows = findReviewTrackerRows_(ss);
  if (!rows) return { ok: true, items: [] };
  var headerRowIdx = -1;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].indexOf('프로젝트') >= 0) { headerRowIdx = i; break; }
  }
  if (headerRowIdx < 0) return { ok: true, items: [] };
  var header = rows[headerRowIdx].map(function (h) { return String(h).trim(); });
  var colIdx = function (name) { return header.indexOf(name); };
  var col = {
    project: colIdx('프로젝트'), reviewDate: colIdx('권장 Review Date'), nextPlan: colIdx('Next Plan'),
    stage: colIdx('현재 단계'), action: colIdx('금월 Action'), nextDue: colIdx('Next Due'),
  };
  var items = [];
  for (var j = headerRowIdx + 1; j < rows.length; j++) {
    var r = rows[j];
    var rawProject = String(r[col.project] || '').trim();
    if (!rawProject) continue;
    items.push({
      project: abbreviateArtists_(rawProject),
      reviewDate: parseTrackerDate_(r[col.reviewDate]),
      nextPlan: String(r[col.nextPlan] || '').trim(),
      stage: String(r[col.stage] || '').trim(),
      action: String(r[col.action] || '').trim(),
      nextDue: parseTrackerDate_(r[col.nextDue]),
    });
  }
  return { ok: true, items: items };
}

// ---- ③-2 사업 캘린더 리뉴얼(개발 서버 preview.html 전용, 2026-09) ----
//
// 목적이 "재계약 검토 여부"에서 "기간별 액션 알림"으로 바뀜(엘라 지시) — 이제 "사업 캘린더(main)"
// 시트 하나만 쓴다. 2026-11 시트 개편으로 3개월/2개월 전 알림과 ACTION 알림 열이 없어지고
// "1개월" 알림 날짜만 남았다(엘라 지시 — ACTION 알림은 더 이상 쓰지 않음). 1개월 알림 날짜는
// 시트 수식 결과를 그대로 옮기고, D-DAY 열은 이제 남은 일수가 아니라 종료 "날짜"로 들어오므로
// 날짜면 오늘 기준 남은 일수로 바꿔서 내려준다(숫자면 그대로).
//
// 탭 이름이 아니라 헤더 셀 내용("프로젝트"+"계약 종료일"+"D-DAY")으로 표를 찾는다 — 같은
// 스프레드시트 안에 참고용 표(Next Plan 시나리오, 계약별 검토 Tracker 등)가 여러 개 있어서
// 탭 이름에 의존하면 헷갈리기 쉽다(사업 캘린더(구버전) 05_검토 Tracker에서도 같은 이유로 헤더
// 내용 매칭 방식을 씀 — findReviewTrackerRows_ 참고).
// 이 스프레드시트엔 참고용 표가 여러 개(운영안 요약/시나리오표/검토 Tracker 등) 있어서, 매번
// 탭마다 전체 데이터를 다 읽어 헤더를 찾으면 안 맞는 탭들 것까지 통째로 읽어오게 됨(로딩 속도
// 민원 대응 차원에서 줄임). 먼저 위쪽 10행만 얕게 읽어 헤더가 있는지 확인하고, 맞는 탭 하나만
// 전체를 읽는다.
function isBusinessCalendarHeader_(trimmedRow) {
  return trimmedRow.indexOf('프로젝트') >= 0 && trimmedRow.indexOf('계약 종료일') >= 0 && trimmedRow.indexOf('D-DAY') >= 0;
}

// D-DAY 셀: 날짜면 오늘(스크립트 시간대) 기준 남은 일수, 숫자면 그대로, 그 외(빈 칸·"(TBD)")는 null.
function parseDDay_(raw) {
  var d = parseTrackerDate_(raw);
  if (d) {
    var tz = Session.getScriptTimeZone();
    var t = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd').split('-');
    var today = Date.UTC(+t[0], +t[1] - 1, +t[2]);
    return Math.round((Date.UTC(d.year, d.month - 1, d.day) - today) / 86400000);
  }
  if (raw === '' || raw === null || raw === undefined) return null;
  var n = Number(raw);
  return isNaN(n) ? null : n;
}

function findBusinessCalendarRows_(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1) continue;
    var probe = sh.getRange(1, 1, Math.min(lastRow, 10), lastCol).getValues();
    var isMatch = probe.some(function (row) {
      var trimmed = row.map(function (c) { return String(c).trim(); });
      return isBusinessCalendarHeader_(trimmed);
    });
    if (isMatch) return sh.getDataRange().getValues();
  }
  return null;
}

function getBusinessCalendarData_() {
  var ss = SpreadsheetApp.openById(cfg_().sources.bizCalSheet);
  var rows = findBusinessCalendarRows_(ss);
  if (!rows) return { ok: true, items: [] };
  var headerRowIdx = -1;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i].map(function (c) { return String(c).trim(); });
    if (isBusinessCalendarHeader_(row)) { headerRowIdx = i; break; }
  }
  if (headerRowIdx < 0) return { ok: true, items: [] };
  var header = rows[headerRowIdx].map(function (h) { return String(h).trim(); });
  var colIdx = function (name) { return header.indexOf(name); };
  var col = {
    project: colIdx('프로젝트'), category: colIdx('구분'),
    start: colIdx('계약 시작일'), end: colIdx('계약 종료일'), months: colIdx('계약기간(개월)'),
    dday: colIdx('D-DAY'), m1: colIdx('1개월'),
  };
  var items = [];
  for (var j = headerRowIdx + 1; j < rows.length; j++) {
    var r = rows[j];
    var rawProject = String(r[col.project] || '').trim();
    if (!rawProject) continue;
    var markers = [];
    var m1 = parseTrackerDate_(r[col.m1]); if (m1) markers.push({ kind: 'urgent', date: m1 });
    items.push({
      project: abbreviateArtists_(rawProject),
      category: String(r[col.category] || '').trim(),
      startDate: parseTrackerDate_(r[col.start]),
      endDate: parseTrackerDate_(r[col.end]),
      months: Number(r[col.months]) || null,
      dDay: parseDDay_(r[col.dday]),
      markers: markers,
    });
  }
  return { ok: true, items: items };
}

// ---- ④ 트렌드 리포트 섹션 ----

// 8월까지: 구분(CHANCE/RISK/자유기재) | 항목 | 내용 | VOC 4열, CHANCE/RISK 고정색 + 그 외 자유
// 기재값은 등장 순서대로 extra1~4 자동 배정.
var TREND_KNOWN_CATS = {
  CHANCE: { cls: 'chance', title: 'CHANCE (기회 요인)' },
  RISK: { cls: 'risk', title: 'RISK (위기 요인)' },
};
var TREND_EXTRA_CLS = ['extra1', 'extra2', 'extra3', 'extra4'];

// 9월부터: "업계리포트" 포맷으로 변경 — 구분(내부/외부) | 아티스트 | 브랜드/파트너 | 내용 |
// VOC(팬반응) 5열. 헤더 행에 "아티스트"+"브랜드/파트너"가 있으면 새 포맷, "구분"+"항목"+VOC가
// 있으면 기존 포맷으로 자동 판별해서 8월 이전 시트도 그대로 읽을 수 있게 했다.
function extractTrendFromSheet_(sheet) {
  var rows = sheet.getDataRange().getValues();
  var headerIdx = -1, isNewFormat = false;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i].map(function (c) { return String(c).trim(); });
    if (r.indexOf('아티스트') >= 0 && r.indexOf('브랜드/파트너') >= 0) { headerIdx = i; isNewFormat = true; break; }
    if (r.indexOf('구분') >= 0 && r.indexOf('항목') >= 0 && r.some(function (c) { return c.indexOf('VOC') >= 0; })) {
      headerIdx = i; isNewFormat = false; break;
    }
  }
  if (headerIdx < 0) return [];
  return isNewFormat ? extractTrendNewFormat_(rows, headerIdx) : extractTrendOldFormat_(rows, headerIdx);
}

function extractTrendNewFormat_(rows, headerIdx) {
  var order = ['내부', '외부'];
  var byCat = {};
  for (var j = headerIdx + 1; j < rows.length; j++) {
    var r = rows[j];
    var cat = String(r[0] || '').trim();
    var artist = String(r[1] || '').trim();
    var brand = String(r[2] || '').trim();
    var content = String(r[3] || '').trim();
    if (!cat) continue;
    if (!artist && !content) continue; // 아직 안 채워진 템플릿 행
    if (!byCat[cat]) byCat[cat] = [];
    // 2026-11: VOC 열은 더 이상 읽지 않음(시트에서도 제외). 아티스트·브랜드/파트너는 화면에서 칩으로
    // 따로 보여주므로 합치지 않고 각각 내려준다("-"는 브랜드 없음 표기 → 빈 값). label은 재배포 전
    // 화면과의 호환용으로 함께 유지.
    if (brand === '-') brand = '';
    byCat[cat].push({ artist: artist, brand: brand, label: brand ? (artist + ' · ' + brand) : artist, content: content });
  }
  var sections = [];
  order.forEach(function (cat) {
    if (byCat[cat]) sections.push({ cls: cat === '내부' ? 'extra2' : 'extra1', title: '업계리포트 - ' + cat, items: byCat[cat] });
  });
  Object.keys(byCat).forEach(function (cat) {
    if (order.indexOf(cat) < 0) sections.push({ cls: 'extra3', title: '업계리포트 - ' + cat, items: byCat[cat] });
  });
  return sections;
}

function extractTrendOldFormat_(rows, headerIdx) {
  var sections = [];
  var byCat = {};
  var extraIdx = 0;
  for (var j = headerIdx + 1; j < rows.length; j++) {
    var r = rows[j];
    var catRaw = String(r[0] || '').trim();
    if (!catRaw) continue;
    var label = String(r[1] || '').trim();
    var content = String(r[2] || '').trim();
    if (!label && !content) continue;
    var cat = catRaw.toUpperCase();
    if (!byCat[cat]) {
      var known = TREND_KNOWN_CATS[cat];
      var cls = known ? known.cls : TREND_EXTRA_CLS[extraIdx++ % TREND_EXTRA_CLS.length];
      var title = known ? known.title : catRaw;
      byCat[cat] = { cls: cls, title: title, items: [] };
      sections.push(byCat[cat]);
    }
    byCat[cat].items.push({ label: label, content: content });
  }
  return sections;
}

// ---- ⑤ 팀 일정 캘린더(구글 캘린더) 섹션 ----

// "차주엔~" 인사이트 배지에 보여줄 일정을 엘라가 직접 고를 수 있는 기능(2026-09-11) — 기본은
// 'auto'(제목에 출장/촬영/업로드가 들어간 일정을 자동으로 뽑음, 프런트 matchUpcomingKeywordEvents
// 참고)이고, 프런트에서 개별 일정 체크박스로 골라 저장하면 'manual'로 전환되어 그 이벤트 id
// 목록만 보여준다. "자동으로 되돌리기"를 누르면 이 속성을 지워 다시 자동 판별로 돌아간다.
// 날짜가 지난 일정은 선택 목록에 남아있어도 (프런트에서 항상 "앞으로 10일" 범위로 다시 걸러
// 보여주므로) 자연히 배지에서 빠진다 — 이 저장값 자체를 서버가 주기적으로 청소할 필요는 없음.
function getUpcomingSelection_() {
  var raw = PropertiesService.getScriptProperties().getProperty('UPCOMING_INSIGHT_SELECTION_JSON');
  if (!raw) return { mode: 'auto', ids: [] };
  try {
    var parsed = JSON.parse(raw);
    return { mode: parsed.mode === 'manual' ? 'manual' : 'auto', ids: Array.isArray(parsed.ids) ? parsed.ids : [] };
  } catch (e) {
    return { mode: 'auto', ids: [] };
  }
}

function saveUpcomingSelection_(mode, idsJson) {
  var props = PropertiesService.getScriptProperties();
  if (mode !== 'manual') {
    props.deleteProperty('UPCOMING_INSIGHT_SELECTION_JSON');
    return;
  }
  var ids = [];
  try { ids = JSON.parse(idsJson || '[]'); } catch (e) { ids = []; }
  if (!Array.isArray(ids)) ids = [];
  props.setProperty('UPCOMING_INSIGHT_SELECTION_JSON', JSON.stringify({ mode: 'manual', ids: ids }));
}

// ---- 사업 캘린더 "사업 일정" 직접 선택(2026-11) ----
// 자동 기준(◈ 표시·키워드 — 판정은 프런트에서 함) 위에, 팀원이 일정을 직접 사업 일정으로 추가(include)하거나
// 자동으로 잡힌 걸 빼는(exclude) 선택을 저장한다. 키는 "캘린더 일정 ID|시작일(yyyy-MM-dd)" — 반복 일정은
// 인스턴스마다 getId()가 같아서 날짜를 붙여 구분한다. 저장 요청은 바뀐 키만 보낸다(include/exclude: 새로
// 기록할 키, clear: 자동 기준과 같아져서 기록을 지울 키) — GET URL 길이를 작게 유지하기 위함.
// 스크립트 속성 값 한도(약 9KB) 때문에 저장할 때마다 시작일이 6개월보다 오래된 키는 지운다.
var BIZ_OVERRIDE_PROP = 'BIZ_EVENT_OVERRIDES_JSON';
var BIZ_OVERRIDE_MAX_CHARS = 8500;

function getBizEventOverrides_() {
  var raw = PropertiesService.getScriptProperties().getProperty(BIZ_OVERRIDE_PROP);
  if (!raw) return { include: [], exclude: [] };
  try {
    var parsed = JSON.parse(raw);
    return {
      include: Array.isArray(parsed.include) ? parsed.include : [],
      exclude: Array.isArray(parsed.exclude) ? parsed.exclude : [],
    };
  } catch (e) {
    return { include: [], exclude: [] };
  }
}

function parseKeyList_(json) {
  try {
    var arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch (e) {
    return [];
  }
}

function saveBizEventOverrides_(includeJson, excludeJson, clearJson) {
  var inc = parseKeyList_(includeJson), exc = parseKeyList_(excludeJson), clr = parseKeyList_(clearJson);
  // 여러 팀원이 동시에 저장해도 서로의 선택을 덮어쓰지 않도록 읽기-병합-쓰기를 잠금 안에서 처리.
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cur = getBizEventOverrides_();
    var touched = {};
    inc.concat(exc, clr).forEach(function (k) { touched[k] = true; });
    var cutoff = formatCalDate_(new Date(new Date().getTime() - 183 * 86400000));
    var keep = function (k) {
      if (touched[k]) return false;
      var d = String(k).split('|').pop();
      return !(/^\d{4}-\d{2}-\d{2}$/.test(d) && d < cutoff);
    };
    var next = { include: cur.include.filter(keep).concat(inc), exclude: cur.exclude.filter(keep).concat(exc) };
    var json = JSON.stringify(next);
    if (json.length > BIZ_OVERRIDE_MAX_CHARS) throw new Error('직접 선택한 일정이 너무 많아 저장할 수 없습니다. 대시보드 담당자에게 알려주세요.');
    PropertiesService.getScriptProperties().setProperty(BIZ_OVERRIDE_PROP, json);
    return next;
  } finally {
    lock.releaseLock();
  }
}

function formatCalDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// 구글 캘린더 API 이벤트 객체와 최대한 비슷한 모양({summary, start:{dateTime|date}, end:{...}})으로
// 반환 — 클라이언트의 날짜 스팬 계산 로직을 손 안 대고 그대로 재사용하기 위함.
function getTeamCalendarData_(year, month) {
  if (!year || !month) return { ok: true, events: [] };
  // 팀 일정 캘린더 그리드와 "차주 인사이트" 배지가 같은 달을 거의 동시에 두 번 요청하는 경우가
  // 많아서(둘 다 오늘이 속한 달을 봄), 60초 캐시로 중복 CalendarApp 호출을 줄인다(로딩 속도 민원
  // 대응 — 실적현황 파일(설정 sources.kpiFile) 쪽과 같은 이유의 같은 종류 문제). 에러 응답은 캐시하지 않음(재시도 가능하게).
  var cache = CacheService.getScriptCache();
  var cacheKey = 'teamCal_' + year + '_' + month;
  var cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  var cal = CalendarApp.getCalendarById(cfg_().sources.teamCalendar);
  if (!cal) {
    // CalendarApp 권한이 아직 승인 안 됐거나 ID가 잘못된 경우 — 조용히 빈 배열을 주면 "연동이 안
    // 되는데 원인을 모르겠다" 상태가 되므로, 원인을 알 수 있게 명시적 에러로 내려준다. 이 메시지는
    // 팀원 화면에 그대로 뜨는데 팀원은 Apps Script 편집기 접근 권한이 없어 함수를 실행할 수
    // 없으므로, 함수 이름을 지시하는 대신 담당자에게 알리라고 안내한다(원인 진단은 실행 로그로).
    return { ok: false, error: 'calendar_not_found', message: '팀 일정 캘린더를 열 수 없습니다. 대시보드 담당자에게 알려주세요.' };
  }
  var rangeStart = new Date(year, month - 1, 1);
  var rangeEnd = new Date(year, month, 1);
  var events = cal.getEvents(rangeStart, rangeEnd);
  var out = events.map(function (ev) {
    // getId()는 구글 캘린더가 이벤트마다 부여하는 고유 식별자 — "차주 인사이트 배지에 보여줄
    // 일정 직접 선택" 기능(2026-09-11)이 제목/날짜가 아니라 이 id로 선택을 저장해서, 제목이
    // 같은 반복 일정이 여러 개 있어도 서로 안 헷갈리게 구분한다.
    if (ev.isAllDayEvent()) {
      return {
        id: ev.getId(),
        summary: ev.getTitle(),
        start: { date: formatCalDate_(ev.getStartTime()) },
        end: { date: formatCalDate_(ev.getEndTime()) },
      };
    }
    return {
      id: ev.getId(),
      summary: ev.getTitle(),
      start: { dateTime: ev.getStartTime().toISOString() },
      end: { dateTime: ev.getEndTime().toISOString() },
    };
  });
  var result = { ok: true, events: out };
  try { cache.put(cacheKey, JSON.stringify(result), 60); } catch (e) {}
  return result;
}
