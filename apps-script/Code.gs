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
 *    (인사이트 바 문구는 9월부터 더 이상 수동 입력이 아니라, "실적현황" 시트의 "3. 월별 KPI
 *    실적 구성 상세"/"실적 인정 사업 리스트" 표를 읽어 자동으로 생성됨 — getInsightData_ 참고.)
 * 3. 캘린더 기능(팀 일정 캘린더)을 처음 쓰기 전, 반드시 아래 순서로 권한을 미리 승인해둘 것:
 *    - 위쪽 함수 선택 드롭다운에서 "manualAuthTest" 선택 → ▶ 실행 버튼 클릭
 *    - "권한 검토" 팝업이 뜨면 본인 계정 선택 → "고급" → "(프로젝트명)(으)로 이동" → 허용
 *    - 이 단계를 건너뛰고 배포만 하면, 팀 일정 캘린더 데이터가 조용히 빈 화면으로만 나올 수 있음
 * 4. 배포 → 새 배포(처음이라면) 또는 배포 관리 → 기존 배포 수정(URL 유지하고 싶으면 이 쪽)
 *    - 유형: 웹 앱 / 실행 계정: 나(본인) / 액세스 권한: 모든 사용자(Anyone)
 * 5. 배포 후 나오는 웹 앱 URL(.../exec로 끝남)을 대시보드 담당자(클로드)에게 전달
 */

var AGENDA_FOLDER_ID = '1Au_nUt3pQ7nVStq-oITUGTAgwZkprWiP'; // 팀 AGENDA
var CAL_FOLDER_ID = '1WSM_HwsjxzTC2EmU4i2r7aEuA1u7zqhq';    // 사업 캘린더
var TREND_FOLDER_ID = '1Yqn8wrnsTePtN9OMIaEgBgBIqr1QEmc6';  // 트렌드 리포트
var KPI_MASTER_ID = '1Ej7edr36XJFFC_JQPwidWY_ikaet867hT6gD--BomlU'; // 2026 KPI 현황 + 월별 트래킹(같은 파일)
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
      case 'insight': return jsonOutput_(getInsightData_());
      case 'saveInsight':
        saveInsightOverride_(params.weekLabel, String(params.text || '').trim());
        return jsonOutput_({ ok: true });
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

// getByWeekSectionData_와 같은 동작이지만, 폴더를 뒤져 "최근 수정 파일"을 찾는 대신 지정한
// 파일 ID를 직접 연다. KPI 섹션은 원래 PERF_FOLDER_ID 폴더를 뒤졌는데, 월별 트래킹·인사이트
// 바는 이미 KPI_MASTER_ID로 같은 파일을 고정 ID로 열고 있었음 — 같은 파일을 찾는 방법이
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
function getKpiData_() {
  var base = getByWeekFromFile_(KPI_MASTER_ID, extractKpiStatusFromSheet_);

  var latest = null, latestOrder = -1;
  Object.keys(base.byWeek).forEach(function (k) {
    var e = base.byWeek[k], o = weekOrder_(e.monthAbbr, e.weekNum);
    if (o > latestOrder && e.data) { latestOrder = o; latest = e.data; }
  });
  var sheetGoal = latest && latest.annual ? latest.annual.goal : NaN;
  var sheetH2Goal = latest && latest.h2 ? latest.h2.goal : NaN;
  base.goal = isNaN(sheetGoal) ? KPI_GOAL_ANNUAL : sheetGoal;
  base.h2Goal = isNaN(sheetH2Goal) ? KPI_GOAL_H2 : sheetH2Goal;
  return base;
}

// ---- 최상단 AI 인사이트 바 ----
//
// 9월부터 수동 문구 대신 자동 생성으로 전환(엘라 지시: "해당 주 신규 실적"과 "연간 실적에 가장
// 큰 영향을 미치는 프로젝트"를 매번 데이터에서 뽑아서 보여줄 것). KPI_MASTER_ID 파일의 가장 최근
// (월+주차) 시트 하나에서 두 가지를 읽는다:
// 1) "3. 월별 KPI 실적 구성 상세" 표 중, weekLabel이 정확히 "이번 주"(예: "9월/1주차")와 일치하는
//    행만 = 이번 주에 새로 반영된 실적. 시트 전체를 이전 주차와 비교(diff)하는 방식은 과거에
//    시도했다가 폐기된 적 있음(오타 정정이 "새 변화"로 잘못 잡히는 문제) — 이번엔 각 행에 週가
//    이미 라벨로 박혀 있어서 diff 없이 라벨 매칭만으로 안전하게 뽑을 수 있음.
// 2) "실적 인정 사업 리스트"(하반기 누적 확정 실적) 표를 신규 계약금 내림차순 정렬한 상위 항목
//    = 하반기 실적에 가장 큰 영향을 미치는 프로젝트(이 표 자체가 하반기 기준 리스트라 "연간"이
//    아니라 "하반기"라고 표현해야 함 — 문구는 프런트 buildInsightText에서 조합).
// 문장 조합(사람이 읽는 텍스트로 만드는 것)은 프런트에서 함 — 여기선 원본 수치만 정리해서 내려줌.
function getInsightData_() {
  var ss = SpreadsheetApp.openById(KPI_MASTER_ID);
  var latestSheet = null, latestOrder = -1, latestMw = null;
  ss.getSheets().forEach(function (sh) {
    var mw = monthWeekFromSheetName_(sh.getName());
    if (!mw) return;
    var order = weekOrder_(mw.monthAbbr, mw.weekNum);
    if (order > latestOrder) { latestOrder = order; latestSheet = sh; latestMw = mw; }
  });
  if (!latestSheet) return { ok: true, weekLabel: null, thisWeek: [], topAnnual: [] };
  var rows = latestSheet.getDataRange().getValues();
  var monthNum = MONTH_ABBR.indexOf(latestMw.monthAbbr) + 1;
  var weekLabel = monthNum + '월/' + latestMw.weekNum + '주차';

  // "3. 월별 KPI 실적 구성 상세" 표에서 이번 주 라벨과 일치하는 행만 추림.
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
      if (String(r[1] || '').trim() !== weekLabel) continue; // 이번 주 항목만
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

  var override = getInsightOverride_();
  return {
    ok: true, weekLabel: weekLabel, thisWeek: thisWeek, topAnnual: topAnnual,
    overrideText: override.weekLabel === weekLabel ? override.text : null,
    overrideEditedAt: override.weekLabel === weekLabel ? override.editedAt : null,
  };
}

// 인사이트 문구 수동 수정(개발 서버 preview.html 전용 테스트 기능) — AI 자동 생성 문구 위에
// 사람이 덧붙이거나 고친 내용을 스크립트 속성에 저장해서 팀원 모두에게 같은 내용이 보이게 함.
// weekLabel과 함께 저장해서, 주차가 바뀌면(위 getInsightData_에서 weekLabel 불일치로) 자동으로
// 새로 생성된 AI 문구로 돌아가고 지난 주 수정 내용이 새 주차에 잘못 남지 않게 함.
function getInsightOverride_() {
  var props = PropertiesService.getScriptProperties();
  return {
    weekLabel: props.getProperty('INSIGHT_OVERRIDE_WEEK') || null,
    text: props.getProperty('INSIGHT_OVERRIDE_TEXT') || null,
    editedAt: props.getProperty('INSIGHT_OVERRIDE_AT') || null,
  };
}

function saveInsightOverride_(weekLabel, text) {
  var props = PropertiesService.getScriptProperties();
  if (!text) {
    props.deleteProperty('INSIGHT_OVERRIDE_WEEK');
    props.deleteProperty('INSIGHT_OVERRIDE_TEXT');
    props.deleteProperty('INSIGHT_OVERRIDE_AT');
    return;
  }
  props.setProperty('INSIGHT_OVERRIDE_WEEK', weekLabel || '');
  props.setProperty('INSIGHT_OVERRIDE_TEXT', text);
  props.setProperty('INSIGHT_OVERRIDE_AT', new Date().toISOString());
}

// ---- ①-2 월별 트래킹 섹션 ----

// KPI_MASTER_ID 파일(= perf 폴더의 최신 파일과 동일 파일)의 주차 시트 중 "가장 최근(월+주차 기준)"
// 시트를 읽음. 최신 판별을 weekOrder_(월×100+주차)로 하기 때문에, 예를 들어 SEP_1이 새로 생기면
// AUG_4(주차 숫자만 보면 더 큼)보다 SEP_1을 올바르게 더 최근으로 인식한다.
//
// 2026-09월부터 시트 양식이 바뀜(엘라가 직접 재설계) — 기존엔 "2. 월별 팀 KPI PLAN" 아래 주차별
// (목표/실적/합계/달성률 × 광고/IP) 그리드가 있었는데, 이제 그 그리드는 없어지고 대신 ①월별 요약
// (월/목표/실적(광고,IP)/매출 한 줄씩) + ②"3. 월별 KPI 실적 구성 상세"(이번 달 실적을 만든 개별
// 프로젝트 리스트) 두 표만 남음. 주차별 그리드 대신 "이번 달 전체 실적"과 "그 실적을 구성하는
// 프로젝트별 상세"만 보여주면 되도록 대시보드 쪽 요구사항도 이에 맞춰 변경됨.
function getMonthlyTrackingData_() {
  var ss = SpreadsheetApp.openById(KPI_MASTER_ID);
  var latestSheet = null, latestOrder = -1, latestMw = null;
  ss.getSheets().forEach(function (sh) {
    var mw = monthWeekFromSheetName_(sh.getName());
    if (!mw) return;
    var order = weekOrder_(mw.monthAbbr, mw.weekNum);
    if (order > latestOrder) { latestOrder = order; latestSheet = sh; latestMw = mw; }
  });
  if (!latestSheet) return { ok: true, monthNum: null, goal: 0, adActual: NaN, ipActual: NaN, actual: 0, breakdown: [] };
  var rows = latestSheet.getDataRange().getValues();
  var monthNum = MONTH_ABBR.indexOf(latestMw.monthAbbr) + 1;

  // "월 | 목표(억원) | 실적(억원/한화)[광고|IP] | 매출(억원)" 표에서 이번 달 행을 찾는다.
  var planHeaderIdx = -1;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === '월' && String(rows[i][1] || '').indexOf('목표') >= 0) { planHeaderIdx = i; break; }
  }
  var goal = 0, adActual = NaN, ipActual = NaN;
  if (planHeaderIdx >= 0) {
    for (var j = planHeaderIdx + 2; j < rows.length; j++) { // +2: "광고|IP" 서브헤더 행 건너뜀
      var label = rows[j][0];
      if (String(label).indexOf('총계') >= 0) break;
      if (Number(label) === monthNum) {
        goal = stripUnit_(rows[j][1]);
        adActual = stripUnit_(rows[j][2]);
        ipActual = stripUnit_(rows[j][3]);
        break;
      }
    }
  }

  // "3. 월별 KPI 실적 구성 상세" 표: 구분 | 월/주차 | 프로젝트명 | 실적 | 월별 목표 기여분
  var detailHeaderIdx = -1;
  for (var k = 0; k < rows.length; k++) {
    if (String(rows[k][0] || '').trim() === '구분' && String(rows[k][1] || '').indexOf('월/주차') >= 0) { detailHeaderIdx = k; break; }
  }
  var breakdown = [];
  if (detailHeaderIdx >= 0) {
    for (var m = detailHeaderIdx + 1; m < rows.length; m++) {
      var r = rows[m];
      var col0 = String(r[0] || '').trim();
      var restEmpty = !r[1] && !r[2] && !r[3] && !r[4];
      if (col0 && restEmpty) break; // 다음 섹션 제목 행("실적 인정 사업 리스트..." 등) 도달
      var proj = String(r[2] || '').trim();
      if (!proj) continue; // 빈 행은 건너뜀
      breakdown.push({
        category: col0,
        weekLabel: String(r[1] || '').trim(),
        project: proj,
        actual: stripUnit_(r[3]),
        contribPct: percentCellToPct_(r[4]),
      });
    }
  }

  var adNum = isNaN(adActual) ? 0 : adActual;
  var ipNum = isNaN(ipActual) ? 0 : ipActual;
  return {
    ok: true, monthNum: monthNum, goal: goal,
    adActual: adActual, ipActual: ipActual, actual: adNum + ipNum,
    breakdown: breakdown,
  };
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
    // 되는데 원인을 모르겠다" 상태가 되므로, 원인을 알 수 있게 명시적 에러로 내려준다. 이 메시지는
    // 팀원 화면에 그대로 뜨는데 팀원은 Apps Script 편집기 접근 권한이 없어 함수를 실행할 수
    // 없으므로, 함수 이름을 지시하는 대신 담당자에게 알리라고 안내한다(원인 진단은 실행 로그로).
    return { ok: false, error: 'calendar_not_found', message: '팀 일정 캘린더를 열 수 없습니다. 대시보드 담당자에게 알려주세요.' };
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
