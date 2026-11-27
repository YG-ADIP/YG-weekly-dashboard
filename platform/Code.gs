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
var PLATFORM_SECTION_KEYS = ['kpi', 'newdeals', 'report', 'agenda', 'bizcal', 'trend', 'teamcal']; // 월별 트래킹은 2026-11 삭제, 보고 진행 현황 2026-11 추가
var DEFAULT_CONFIG = {
  general: { title: '주간회의 대시보드', teamName: '광고IP사업팀', teamNameEn: 'AD/IP BUSINESS', year: 2026 },
  // 데이터는 모두 플랫폼에서 직접 입력해 협업 DB(구글 시트 1개)에 저장(2026-11, 기존 시트·폴더 연동 삭제)
  sources: {
    bisFolder: '',  // BIS 업로드 폴더(드라이브) — BIS 매출현황·진행현황 엑셀을 넣어 두면 [드라이브에서 가져오기]로 반영
    teamCalendar: 'c_ba39a76170dcab8c99022cc72144d5706bda1be2cfd589a88eabe857259799a3@group.calendar.google.com',
    teamCalendarLabel: '광고 IP 사업팀 캘린더',
    dbSheet: '', // 협업 DB(구글 시트) — 관리자 모드 [플랫폼 시작하기]로 생성. 모든 화면이 여기서 읽고 씀
  },
  bizCal: {
    alertMonths: [3, 1], // 계약 종료일 기준 N개월 전 알림
    keywords: ['운영종료', '서비스종료', '행사', '전시', '촬영', '업로드', '게시', '시딩', 'SNS'],
    useMark: true, mark: '◈', // 팀 캘린더 제목에 이 표시가 있으면 사업 일정
  },
  teamCal: { upcomingKeywords: ['출장', '촬영', '업로드'], upcomingDays: 10 }, // "차주엔~" 배지
  sections: [
    { key: 'kpi', title: '{year} KPI 현황', visible: true },
    { key: 'newdeals', title: '이번 주 신규 사업', visible: true },
    { key: 'report', title: '보고 진행 현황', visible: true },
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
  var g = c.general || {}, src = c.sources || {}, b = c.bizCal || {}, t = c.teamCal || {};
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
  d.sections.forEach(function (def, i) { // 빠진 섹션(새로 생긴 섹션 등)은 기본 순서상 바로 앞 섹션 뒤에 끼움
    if (sections.some(function (x) { return x.key === def.key; })) return;
    var prev = i > 0 ? d.sections[i - 1].key : null, at = -1;
    sections.forEach(function (x, j) { if (x.key === prev) at = j; });
    var item = { key: def.key, title: def.title, visible: def.visible };
    if (at >= 0) sections.splice(at + 1, 0, item); else sections.push(item); // 앞 섹션이 없으면 예전처럼 맨 뒤
  });
  return {
    general: {
      title: cleanText_(g.title, 40, d.general.title),
      teamName: cleanText_(g.teamName, 40, d.general.teamName),
      teamNameEn: cleanText_(g.teamNameEn, 40, d.general.teamNameEn),
      year: clampInt_(g.year, 2000, 2100, d.general.year),
    },
    sources: {
      bisFolder: extractId_(src.bisFolder),
      teamCalendar: extractId_(src.teamCalendar) || d.sources.teamCalendar,
      teamCalendarLabel: cleanText_(src.teamCalendarLabel, 40, d.sources.teamCalendarLabel),
      dbSheet: extractId_(src.dbSheet),
    },
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
    // 구분: '진행 중' / '확정' / '종료'(불발·보류) — 예전 숫자(가중치)도 받아서 구분으로 바꿈
    var k = String(weight === undefined ? '' : weight).trim(), w;
    if (/확정/.test(k)) w = 100; else if (/종료|불발|보류/.test(k)) w = 0; else if (/진행/.test(k) || k === '') w = 50;
    else { var n = parseFloat(k); w = isNaN(n) ? 50 : n >= 100 ? 100 : n <= 0 ? 0 : 50; }
    stages.push({ name: name.slice(0, 20), weight: w, desc: String(desc || '').trim().slice(0, 60) });
  });
  if (stages.length) out.stages = stages;
  ['groups', 'ctypes', 'ckinds', 'items', 'currencies', 'nextActions'].forEach(function (k) {
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
    sources: { teamCalendarLabel: c.sources.teamCalendarLabel },
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

// 대시보드 읽기 묶음 호출: 화면이 동시에 보내던 여러 읽기 요청(KPI·AGENDA·트렌드·인사이트·캘린더…)을 한 번에 처리.
// 동시 접속 때 Apps Script 동시 실행 한도(계정당 30건)를 넘지 않도록 접속당 서버 실행 수를 줄이기 위함.
var BATCHABLE_SECTIONS = { kpi: 1, insight: 1, agenda: 1, trend: 1, businessCalendar: 1, teamCalendar: 1, upcomingSelection: 1, bizEventOverrides: 1 };
function apiBatch(password, requestsJson) {
  var reqs = [];
  try { reqs = JSON.parse(requestsJson || '[]') || []; } catch (e) { reqs = []; }
  var out = reqs.slice(0, 30).map(function (r) {
    var params = (r && r.params) || {};
    params.section = r && r.section;
    params.password = password;
    if (!BATCHABLE_SECTIONS[params.section]) return { ok: false, error: 'not_batchable' };
    try { return handleApi_(params); } catch (err) { return { ok: false, error: 'server_error', message: String(err && err.message || err) }; }
  });
  return JSON.stringify(out);
}

// 잠금 대기: 큰 작업(가져오기·대량 업로드) 중이면 최대 30초 기다리고, 그래도 안 되면 'BUSY'로 알림(아무것도 쓰지 않은 상태)
function waitLockOrBusy_(lock, ms) {
  try { lock.waitLock(ms || 30000); }
  catch (e) { var err = new Error('BUSY: 다른 분이 업로드·가져오기 같은 큰 작업을 하고 있어요. 잠시 후 다시 시도해 주세요.'); err.busy = true; throw err; }
}

var FRESH_DONE_ = false;
function handleApi_(params) {
  var pw = getPassword_();
  if (!pw || params.password !== pw) return { ok: false, error: 'unauthorized' };
  if (params.fresh && !FRESH_DONE_) { FRESH_DONE_ = true; try { if (dbReady_()) bumpDbVer_(); } catch (e) {} } // [새로고침] — 표 캐시 비우고 최신 값
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
      case 'kpi': return dbReady_() ? getKpiDataDb_() : { ok: false, error: 'no_db', message: '협업 DB가 아직 없습니다. 관리자 모드 → [플랫폼 시작하기]로 만들어 주세요.' };
      case 'insight': return getInsightData_();
      case 'saveInsight':
        saveInsightOverride_(resolveInsightWeekKey_(params), String(params.text || '').trim());
        return { ok: true };
      case 'agenda': return dbReady_() ? getAgendaDataDb_() : { ok: true, byWeek: {} };
      case 'trend': return dbReady_() ? getTrendDataDb_() : { ok: true, byWeek: {} };
      case 'businessCalendar': return dbReady_() ? getBusinessCalendarDataDb_() : { ok: true, items: [] };
      case 'teamCalendar':
        return getTeamCalendarData_(parseInt(params.year, 10), parseInt(params.month, 10), !!params.fresh);
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
    if (err && err.busy) return { ok: false, error: 'busy', message: String(err.message).replace(/^BUSY:\s*/, '') };
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
      case 'save': res = { ok: true, config: saveConfig_(keepCodes_(sanitizeConfig_(payload.config)), payload.by, payload.memo) }; break;
      case 'restore': res = { ok: true, config: restoreConfig_(payload.key, payload.by) }; break;
      case 'reset': res = { ok: true, config: saveConfig_(keepCodes_(sanitizeConfig_({})), payload.by, '기본값으로 복원') }; break;
      case 'passwords': changePasswords_(payload.dashboard, payload.admin); res = { ok: true }; break;
      case 'createDb': res = { ok: true, db: createDb_(payload.by), config: cfg_() }; break;
      case 'status': res = adminStatus_(); break;
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
  waitLockOrBusy_(lock, 30000);
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
  return saveConfig_(keepCodes_(sanitizeConfig_(JSON.parse(raw))), by, '되돌리기: ' + entry.at + ' 설정');
}
// 진행 단계·선택 목록은 사업 데이터와 맞물려 있어 설정 저장·되돌리기로 바뀌지 않게 지금 값을 유지
function keepCodes_(config) { config.codes = JSON.parse(JSON.stringify(cfg_().codes || {})); return config; }

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
  CFG_OVERRIDE_ = config;
  try {
    add('협업 DB', function () {
      if (!config.sources.dbSheet) return { ok: false, detail: '아직 없음 — 관리자 모드 → 기준 정보 탭 [플랫폼 시작하기]로 만들어 주세요.' };
      var ss = SpreadsheetApp.openById(config.sources.dbSheet);
      var missing = DB_TABLE_ORDER.filter(function (k) { return !ss.getSheetByName(DB_TABLES[k].sheet); });
      return missing.length
        ? { ok: false, detail: ss.getName() + ' — 없는 탭: ' + missing.map(function (k) { return DB_TABLES[k].sheet; }).join(', ') }
        : { ok: true, detail: ss.getName() + ' · 탭 ' + DB_TABLE_ORDER.length + '개 확인' };
    });
    add('BIS 업로드 폴더', function () {
      if (!config.sources.bisFolder) return { ok: false, detail: '아직 지정 안 됨 — BIS 매출현황·진행현황 엑셀을 넣을 드라이브 폴더 주소를 붙여 넣어 주세요.' };
      var r = bisDriveFiles_(config.sources.bisFolder);
      var n = function (k) { return r.files.filter(function (f) { return f.kind === k; }).length; };
      return n('sales') || n('pipe')
        ? { ok: true, detail: r.folder + ' · 매출현황 ' + n('sales') + '개 · 진행현황 ' + n('pipe') + '개 확인' }
        : { ok: true, detail: r.folder + ' · 열림(아직 BIS 엑셀 없음)' };
    });
    add('주간 자동 기록(금 18시)', function () {
      var st = weeklySnapshotState_();
      return st.installed
        ? { ok: true, detail: '예약됨 · 매주 금요일 18시 KPI 주간기록' + (st.last ? ' · 마지막 기록 ' + st.last : '') }
        : { ok: false, detail: '예약 안 됨 — Apps Script 편집기에서 함수 setupWeeklySnapshot 을 한 번 실행해 주세요(권한 승인).' };
    });
    add('팀 구글 캘린더', function () {
      var cal = CalendarApp.getCalendarById(config.sources.teamCalendar);
      if (!cal) return { ok: false, detail: '캘린더를 열 수 없습니다(ID 또는 공유 권한 확인).' };
      var now = new Date(), later = new Date(now.getTime() + 30 * 86400000);
      return { ok: true, detail: cal.getName() + ' · 앞으로 30일 일정 ' + cal.getEvents(now, later).length + '건' };
    });
  } finally {
    CFG_OVERRIDE_ = null;
  }
  return results;
}

// 관리자 설정 맨 위 '설정 점검표'(빠르게 — 실제 연결 확인은 [연결 테스트])
function adminStatus_() {
  var c = cfg_(), weekly = { installed: false, last: '' };
  try { weekly = weeklySnapshotState_(); } catch (e) { weekly = { installed: false, last: '', error: String(e && e.message || e) }; }
  return {
    ok: true,
    db: { ready: !!c.sources.dbSheet, url: c.sources.dbSheet ? 'https://docs.google.com/spreadsheets/d/' + c.sources.dbSheet + '/edit' : '' },
    bisFolder: { set: !!c.sources.bisFolder, url: c.sources.bisFolder ? 'https://drive.google.com/drive/folders/' + c.sources.bisFolder : '' },
    weekly: weekly,
    teamCalendar: { set: !!c.sources.teamCalendar },
  };
}

// 배포 전에 딱 한 번 수동 실행해서 Calendar 권한 승인 팝업을 미리 띄우기 위한 함수.
// 스크립트 에디터에서 이 함수를 선택해 ▶ 실행하면 됨(웹 앱 요청에서는 호출되지 않음).
// 이름 끝에 밑줄(_)을 안 붙인 이유: Apps Script가 밑줄로 끝나는 함수는 "내부용"으로 보고
// 상단 실행 드롭다운에 안 보여주기 때문 — 이 함수는 사람이 직접 선택해서 실행해야 하므로 예외.
function manualAuthTest() {
  Logger.log(getTeamCalendarData_(new Date().getFullYear(), new Date().getMonth() + 1));
}

// ---- 공통 유틸 ----

// 월/주차를 하나의 정렬 가능한 숫자로("SEP 1주차" > "AUG 4주차"가 되도록).
function weekOrder_(monthAbbr, weekNum) {
  return MONTH_ABBR.indexOf(monthAbbr) * 100 + weekNum;
}

// ---- ① KPI 섹션 ----

function getInsightData_() {
  var base = dbReady_() ? getInsightDataDb_() : { ok: true, byWeek: {} };
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
  var base = dbReady_() ? getInsightDataDb_() : { ok: true, byWeek: {} };
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
  waitLockOrBusy_(lock, 30000);
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
function getTeamCalendarData_(year, month, fresh) {
  if (!year || !month) return { ok: true, events: [] };
  // 팀 일정 캘린더 그리드와 "차주 인사이트" 배지가 같은 달을 거의 동시에 두 번 요청하는 경우가
  // 많아서(둘 다 오늘이 속한 달을 봄), 60초 캐시로 중복 CalendarApp 호출을 줄인다(로딩 속도 민원
  // 대응 — 실적현황 파일(설정 sources.kpiFile) 쪽과 같은 이유의 같은 종류 문제). 에러 응답은 캐시하지 않음(재시도 가능하게).
  var cache = CacheService.getScriptCache();
  var cacheKey = 'teamCal_' + year + '_' + month;
  var cached = fresh ? null : cache.get(cacheKey); // [새로고침]이면 캘린더를 새로 조회
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
  try { cache.put(cacheKey, JSON.stringify(result), 600); } catch (e) {} // 10분(새로고침 시 즉시 새로 조회)
  return result;
}
