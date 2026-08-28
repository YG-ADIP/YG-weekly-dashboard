/**
 * YG 주간 대시보드 — 팀 공개용 백엔드 (Google Apps Script Web App)
 *
 * 역할: 엘라 구글 계정 권한으로 구글드라이브를 읽고, 공통 비밀번호를 확인한 뒤에만
 * JSON으로 데이터를 내려준다. 팀원은 구글 계정 없이 비밀번호만 알면 접근 가능.
 *
 * 배포 방법(엘라가 직접):
 * 1. script.google.com → 새 프로젝트 → 이 파일 내용을 통째로 붙여넣기
 * 2. 프로젝트 설정(⚙) → 스크립트 속성 → 속성 추가: 키 DASHBOARD_PASSWORD, 값에 원하는 공통 비밀번호
 * 3. 배포 → 새 배포 → 유형: 웹 앱
 *    - 실행 계정: 나(본인)
 *    - 액세스 권한: 모든 사용자(Anyone)
 * 4. 배포 후 나오는 웹 앱 URL(.../exec로 끝남)을 복사해서 대시보드 담당자(클로드)에게 전달
 */

var PERF_FOLDER_ID = '1rYBmUGSk2K0tyv4CcXd7XpiziVzLxgPh'; // 2026 KPI 현황 폴더

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
    if (params.section === 'kpi') {
      return jsonOutput_(getKpiData_());
    }
    return jsonOutput_({ ok: false, error: 'unknown_section' });
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

// ---- KPI 섹션 ----

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
  var file = resolveLatestMonthFile_(PERF_FOLDER_ID);
  if (!file) return { ok: true, monthAbbr: null, goal: KPI_GOAL_ANNUAL, h2Goal: KPI_GOAL_H2, byWeek: {} };
  var ss = SpreadsheetApp.openById(file.getId());
  var sheets = ss.getSheets();
  var byWeek = {};
  sheets.forEach(function (sh) {
    var num = weekNumFromSheetName_(sh.getName());
    if (num == null) return;
    var status = extractKpiStatusFromSheet_(sh);
    if (status) byWeek[num] = status;
  });
  return {
    ok: true,
    monthAbbr: monthAbbrFromTitle_(file.getName()),
    goal: KPI_GOAL_ANNUAL,
    h2Goal: KPI_GOAL_H2,
    byWeek: byWeek,
  };
}
