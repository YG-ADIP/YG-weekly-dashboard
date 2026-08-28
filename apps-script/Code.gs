/**
 * YG 주간 대시보드 — 팀 공개용 백엔드 (Google Apps Script Web App)
 *
 * 역할: 엘라 구글 계정 권한으로 구글드라이브/캘린더를 읽고, 공통 비밀번호를 확인한 뒤에만
 * JSON으로 데이터를 내려준다. 팀원은 구글 계정 없이 비밀번호만 알면 접근 가능.
 *
 * 배포 방법(엘라가 직접):
 * 1. script.google.com → 새 프로젝트(또는 기존 프로젝트) → 이 파일 내용을 통째로 붙여넣기
 * 2. 프로젝트 설정(⚙) → 스크립트 속성 → 속성 추가:
 *    - DASHBOARD_PASSWORD: 공통 비밀번호
 *    - INSIGHT_TEXT: 최상단 인사이트 바에 띄울 문구(예: "8월 한달 실적은 8.3억원이며, 치타토
 *      (7.25억원) 광고 모델 계약이 주요 기여 항목입니다.") — 실적 숫자가 들어가는 문구라 공개
 *      코드에는 못 두고 여기 스크립트 속성으로만 관리. 문구 바뀌면 이 값만 바꾸면 됨(재배포 불필요).
 * 3. 배포 → 새 배포(처음이라면) 또는 배포 관리 → 기존 배포 수정(URL 유지하고 싶으면 이 쪽)
 *    - 유형: 웹 앱 / 실행 계정: 나(본인) / 액세스 권한: 모든 사용자(Anyone)
 *    - 이번에 캘린더 기능이 추가돼서 재배포 시 권한 재승인 팝업이 한 번 더 뜰 수 있음 — 승인 진행.
 * 4. 배포 후 나오는 웹 앱 URL(.../exec로 끝남)을 대시보드 담당자(클로드)에게 전달
 */

var PERF_FOLDER_ID = '1rYBmUGSk2K0tyv4CcXd7XpiziVzLxgPh';   // 2026 KPI 현황
var AGENDA_FOLDER_ID = '1Au_nUt3pQ7nVStq-oITUGTAgwZkprWiP'; // 팀 AGENDA
var CAL_FOLDER_ID = '1WSM_HwsjxzTC2EmU4i2r7aEuA1u7zqhq';    // 사업 캘린더
var TREND_FOLDER_ID = '1Yqn8wrnsTePtN9OMIaEgBgBIqr1QEmc6';  // 트렌드 리포트
var KPI_MASTER_ID = '1Ej7edr36XJFFC_JQPwidWY_ikaet867hT6gD--BomlU'; // 월별 트래킹(= perf 폴더 파일과 동일 파일)
var TEAM_CAL_ID = 'c_ba39a76170dcab8c99022cc72144d5706bda1be2cfd589a88eabe857259799a3@group.calendar.google.com';

// KPI 목표(연간/하반기)는 대표님/팀장님이 확정한 고정값 — 시트에서 다시 계산하지 않고 여기서만
// 고정 관리(주간회의_대시보드.html의 KPI_GOAL과 동일 규칙). 공개 저장소(GitHub) 코드에는 이 숫자가
// 안 보이도록 여기 Apps Script(비공개) 쪽에만 두고, 응답 JSON으로 내려줌.
var KPI_GOAL_ANNUAL = 222;
var KPI_GOAL_H2 = 101;
var MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function getPassword_() {
  return PropertiesService.getScriptProperties().getProperty('DASHBOARD_PASSWORD');
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  var pw = getPassword_();
  if (!pw || params.password !== pw) {
    return jsonOutput_({ ok: false, error: 'unauthorized' });
  }
  try {
    switch (params.section) {
      case 'kpi': return jsonOutput_(getKpiData_());
      case 'monthlyTracking': return jsonOutput_(getMonthlyTrackingData_());
      case 'agenda': return jsonOutput_(getByWeekSectionData_(AGENDA_FOLDER_ID, extractAgendaFromSheet_));
      case 'trend': return jsonOutput_(getByWeekSectionData_(TREND_FOLDER_ID, extractTrendFromSheet_));
      case 'calendar': return jsonOutput_(getCalendarData_());
      case 'teamCalendar':
        return jsonOutput_(getTeamCalendarData_(parseInt(params.year, 10), parseInt(params.month, 10)));
      default:
        return jsonOutput_({ ok: false, error: 'unknown_section' });
    }
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'server_error', message: String(err) });
  }
}

// ---- 공통 유틸 ----

// 시트 셀에 "222억"처럼 단위가 붙어있는 값에서 숫자만 뽑음(주간회의_대시보드.html의 stripUnit과 동일 규칙).
function stripUnit_(v) {
  if (v === null || v === undefined || v === '') return NaN;
  var m = String(v).match(/-?[\d.]+/);
  return m ? parseFloat(m[0]) : NaN;
}

// 파일명 끝의 "_AUG" 같은 영문 월 약어를 뽑음(주간회의_대시보드.html의 monthAbbrFromTitle과 동일 규칙).
function monthAbbrFromTitle_(title) {
  var m = /_([A-Za-z]{3})\s*$/.exec((title || '').trim());
  if (!m) return null;
  var abbr = m[1].toUpperCase();
  return MONTH_ABBR.indexOf(abbr) >= 0 ? abbr : null;
}

// 시트명 끝의 "_3" 같은 주차 숫자를 뽑음(주간회의_대시보드.html의 weekNumFromSheet와 동일 규칙).
function weekNumFromSheetName_(name) {
  var m = /_(\d+)\s*$/.exec(name || '');
  return m ? parseInt(m[1], 10) : null;
}

// 폴더 안에서 파일명 월 약어가 가장 늦은(최신) 시트 파일을 고름 — 없으면 최근 수정 순.
function resolveLatestMonthFile_(folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var it = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  var files = [];
  while (it.hasNext()) files.push(it.next());
  if (!files.length) return null;
  var withAbbr = files.map(function (f) { return { f: f, abbr: monthAbbrFromTitle_(f.getName()) }; });
  var named = withAbbr.filter(function (x) { return x.abbr; });
  if (named.length) {
    named.sort(function (a, b) { return MONTH_ABBR.indexOf(b.abbr) - MONTH_ABBR.indexOf(a.abbr); });
    return named[0].f;
  }
  files.sort(function (a, b) { return b.getLastUpdated() - a.getLastUpdated(); });
  return files[0];
}

// KPI/팀AGENDA/트렌드 공통 패턴: 폴더의 최신 파일을 찾아, "_숫자"로 끝나는 주차 시트마다
// extractorFn(sheet)를 돌려서 { 주차숫자: 결과 } 형태로 모음(원본의 categorySheetCache와 동일한 개념,
// 다만 원본은 시트 원문 텍스트를 캐싱하고 클라이언트가 나중에 파싱했다면, 여기선 서버에서 이미 파싱해서 내려줌).
function getByWeekSectionData_(folderId, extractorFn) {
  var file = resolveLatestMonthFile_(folderId);
  if (!file) return { ok: true, monthAbbr: null, byWeek: {} };
  var ss = SpreadsheetApp.openById(file.getId());
  var byWeek = {};
  ss.getSheets().forEach(function (sh) {
    var num = weekNumFromSheetName_(sh.getName());
    if (num == null) return;
    byWeek[num] = extractorFn(sh);
  });
  return { ok: true, monthAbbr: monthAbbrFromTitle_(file.getName()), byWeek: byWeek };
}

// ---- ① KPI 섹션 ----

// 시트 안 "1. 2026 KPI 현황" 표를 읽어 {annual:{goal,actual,ach}, h2:{...}} 형태로 반환.
// 주간회의_대시보드.html의 extractKpiStatusRows와 동일한 판별 로직을, 문자열 파싱 대신
// getDataRange().getValues()의 2차원 배열을 직접 순회하는 방식으로 재구현(더 견고함).
function extractKpiStatusFromSheet_(sheet) {
  var values = sheet.getDataRange().getValues();
  var headerIdx = -1;
  for (var i = 0; i < values.length; i++) {
    var c0 = String(values[i][0] || '').trim();
    var c1 = String(values[i][1] || '');
    if (c0 === '구분' && c1.indexOf('목표') >= 0) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return null;
  var out = {};
  for (var j = headerIdx + 1; j < values.length; j++) {
    var label = String(values[j][0] || '').trim();
    if (!label) continue;
    if (/^\d+\./.test(label)) break; // 다음 섹션("2. 월별 팀 KPI PLAN") 시작
    var goal = stripUnit_(values[j][1]), actual = stripUnit_(values[j][2]), ach = stripUnit_(values[j][3]);
    if (isNaN(goal) && isNaN(actual)) continue;
    if (label.indexOf('전체') >= 0) out.annual = { goal: goal, actual: actual, ach: ach };
    else if (label.indexOf('상반기') >= 0) out.h1 = { goal: goal, actual: actual, ach: ach };
    else if (label.indexOf('하반기') >= 0) out.h2 = { goal: goal, actual: actual, ach: ach };
  }
  return (out.annual || out.h2) ? out : null;
}

function getKpiData_() {
  var base = getByWeekSectionData_(PERF_FOLDER_ID, extractKpiStatusFromSheet_);
  base.goal = KPI_GOAL_ANNUAL;
  base.h2Goal = KPI_GOAL_H2;
  base.insightText = PropertiesService.getScriptProperties().getProperty('INSIGHT_TEXT') || '';
  return base;
}

// ---- ①-2 월별 트래킹 섹션 ----

// KPI_MASTER_ID 파일(= perf 폴더의 최신 파일과 동일 파일)의 주차 시트 중 "가장 최근 주차" 시트에서
// "9월" 블록을 찾아 읽음(원본은 이 파일의 모든 시트를 텍스트로 이어붙여서 첫 "9월" 매치를 썼는데, 그건
// 어느 시트가 먼저 잡힐지 사실상 임의였음 — 여기선 명시적으로 "가장 최근 주차 시트"를 골라 일관되게 함).
// 열 위치 탐색 로직은 원본 extractMonthlyWeeklyTracking(parseAllMdRows 포함)과 동일, 입력만
// getValues() 2차원 배열로 교체.
function getMonthlyTrackingData_() {
  var ss = SpreadsheetApp.openById(KPI_MASTER_ID);
  var latestSheet = null, latestNum = -1;
  ss.getSheets().forEach(function (sh) {
    var num = weekNumFromSheetName_(sh.getName());
    if (num != null && num > latestNum) { latestNum = num; latestSheet = sh; }
  });
  if (!latestSheet) return { ok: true, weeks: [] };
  var rows = latestSheet.getDataRange().getValues();
  var monthLabel = '9월';
  var monthRowIdx = -1;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].indexOf(monthLabel) >= 0) { monthRowIdx = i; break; }
  }
  if (monthRowIdx < 2) return { ok: true, weeks: [] };
  var headerRow = rows[monthRowIdx];
  var dateRow = rows[monthRowIdx - 2];
  var monthColIdx = headerRow.indexOf(monthLabel);
  if (monthColIdx < 0) return { ok: true, weeks: [] };
  var wantLabels = ['목표', '실적', '합계', '달성률'];
  var valuesByLabel = {};
  for (var k = monthRowIdx + 1; k < rows.length && k <= monthRowIdx + 6; k++) {
    var label = String(rows[k][monthColIdx] || '');
    if (wantLabels.indexOf(label) >= 0) valuesByLabel[label] = rows[k];
  }
  var weeks = [];
  var col = monthColIdx + 1;
  while (col < headerRow.length && (headerRow[col] === '광고' || headerRow[col] === 'IP')) {
    weeks.push({
      range: (dateRow && dateRow[col]) || '',
      goal: (valuesByLabel['목표'] && valuesByLabel['목표'][col]) || '',
      adActual: (valuesByLabel['실적'] && valuesByLabel['실적'][col]) || '',
      ipActual: (valuesByLabel['실적'] && valuesByLabel['실적'][col + 1]) || '',
      cum: (valuesByLabel['합계'] && valuesByLabel['합계'][col]) || '',
      rate: (valuesByLabel['달성률'] && valuesByLabel['달성률'][col]) || '',
    });
    col += 2; // 목표/합계/달성률은 광고/IP 한 쌍(병합 셀)이라 2칸씩 건너뜀
  }
  return { ok: true, weeks: weeks };
}

// ---- ② 팀 AGENDA 섹션 ----

// WCA 엑셀 구조(Wins 표: 팀/프로젝트/내용, Challenges&Asks 표: 팀/프로젝트/내용/요청대상/기한) —
// 원본 extractAgendaRows와 동일 로직, 입력만 getValues() 배열로 교체.
function extractAgendaFromSheet_(sheet) {
  var rows = sheet.getDataRange().getValues();
  var wins = [], ca = [];
  var mode = null;
  rows.forEach(function (r) {
    var first = String(r[0] || '');
    if (first.indexOf('Wins') >= 0) { mode = 'wins'; return; }
    if (first.indexOf('Challenges') >= 0 || first.indexOf('Asks') >= 0) { mode = 'ca'; return; }
    if (first.indexOf('프로젝트 현황') >= 0) { mode = null; return; }
    if (!mode) return;
    if (first === '팀' || first === '') return; // 헤더/빈행
    var team = r[0], proj = r[1], content = r[2];
    if (!proj && !content) return;
    if (mode === 'wins') wins.push({ team: team, proj: proj, content: content });
    else ca.push({ team: team, proj: proj, content: content, target: r[3], due: r[4] });
  });
  return { wins: wins, ca: ca };
}

// ---- ③ 사업 캘린더(검토 Tracker) 섹션 ----

// 캘린더 카드에서 아티스트명은 약어로 표기(원본 ARTIST_ABBR/abbreviateArtists와 동일).
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
// 문자열로 오는 경우를 둘 다 처리(원본 parseTrackerDate는 문자열만 가정했는데, Apps Script
// getValues()는 날짜 서식 셀을 Date 객체로 주기 때문에 이 처리가 추가로 필요함).
function parseTrackerDate_(raw) {
  if (Object.prototype.toString.call(raw) === '[object Date]') {
    return { year: raw.getFullYear(), month: raw.getMonth() + 1, day: raw.getDate() };
  }
  var m = String(raw || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
}

// 여러 표 중 "05_검토 Tracker" 표를 시트 이름이 아니라 헤더 셀 내용("권장 Review Date"+"Next Due")
// 으로 직접 찾음(원본 findReviewTrackerTable과 같은 이유 — 시트 이름/개수에 안 흔들리게).
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

function getCalendarData_() {
  var file = resolveLatestMonthFile_(CAL_FOLDER_ID);
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

// ---- ④ 트렌드 리포트 섹션 ----

// 구분(CHANCE/RISK/자유기재) | 항목 | 내용 | VOC 4개 열. CHANCE/RISK는 고정 색상, 그 외 값은
// 등장 순서대로 extra1~4 자동 배정(원본 extractTrendSections와 동일 로직, Map 대신 배열로 반환해서
// JSON 직렬화 시 순서 보존).
var TREND_KNOWN_CATS = {
  CHANCE: { cls: 'chance', title: 'CHANCE (기회 요인)' },
  RISK: { cls: 'risk', title: 'RISK (위기 요인)' },
};
var TREND_EXTRA_CLS = ['extra1', 'extra2', 'extra3', 'extra4'];

function extractTrendFromSheet_(sheet) {
  var rows = sheet.getDataRange().getValues();
  var sections = [];
  var byCat = {};
  var extraIdx = 0;
  rows.forEach(function (r) {
    var catRaw = String(r[0] || '').trim();
    if (!catRaw || catRaw === '구분') return;
    var label = String(r[1] || '').trim();
    var content = String(r[2] || '').trim();
    var voc = String(r[3] || '').trim();
    if (!label && !content) return;
    var cat = catRaw.toUpperCase();
    if (!byCat[cat]) {
      var known = TREND_KNOWN_CATS[cat];
      var cls = known ? known.cls : TREND_EXTRA_CLS[extraIdx++ % TREND_EXTRA_CLS.length];
      var title = known ? known.title : catRaw;
      byCat[cat] = { cls: cls, title: title, items: [] };
      sections.push(byCat[cat]);
    }
    byCat[cat].items.push({ label: label, content: content, voc: voc });
  });
  return sections;
}

// ---- ⑤ 팀 일정 캘린더(구글 캘린더) 섹션 ----

function formatCalDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// 구글 캘린더 API 이벤트 객체와 최대한 비슷한 모양({summary, start:{dateTime|date}, end:{...}})으로
// 반환 — 원본의 eventDateRange/buildTeamCalWeeks(주간회의_대시보드.html :1694, :1707) 날짜 계산
// 로직을 클라이언트에서 손 안 대고 그대로 재사용하기 위함(원본이 window.claude.mcp의 list_events
// 결과를 그 모양 그대로 썼던 것과 동일한 계약을 유지).
function getTeamCalendarData_(year, month) {
  if (!year || !month) return { ok: true, events: [] };
  var cal = CalendarApp.getCalendarById(TEAM_CAL_ID);
  if (!cal) return { ok: true, events: [] };
  var rangeStart = new Date(year, month - 1, 1);
  var rangeEnd = new Date(year, month, 1);
  var events = cal.getEvents(rangeStart, rangeEnd);
  var out = events.map(function (ev) {
    if (ev.isAllDayEvent()) {
      return {
        summary: ev.getTitle(),
        start: { date: formatCalDate_(ev.getStartTime()) },
        end: { date: formatCalDate_(ev.getEndTime()) },
      };
    }
    return {
      summary: ev.getTitle(),
      start: { dateTime: ev.getStartTime().toISOString() },
      end: { dateTime: ev.getEndTime().toISOString() },
    };
  });
  return { ok: true, events: out };
}
