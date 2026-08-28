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
 *    - INSIGHT_TEXT: 최상단 인사이트 바에 띄울 문구 — 실적 숫자가 들어가는 문구라 공개 코드에는
 *      못 두고 여기 스크립트 속성으로만 관리. 문구 바뀌면 이 값만 바꾸면 됨(재배포 불필요).
 * 3. 캘린더 기능(팀 일정 캘린더)을 처음 쓰기 전, 반드시 아래 순서로 권한을 미리 승인해둘 것:
 *    - 위쪽 함수 선택 드롭다운에서 "manualAuthTest_" 선택 → ▶ 실행 버튼 클릭
 *    - "권한 검토" 팝업이 뜨면 본인 계정 선택 → "고급" → "(프로젝트명)(으)로 이동" → 허용
 *    - 이 단계를 건너뛰고 배포만 하면, 팀 일정 캘린더 데이터가 조용히 빈 화면으로만 나올 수 있음
 * 4. 배포 → 새 배포(처음이라면) 또는 배포 관리 → 기존 배포 수정(URL 유지하고 싶으면 이 쪽)
 *    - 유형: 웹 앱 / 실행 계정: 나(본인) / 액세스 권한: 모든 사용자(Anyone)
 * 5. 배포 후 나오는 웹 앱 URL(.../exec로 끝남)을 대시보드 담당자(클로드)에게 전달
 */

var PERF_FOLDER_ID = '1rYBmUGSk2K0tyv4CcXd7XpiziVzLxgPh';   // 2026 KPI 현황
var AGENDA_FOLDER_ID = '1Au_nUt3pQ7nVStq-oITUGTAgwZkprWiP'; // 팀 AGENDA
var CAL_FOLDER_ID = '1WSM_HwsjxzTC2EmU4i2r7aEuA1u7zqhq';    // 사업 캘린더
var TREND_FOLDER_ID = '1Yqn8wrnsTePtN9OMIaEgBgBIqr1QEmc6';  // 트렌드 리포트
var KPI_MASTER_ID = '1Ej7edr36XJFFC_JQPwidWY_ikaet867hT6gD--BomlU'; // 월별 트래킹(= perf 폴더 파일과 동일 파일)
var TEAM_CAL_ID = 'c_ba39a76170dcab8c99022cc72144d5706bda1be2cfd589a88eabe857259799a3@group.calendar.google.com';

// KPI 목표(연간/하반기)는 대표님/팀장님이 확정한 고정값 — 시트에서 다시 계산하지 않고 여기서만
// 고정 관리. 공개 저장소(GitHub) 코드에는 이 숫자가 안 보이도록 여기 Apps Script(비공개) 쪽에만
// 두고, 응답 JSON으로 내려줌.
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

// 배포 전에 딱 한 번 수동 실행해서 Calendar 권한 승인 팝업을 미리 띄우기 위한 함수.
// 스크립트 에디터에서 이 함수를 선택해 ▶ 실행하면 됨(웹 앱 요청에서는 호출되지 않음).
function manualAuthTest_() {
  Logger.log(getTeamCalendarData_(new Date().getFullYear(), new Date().getMonth() + 1));
}

// ---- 공통 유틸 ----

// 시트 셀에 "222억"처럼 단위가 붙어있는 값에서 숫자만 뽑음.
function stripUnit_(v) {
  if (v === null || v === undefined || v === '') return NaN;
  var m = String(v).match(/-?[\d.]+/);
  return m ? parseFloat(m[0]) : NaN;
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

// 시트 안 "1. 2026 KPI 현황" 표를 읽어 {annual:{goal,actual,ach}, h2:{...}} 형태로 반환.
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

// KPI_MASTER_ID 파일(= perf 폴더의 최신 파일과 동일 파일)의 주차 시트 중 "가장 최근(월+주차 기준)"
// 시트에서 "9월" 블록을 찾아 읽음. 최신 판별을 weekOrder_(월×100+주차)로 하기 때문에, 예를 들어
// SEP_1이 새로 생기면 AUG_4(주차 숫자만 보면 더 큼)보다 SEP_1을 올바르게 더 최근으로 인식한다.
function getMonthlyTrackingData_() {
  var ss = SpreadsheetApp.openById(KPI_MASTER_ID);
  var latestSheet = null, latestOrder = -1;
  ss.getSheets().forEach(function (sh) {
    var mw = monthWeekFromSheetName_(sh.getName());
    if (!mw) return;
    var order = weekOrder_(mw.monthAbbr, mw.weekNum);
    if (order > latestOrder) { latestOrder = order; latestSheet = sh; }
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
    var voc = String(r[4] || '').trim();
    if (!cat) continue;
    if (!artist && !content) continue; // 아직 안 채워진 템플릿 행
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push({ label: brand ? (artist + ' · ' + brand) : artist, content: content, voc: voc });
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
    var voc = String(r[3] || '').trim();
    if (!label && !content) continue;
    var cat = catRaw.toUpperCase();
    if (!byCat[cat]) {
      var known = TREND_KNOWN_CATS[cat];
      var cls = known ? known.cls : TREND_EXTRA_CLS[extraIdx++ % TREND_EXTRA_CLS.length];
      var title = known ? known.title : catRaw;
      byCat[cat] = { cls: cls, title: title, items: [] };
      sections.push(byCat[cat]);
    }
    byCat[cat].items.push({ label: label, content: content, voc: voc });
  }
  return sections;
}

// ---- ⑤ 팀 일정 캘린더(구글 캘린더) 섹션 ----

function formatCalDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// 구글 캘린더 API 이벤트 객체와 최대한 비슷한 모양({summary, start:{dateTime|date}, end:{...}})으로
// 반환 — 클라이언트의 날짜 스팬 계산 로직을 손 안 대고 그대로 재사용하기 위함.
function getTeamCalendarData_(year, month) {
  if (!year || !month) return { ok: true, events: [] };
  var cal = CalendarApp.getCalendarById(TEAM_CAL_ID);
  if (!cal) {
    // CalendarApp 권한이 아직 승인 안 됐거나 ID가 잘못된 경우 — 조용히 빈 배열을 주면 "연동이 안
    // 되는데 원인을 모르겠다" 상태가 되므로, 원인을 알 수 있게 명시적 에러로 내려준다.
    return { ok: false, error: 'calendar_not_found', message: '캘린더를 열 수 없습니다. Apps Script에서 manualAuthTest_ 함수를 한 번 실행해 캘린더 권한을 승인했는지 확인해 주세요.' };
  }
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
