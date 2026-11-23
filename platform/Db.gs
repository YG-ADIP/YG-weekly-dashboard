/**
 * 주간회의 대시보드 플랫폼 — 협업 DB (2026-11)
 *
 * 팀원이 화면에서 직접 입력·수정·저장하고, 저장된 내용이 모두에게 공유되는 저장소.
 * 저장소는 엘라 드라이브의 구글 시트 1개("대시보드_DB") — 탭마다 표 하나, 1행 머리글.
 * 사람이 시트를 직접 열어 확인하거나 엑셀로 내려받아도 그대로 읽히도록 머리글은 한글 이름을 쓴다.
 *
 * - 사업_원장: 광고·IP 사업을 "제안 → 확정/불발"까지 한 줄로 관리. KPI·계약 알림·인사이트가 모두 여기서 계산됨.
 * - KPI 금액은 추산치: 계약금액 × KPI 고정환율(KPI_환율 탭, 연도·통화별). 실입금액은 회계 확인 후 따로 입력.
 * - 날짜는 "2026-07-21"(일자) / "2026-07"(월만) / 빈칸(미정) 모두 허용 — 시트에는 글자로 저장(자동 날짜 변환 방지).
 * - 모든 추가·수정·삭제는 변경로그 탭에 기록(삭제는 행 전체를 남겨 복원 가능).
 * - 두 사람이 같은 행을 동시에 고치면 나중 저장은 거절하고 최신 내용을 돌려줌(덮어쓰기 방지).
 */

// ============================================================
// 표 정의 — 머리글(label)이 곧 시트 1행. type: text|longtext|number|select|date|flexdate|auto
// ============================================================
var DB_TABLES = {
  deals: {
    sheet: '사업_원장', idPrefix: null, editable: true,
    cols: [
      { key: 'id', label: '사업ID', type: 'auto' },
      { key: 'part', label: '파트', type: 'select', codes: 'parts', required: true },
      { key: 'year', label: 'KPI 기준연도', type: 'number', required: true },
      { key: 'group', label: '아티스트 그룹', type: 'select', codes: 'groups', required: true },
      { key: 'artist', label: '아티스트', type: 'text', required: true },
      { key: 'brand', label: '브랜드/파트너', type: 'text', required: true },
      { key: 'name', label: '사업명(상세내용)', type: 'text' },
      { key: 'ctype', label: '계약유형', type: 'select', codes: 'ctypes', required: true },
      { key: 'ckind', label: '계약구분', type: 'select', codes: 'ckinds', required: true },
      { key: 'item', label: '품목', type: 'select', codes: 'items' },
      { key: 'country', label: '국가', type: 'text' },
      { key: 'cond', label: '계약조건', type: 'text' },
      { key: 'stage', label: '진행 단계', type: 'select', codes: 'stages', required: true },
      { key: 'stageDate', label: '단계 변경일', type: 'auto' },
      { key: 'shortDate', label: '최종 압축일', type: 'flexdate' },
      { key: 'decidedDate', label: '확정/불발일', type: 'flexdate' },
      { key: 'reason', label: '불발·보류 사유', type: 'text' },
      { key: 'startDate', label: '계약 시작일', type: 'flexdate' },
      { key: 'startStatus', label: '시작일 상태', type: 'select', codes: 'dateStatus' },
      { key: 'endDate', label: '계약 종료일', type: 'flexdate' },
      { key: 'endStatus', label: '종료일 상태', type: 'select', codes: 'dateStatus' },
      { key: 'months', label: '계약기간(개월)', type: 'number' },
      { key: 'cur', label: '계약통화', type: 'select', codes: 'currencies' }, // 최종 압축(가중치 70%) 이상이면 필수 — cleanRecord_
      { key: 'amount', label: '계약금액', type: 'number' },
      { key: 'kpiHalfManual', label: 'KPI 인정 반기(직접 지정)', type: 'select', codes: 'halves' },
      { key: 'kpiHalf', label: 'KPI 인정 반기', type: 'auto' },
      { key: 'kpiKrw', label: 'KPI 추산금액(KRW)', type: 'auto' },
      { key: 'approval', label: 'KPI 승인', type: 'auto' },
      { key: 'approvedBy', label: '승인자', type: 'auto' },
      { key: 'approvedAt', label: '승인일시', type: 'auto' },
      { key: 'weight', label: '단계 가중치', type: 'auto' },
      { key: 'weighted', label: '가중 예상금액(KRW)', type: 'auto' },
      { key: 'paidKrw', label: '실입금액(KRW)', type: 'number' },
      { key: 'paidDate', label: '입금일', type: 'flexdate' },
      { key: 'owner', label: '담당자', type: 'text' },
      { key: 'note', label: '비고', type: 'longtext' },
      { key: 'source', label: '데이터 출처', type: 'auto' },
      { key: 'updatedBy', label: '최종 수정자', type: 'auto' },
      { key: 'updatedAt', label: '최종 수정일시', type: 'auto' },
      // 2026-11 추가(관리자 전용): 실적 인정 기준 — 'KPI 고정환율'(기본, 계약금액×고정환율) 또는 '실입금액'
      { key: 'kpiBasis', label: '실적 인정 기준', type: 'select', codes: 'kpiBases', adminOnly: true },
      { key: 'kpiCounted', label: '실적 인정금액(KRW)', type: 'auto' },
    ],
  },
  kpiGoals: {
    sheet: 'KPI_목표', idPrefix: 'KG', editable: true, adminOnly: true,
    cols: [
      { key: 'id', label: 'ID', type: 'auto' },
      { key: 'year', label: '연도', type: 'number', required: true },
      { key: 'part', label: '파트', type: 'select', codes: 'goalParts', required: true },
      { key: 'period', label: '기간', type: 'select', codes: 'periods', required: true },
      { key: 'goalS', label: '목표 Stretch(억원)', type: 'number', required: true },
      { key: 'goalB', label: '목표 Base(억원)', type: 'number' },
      { key: 'note', label: '비고', type: 'text' },
      { key: 'updatedBy', label: '최종 수정자', type: 'auto' },
      { key: 'updatedAt', label: '최종 수정일시', type: 'auto' },
    ],
  },
  fx: {
    sheet: 'KPI_환율', idPrefix: 'FX', editable: true, adminOnly: true,
    cols: [
      { key: 'id', label: 'ID', type: 'auto' },
      { key: 'year', label: '연도', type: 'number', required: true },
      { key: 'cur', label: '통화', type: 'select', codes: 'currencies', required: true },
      { key: 'unit', label: '기준 단위', type: 'number', required: true },
      { key: 'rate', label: 'KPI 고정환율(원)', type: 'number', required: true },
      { key: 'note', label: '비고', type: 'text' },
      { key: 'updatedBy', label: '최종 수정자', type: 'auto' },
      { key: 'updatedAt', label: '최종 수정일시', type: 'auto' },
    ],
  },
  agenda: {
    sheet: '팀_AGENDA', idPrefix: 'AG', editable: true,
    cols: [
      { key: 'id', label: 'ID', type: 'auto' },
      { key: 'year', label: '연도', type: 'number', required: true },
      { key: 'week', label: '주차', type: 'select', codes: 'weeks', required: true },
      { key: 'kind', label: '구분', type: 'select', codes: 'agendaKinds', required: true },
      { key: 'team', label: '팀/파트', type: 'text' },
      { key: 'project', label: '프로젝트', type: 'text', required: true },
      { key: 'content', label: '내용', type: 'longtext', required: true },
      { key: 'updatedBy', label: '작성자', type: 'auto' },
      { key: 'updatedAt', label: '수정일시', type: 'auto' },
    ],
  },
  trend: {
    sheet: '트렌드_리포트', idPrefix: 'TR', editable: true,
    cols: [
      { key: 'id', label: 'ID', type: 'auto' },
      { key: 'year', label: '연도', type: 'number', required: true },
      { key: 'week', label: '주차', type: 'select', codes: 'weeks', required: true },
      { key: 'kind', label: '구분', type: 'select', codes: 'trendKinds', required: true },
      { key: 'artist', label: '아티스트', type: 'text', required: true },
      { key: 'brand', label: '브랜드/파트너', type: 'text' },
      { key: 'content', label: '내용', type: 'longtext', required: true },
      { key: 'updatedBy', label: '작성자', type: 'auto' },
      { key: 'updatedAt', label: '수정일시', type: 'auto' },
    ],
  },
  members: {
    sheet: '팀원', idPrefix: 'MB', editable: true, adminOnly: true,
    cols: [
      { key: 'id', label: 'ID', type: 'auto' },
      { key: 'name', label: '이름', type: 'text', required: true },
      { key: 'part', label: '파트', type: 'text' },
      { key: 'role', label: '역할', type: 'select', codes: 'roles', required: true },
      { key: 'active', label: '사용여부', type: 'select', codes: 'activeFlags', required: true },
      { key: 'note', label: '비고', type: 'text' },
      { key: 'updatedBy', label: '최종 수정자', type: 'auto' },
      { key: 'updatedAt', label: '최종 수정일시', type: 'auto' },
    ],
  },
  snapshots: {
    sheet: 'KPI_주간기록', idPrefix: 'SN', editable: false,
    cols: [
      { key: 'id', label: 'ID', type: 'auto' },
      { key: 'year', label: '연도', type: 'auto' },
      { key: 'week', label: '주차', type: 'auto' },
      { key: 'recordedAt', label: '기록일시', type: 'auto' },
      { key: 'part', label: '파트', type: 'auto' },
      { key: 'period', label: '기간', type: 'auto' },
      { key: 'goalS', label: '목표 Stretch(억원)', type: 'auto' },
      { key: 'goalB', label: '목표 Base(억원)', type: 'auto' },
      { key: 'actual', label: '확정 실적(억원)', type: 'auto' },
      { key: 'pipeline', label: '진행 중 파이프라인(억원)', type: 'auto' },
      { key: 'weighted', label: '가중 예상(억원)', type: 'auto' },
      { key: 'confirmedCount', label: '확정 건수', type: 'auto' },
      { key: 'activeCount', label: '진행 중 건수', type: 'auto' },
      { key: 'source', label: '출처', type: 'auto' },
    ],
  },
  log: {
    sheet: '변경로그', idPrefix: 'LG', editable: false,
    cols: [
      { key: 'id', label: 'ID', type: 'auto' },
      { key: 'at', label: '일시', type: 'auto' },
      { key: 'user', label: '사용자', type: 'auto' },
      { key: 'table', label: '탭', type: 'auto' },
      { key: 'recordId', label: '레코드ID', type: 'auto' },
      { key: 'action', label: '작업', type: 'auto' },
      { key: 'field', label: '항목', type: 'auto' },
      { key: 'before', label: '변경 전', type: 'auto' },
      { key: 'after', label: '변경 후', type: 'auto' },
    ],
  },
};
var DB_TABLE_ORDER = ['deals', 'kpiGoals', 'fx', 'agenda', 'trend', 'members', 'snapshots', 'log'];

// 코드(드롭다운) 기본값 — 진행 단계·아티스트 그룹 등은 관리자 설정에서 바꿀 수 있음(cfg_().codes).
var DEFAULT_CODES = {
  stages: [
    { name: '01 제안 중', weight: 10, desc: '브랜드에 제안서·단가 전달, 회신 대기' },
    { name: '02 협의 중', weight: 30, desc: '브랜드 관심 표명, 금액·범위 등 조건 협의' },
    { name: '03 최종 압축', weight: 70, desc: '경영진 승인 완료 — 계약통화·금액을 입력하면 KPI가 자동 계산됩니다' },
    { name: '04 계약 진행 중', weight: 90, desc: '계약서 검토·서명 단계(조건 확정)' },
    { name: '05 진행 확정', weight: 100, desc: '계약 체결·진행 확정 → KPI 실적 인정' },
    { name: '06 진행 불발', weight: 0, desc: '진행 무산 — 불발 사유 입력' },
    { name: '07 보류', weight: 0, desc: '일시 중단·재개 시점 미정' },
  ],
  groups: ['BABYMONSTER', 'TREASURE', 'WINNER', 'BIGBANG', '기타'],
  ctypes: ['신규계약', '재계약', '추가계약'],
  ckinds: ['광고', '행사', '화보', 'SNS 시딩', 'PPL', 'MG', '로열티', '라이선스', '전시', '기타'],
  items: ['뷰티', '패션', '식품', '게임', '전자기기', '휴대기기', '건기식/제약', '금융', '기타'],
  currencies: ['KRW', 'USD', 'CNY', 'JPY', 'EUR', 'HKD', 'TWD'],
};
var FIXED_CODES = {
  parts: ['광고', 'IP'], goalParts: ['전체', '광고', 'IP'], periods: ['연간', '상반기', '하반기'],
  dateStatus: ['확정', '예정', '미정'], halves: ['상반기', '하반기'],
  agendaKinds: ['WIN', 'SHARE', 'CHALLENGE'], trendKinds: ['내부', '외부'],
  roles: ['팀원', '관리자'], activeFlags: ['사용', '중지'],
  kpiBases: ['KPI 고정환율', '실입금액'],
};
// 이 사업의 실적 인정금액: 기준이 '실입금액'이면 실입금액, 아니면 KPI 추산금액(계약금액×KPI 고정환율)
function basisOf_(d) { return d.kpiBasis === '실입금액' ? '실입금액' : 'KPI 고정환율'; }
function countedKrw_(d) { var v = basisOf_(d) === '실입금액' ? d.paidKrw : d.kpiKrw; return typeof v === 'number' ? v : ''; }

function dbCodes_() {
  var c = cfg_().codes || {};
  var out = {};
  Object.keys(DEFAULT_CODES).forEach(function (k) { out[k] = c[k] && c[k].length ? c[k] : DEFAULT_CODES[k]; });
  Object.keys(FIXED_CODES).forEach(function (k) { out[k] = FIXED_CODES[k]; });
  out.weeks = weekKeysOfYear_();
  return out;
}

function weekKeysOfYear_() {
  var keys = [];
  MONTH_ABBR.forEach(function (m) { for (var w = 1; w <= 5; w++) keys.push(m + '_' + w); });
  return keys;
}

function stageInfo_(name) {
  var stages = dbCodes_().stages;
  for (var i = 0; i < stages.length; i++) if (stages[i].name === name) return stages[i];
  return { name: name, weight: 0 };
}
function isConfirmedStage_(name) { return stageInfo_(name).weight >= 100; }
var MONEY_REQUIRED_WEIGHT = 70; // 이 가중치(최종 압축) 이상 단계부터 계약통화·금액 필수

// KPI 실적 승인제: '진행 확정'이어도 관리자가 승인해야 그 연도 KPI 실적에 집계된다.
// 승인 뒤 아래 칸이 바뀌면(관리자가 아닌 사람이 고친 경우) 승인이 풀리고 다시 승인 대기가 된다.
var KPI_FIELDS = ['part', 'year', 'stage', 'cur', 'amount', 'kpiHalfManual', 'startDate'];
function kpiFieldsChanged_(before, after) {
  return KPI_FIELDS.some(function (k) { return String(before[k] === undefined ? '' : before[k]) !== String(after[k] === undefined ? '' : after[k]); });
}
function isApproved_(d) { return d.approval === '승인'; }
function isActiveStage_(name) { var w = stageInfo_(name).weight; return w > 0 && w < 100; }

// ============================================================
// 저장소 열기 / 만들기
// ============================================================
var DB_SS_CACHE_ = null;
function dbSpreadsheet_() {
  if (DB_SS_CACHE_) return DB_SS_CACHE_;
  var id = cfg_().sources.dbSheet;
  if (!id) throw new Error('협업 DB가 아직 만들어지지 않았습니다. 관리자 설정 → [협업 DB 만들기]를 먼저 실행해 주세요.');
  DB_SS_CACHE_ = SpreadsheetApp.openById(id);
  return DB_SS_CACHE_;
}
function dbReady_() { return !!cfg_().sources.dbSheet; }

// 탭이 없으면 만들고, 머리글 행과 서식(날짜 칸은 글자 서식)을 맞춘다. 이미 있는 탭은 머리글만 확인.
function ensureTable_(ss, key) {
  var t = DB_TABLES[key];
  var sh = ss.getSheetByName(t.sheet);
  if (!sh) sh = ss.insertSheet(t.sheet);
  var labels = t.cols.map(function (c) { return c.label; });
  var current = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
  if (current.join('|') !== labels.join('|')) {
    sh.getRange(1, 1, 1, labels.length).setValues([labels]);
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, labels.length).setFontWeight('bold').setBackground('#2c455d').setFontColor('#ffffff');
  // 날짜·ID 같은 글자 칸이 시트에서 날짜/숫자로 바뀌지 않도록 글자 서식(@) 지정
  t.cols.forEach(function (c, j) {
    if (c.type === 'flexdate' || c.key === 'id' || c.key === 'week' || /At$|Date$/.test(c.key)) {
      sh.getRange(2, j + 1, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@');
    }
  });
  return sh;
}

function createDb_(byUser) {
  if (dbReady_()) throw new Error('이미 협업 DB가 연결되어 있습니다.');
  var ss = SpreadsheetApp.create(cfg_().general.title + '_DB');
  DB_TABLE_ORDER.forEach(function (k) { ensureTable_(ss, k); });
  var first = ss.getSheets()[0];
  if (first.getName() !== DB_TABLES[DB_TABLE_ORDER[0]].sheet && first.getLastRow() === 0) ss.deleteSheet(first);
  DB_SS_CACHE_ = ss;
  var c = JSON.parse(JSON.stringify(cfg_()));
  c.sources.dbSheet = ss.getId();
  saveConfig_(sanitizeConfig_(c), byUser, '협업 DB 생성: ' + ss.getName());
  return { id: ss.getId(), url: ss.getUrl(), name: ss.getName() };
}

// ============================================================
// 읽기 / 쓰기 (행 ↔ 객체)
// ============================================================
function cellToValue_(col, v) {
  if (v === '' || v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    var tz = Session.getScriptTimeZone();
    return /At$/.test(col.key) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm') : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  if (col.type === 'number') { var n = Number(v); return isNaN(n) ? '' : n; }
  return typeof v === 'number' && col.type !== 'auto' ? String(v) : v;
}

function readTable_(key) {
  var t = DB_TABLES[key];
  var sh = dbSpreadsheet_().getSheetByName(t.sheet) || ensureTable_(dbSpreadsheet_(), key);
  if (sh.getLastColumn() < t.cols.length) ensureTable_(dbSpreadsheet_(), key); // 새로 추가된 열의 머리글
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, t.cols.length).getValues();
  var out = [];
  values.forEach(function (row, i) {
    if (row.every(function (v) { return v === '' || v === null; })) return;
    var rec = { _row: i + 2 };
    t.cols.forEach(function (c, j) { rec[c.key] = cellToValue_(c, row[j]); });
    out.push(rec);
  });
  return out;
}

function recordToRow_(key, rec) {
  return DB_TABLES[key].cols.map(function (c) {
    var v = rec[c.key];
    if (v === undefined || v === null) return '';
    if (c.type === 'flexdate' || c.key === 'id' || c.key === 'week') return String(v);
    return v;
  });
}

function nowStamp_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }

function appendLogs_(entries) {
  if (!entries.length) return;
  var sh = dbSpreadsheet_().getSheetByName(DB_TABLES.log.sheet) || ensureTable_(dbSpreadsheet_(), 'log');
  var base = sh.getLastRow();
  var rows = entries.map(function (e, i) {
    return recordToRow_('log', {
      id: 'LG-' + new Date().getTime() + '-' + i, at: nowStamp_(), user: e.user || '(이름 없음)', table: DB_TABLES[e.table] ? DB_TABLES[e.table].sheet : e.table,
      recordId: e.recordId || '', action: e.action, field: e.field || '', before: truncate_(e.before), after: truncate_(e.after),
    });
  });
  sh.getRange(base + 1, 1, rows.length, rows[0].length).setValues(rows);
}
function truncate_(v) { var s = v === undefined || v === null ? '' : (typeof v === 'string' ? v : JSON.stringify(v)); return s.length > 45000 ? s.slice(0, 45000) + '…' : s; }

// ============================================================
// 입력값 검사 · 자동 계산
// ============================================================
// "2026-07-21" / "2026-07" / "2026.7.21" / "2026/07" / 엑셀 날짜 → 표준 글자. 미정·-·빈칸 → ''.
function normFlexDate_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(v).trim();
  if (!s || s === '-' || s === '미정' || s === 'TBD' || s === '(TBD)') return '';
  if (/^\d{5}(\.\d+)?$/.test(s)) { // 엑셀 날짜 일련번호
    var d = new Date(Math.round((parseFloat(s) - 25569) * 86400000));
    return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
  }
  var m = s.match(/^(\d{4})[-./년\s]+(\d{1,2})(?:[-./월\s]+(\d{1,2}))?/);
  if (!m) return null; // 형식 오류
  var mm = ('0' + m[2]).slice(-2);
  if (+m[2] < 1 || +m[2] > 12) return null;
  if (!m[3]) return m[1] + '-' + mm;
  var dd = ('0' + m[3]).slice(-2);
  if (+m[3] < 1 || +m[3] > 31) return null;
  return m[1] + '-' + mm + '-' + dd;
}
function flexMonth_(s) { var m = String(s || '').match(/^(\d{4})-(\d{2})/); return m ? { y: +m[1], m: +m[2] } : null; }

function numOrBlank_(v) {
  if (v === '' || v === null || v === undefined) return '';
  var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,\s원₩$]/g, ''));
  return isNaN(n) ? null : n;
}

function fxRateOf_(fxRows, year, cur) {
  if (cur === 'KRW') return 1;
  for (var i = 0; i < fxRows.length; i++) {
    var f = fxRows[i];
    if (Number(f.year) === Number(year) && f.cur === cur && Number(f.rate) > 0) return Number(f.rate) / (Number(f.unit) || 1);
  }
  return null;
}

// 사업 원장 자동 칸: KPI 인정 반기·KPI 추산금액·가중치·가중 예상금액·계약기간(빈칸이면)
function computeDeal_(rec, fxRows) {
  var info = stageInfo_(rec.stage);
  var rate = fxRateOf_(fxRows, rec.year, rec.cur);
  var krw = rate && rec.amount !== '' ? Math.round(Number(rec.amount) * rate) : '';
  rec.weight = info.weight / 100;
  rec.kpiKrw = krw === '' ? (rec.cur && rec.cur !== 'KRW' ? 'KPI 환율 없음' : '') : krw;
  rec.weighted = krw === '' ? '' : Math.round(krw * rec.weight);
  var basis = flexMonth_(rec.startDate);
  rec.kpiHalf = rec.kpiHalfManual || (basis ? (basis.m <= 6 ? '상반기' : '하반기') : (info.weight >= 100 ? '미정(직접 지정 필요)' : ''));
  if ((rec.months === '' || rec.months === undefined) && flexMonth_(rec.startDate) && flexMonth_(rec.endDate)) {
    var a = flexMonth_(rec.startDate), b = flexMonth_(rec.endDate);
    rec.months = Math.max(0, (b.y - a.y) * 12 + (b.m - a.m));
  }
  if (!rec.startStatus) rec.startStatus = rec.startDate ? (/^\d{4}-\d{2}-\d{2}$/.test(rec.startDate) ? '확정' : '예정') : '미정';
  if (!rec.endStatus) rec.endStatus = rec.endDate ? (/^\d{4}-\d{2}-\d{2}$/.test(rec.endDate) ? '확정' : '예정') : '미정';
  rec.kpiCounted = countedKrw_(rec);
  if (info.weight >= 100) rec.approval = rec.approvedAt ? '승인' : '승인 대기';
  else { rec.approval = ''; rec.approvedBy = ''; rec.approvedAt = ''; }
  return rec;
}

// 화면/엑셀에서 온 값 → 표준 레코드. errors에 사람이 읽을 메시지를 쌓는다.
function cleanRecord_(key, input, errors) {
  var t = DB_TABLES[key], codes = dbCodes_(), rec = {};
  t.cols.forEach(function (c) {
    if (c.type === 'auto') return;
    var v = input[c.key];
    if (c.type === 'flexdate') {
      var d = normFlexDate_(v);
      if (d === null) { errors.push(c.label + ': 날짜 형식 오류("' + v + '") — 2026-07-21 또는 2026-07처럼 입력'); d = ''; }
      rec[c.key] = d;
    } else if (c.type === 'number') {
      var n = numOrBlank_(v);
      if (n === null) { errors.push(c.label + ': 숫자가 아님("' + v + '")'); n = ''; }
      rec[c.key] = n;
    } else {
      rec[c.key] = v === undefined || v === null ? '' : String(v).trim();
    }
    if (c.type === 'select' && rec[c.key] !== '') {
      var list = codes[c.codes] || [];
      var names = list.map(function (x) { return typeof x === 'string' ? x : x.name; });
      if (names.indexOf(rec[c.key]) < 0) errors.push(c.label + ': 목록에 없는 값("' + rec[c.key] + '") — ' + names.slice(0, 8).join(', ') + (names.length > 8 ? ' …' : ''));
    }
    if (c.required && (rec[c.key] === '' || rec[c.key] === undefined)) errors.push(c.label + ': 필수 입력');
  });
  if (key === 'deals' && rec.stage && stageInfo_(rec.stage).weight === 0 && /불발/.test(rec.stage) && !rec.reason) errors.push('불발·보류 사유: 진행 불발이면 사유를 입력해 주세요');
  // 최종 압축(경영진 승인 완료) 이후 단계는 KPI 자동 계산을 위해 통화·금액 필수
  if (key === 'deals' && rec.stage && stageInfo_(rec.stage).weight >= MONEY_REQUIRED_WEIGHT) {
    if (!rec.cur) errors.push('계약통화: ' + rec.stage + ' 단계부터는 필수입니다(KPI 자동 계산)');
    if (rec.amount === '' || rec.amount === undefined) errors.push('계약금액: ' + rec.stage + ' 단계부터는 필수입니다(KPI 자동 계산)');
  }
  return rec;
}

// ============================================================
// 저장 / 삭제 / 복원 (모두 잠금 안에서, 변경로그 기록)
// ============================================================
function nextId_(key, rec, rows) {
  if (key === 'deals') {
    var prefix = (rec.part === 'IP' ? 'IP' : 'AD') + '-' + rec.year + '-';
    var max = 0;
    rows.forEach(function (r) { if (String(r.id).indexOf(prefix) === 0) max = Math.max(max, parseInt(String(r.id).slice(prefix.length), 10) || 0); });
    return prefix + ('000' + (max + 1)).slice(-4);
  }
  var p = DB_TABLES[key].idPrefix + '-', m2 = 0;
  rows.forEach(function (r) { if (String(r.id).indexOf(p) === 0) m2 = Math.max(m2, parseInt(String(r.id).slice(p.length), 10) || 0); });
  return p + ('0000' + (m2 + 1)).slice(-5);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// 레코드 하나 저장. input.id가 있으면 수정(baseUpdatedAt이 현재 값과 다르면 충돌), 없으면 추가.
function dbSave_(key, input, user, baseUpdatedAt, isAdmin) {
  var t = DB_TABLES[key];
  if (!t || !t.editable) throw new Error('저장할 수 없는 탭입니다.');
  if (t.adminOnly && !isAdmin) return { ok: false, error: 'forbidden', message: t.sheet + '은(는) 관리자 모드에서만 수정할 수 있습니다.' };
  return withLock_(function () {
    var errors = [];
    var rec = cleanRecord_(key, input, errors);
    if (errors.length) return { ok: false, error: 'invalid', errors: errors };
    var rows = readTable_(key);
    var existing = input.id ? rows.filter(function (r) { return r.id === input.id; })[0] : null;
    if (input.id && !existing) return { ok: false, error: 'not_found', message: '다른 사람이 이미 삭제한 항목입니다.' };
    if (existing && baseUpdatedAt !== undefined && String(existing.updatedAt || '') !== String(baseUpdatedAt || '')) {
      return { ok: false, error: 'conflict', message: (existing.updatedBy || '다른 사람') + '님이 ' + existing.updatedAt + '에 먼저 수정했습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.', current: stripRow_(existing) };
    }
    var fxRows = key === 'deals' ? readTable_('fx') : [];
    rec.id = existing ? existing.id : nextId_(key, rec, rows);
    var approvalLog = null;
    if (key === 'deals') {
      rec.source = existing ? existing.source : (input.source || '화면 입력');
      if (!isAdmin) rec.kpiBasis = existing ? (existing.kpiBasis || '') : ''; // 실적 인정 기준은 관리자만
      rec.stageDate = existing && existing.stage === rec.stage ? existing.stageDate : nowStamp_().slice(0, 10);
      if (existing && existing.approvedAt) {
        if (!isAdmin && kpiFieldsChanged_(existing, rec)) {
          approvalLog = { user: user, table: key, recordId: existing.id, action: '승인 해제', field: 'KPI 승인', before: '승인', after: 'KPI 관련 내용 변경 → 승인 대기' };
        } else { rec.approvedBy = existing.approvedBy; rec.approvedAt = existing.approvedAt; }
      }
      computeDeal_(rec, fxRows);
    }
    rec.updatedBy = user || '(이름 없음)';
    rec.updatedAt = nowStamp_();
    var sh = dbSpreadsheet_().getSheetByName(t.sheet);
    var row = recordToRow_(key, rec);
    var logs = [];
    if (existing) {
      sh.getRange(existing._row, 1, 1, row.length).setValues([row]);
      t.cols.forEach(function (c) {
        if (c.type === 'auto') return;
        if (String(existing[c.key]) !== String(rec[c.key])) logs.push({ user: user, table: key, recordId: rec.id, action: '수정', field: c.label, before: existing[c.key], after: rec[c.key] });
      });
    } else {
      sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
      logs.push({ user: user, table: key, recordId: rec.id, action: '추가', field: '', before: '', after: summaryOf_(key, rec) });
    }
    if (approvalLog) logs.push(approvalLog);
    appendLogs_(logs);
    if (key === 'fx') recalcDeals_(user);
    return { ok: true, record: rec, approvalReset: !!approvalLog };
  });
}

function summaryOf_(key, r) {
  if (key === 'deals') return [r.part, r.group, r.brand, r.name, r.stage, r.cur + ' ' + r.amount].filter(Boolean).join(' · ');
  if (key === 'agenda') return [r.week, r.kind, r.project].join(' · ');
  if (key === 'trend') return [r.week, r.kind, r.artist, r.brand].join(' · ');
  if (key === 'members') return [r.name, r.part, r.role, r.active].filter(Boolean).join(' · ');
  if (key === 'kpiGoals') return [r.year, r.part, r.period, 'S ' + r.goalS + '억', r.goalB !== '' ? 'B ' + r.goalB + '억' : ''].filter(Boolean).join(' · ');
  if (key === 'fx') return [r.year, r.cur, (r.unit || 1) + '단위 = ' + r.rate + '원'].join(' · ');
  return JSON.stringify(stripRow_(r));
}
function stripRow_(r) { var o = {}; Object.keys(r).forEach(function (k) { if (k !== '_row') o[k] = r[k]; }); return o; }

function dbDelete_(key, id, user, isAdmin) {
  var t = DB_TABLES[key];
  if (!t || !t.editable) throw new Error('삭제할 수 없는 탭입니다.');
  if (t.adminOnly && !isAdmin) return { ok: false, error: 'forbidden', message: t.sheet + '은(는) 관리자 모드에서만 삭제할 수 있습니다.' };
  return withLock_(function () {
    var row = readTable_(key).filter(function (r) { return r.id === id; })[0];
    if (!row) return { ok: false, error: 'not_found', message: '이미 삭제된 항목입니다.' };
    dbSpreadsheet_().getSheetByName(t.sheet).deleteRow(row._row);
    // 행 전체를 남겨 두면 변경로그에서 [복원] 가능
    appendLogs_([{ user: user, table: key, recordId: id, action: '삭제', field: '', before: stripRow_(row), after: '' }]);
    return { ok: true };
  });
}

function dbRestore_(logId, user, isAdmin) {
  return withLock_(function () {
    var entry = readTable_('log').filter(function (l) { return l.id === logId; })[0];
    if (!entry || entry.action !== '삭제') throw new Error('복원할 수 있는 삭제 기록이 아닙니다.');
    var key = Object.keys(DB_TABLES).filter(function (k) { return DB_TABLES[k].sheet === entry.table; })[0];
    if (DB_TABLES[key].adminOnly && !isAdmin) throw new Error(entry.table + ' 항목은 관리자 모드에서만 복원할 수 있습니다.');
    var rec = JSON.parse(entry.before);
    if (readTable_(key).some(function (r) { return r.id === rec.id; })) throw new Error('같은 ID(' + rec.id + ')가 이미 있습니다.');
    var sh = dbSpreadsheet_().getSheetByName(DB_TABLES[key].sheet);
    var row = recordToRow_(key, rec);
    sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    appendLogs_([{ user: user, table: key, recordId: rec.id, action: '복원', field: '', before: '', after: summaryOf_(key, rec) }]);
    return { ok: true, record: rec };
  });
}

// KPI 환율이 바뀌면 사업 원장의 KPI 추산금액·가중 예상금액을 다시 계산
function recalcDeals_(user) {
  var sh = dbSpreadsheet_().getSheetByName(DB_TABLES.deals.sheet);
  var deals = readTable_('deals');
  if (!deals.length) return 0;
  var fxRows = readTable_('fx');
  var rows = deals.map(function (d) { return recordToRow_('deals', computeDeal_(d, fxRows)); });
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return rows.length;
}

// ============================================================
// 엑셀 업로드 — 미리보기 → 확정
// ============================================================
// BIS 엑셀 머리글 → 사업 원장 항목(같은 뜻 다른 이름)
var DEAL_ALIASES = {
  'KPI 기준년도': 'year', '광고 시작일': 'startDate', '광고 종료일': 'endDate', '시작일 확정': 'startStatus', '종료일 확정': 'endStatus',
  '계약 유형': 'ctype', '계약 구분': 'ckind', '상세내용': 'name', '브랜드': 'brand', '진행 상태': 'stage', '최종 압축 날짜': 'shortDate',
  '확정/불발 날짜': 'decidedDate', '최종입금금액(KRW)': 'paidKrw', '계약기간': 'monthsText', '분류 (광고/IP)': 'part', '브랜드/파트너사명': 'brand',
};
var BIS_STAGE_MAP = { '진행확정': '05 진행 확정', '진행불발': '06 진행 불발', '진행중': '02 협의 중', '최종압축': '03 최종 압축' };

// rows: [{머리글: 값}] (화면에서 SheetJS로 읽은 것)
// 팀원·AGENDA·트렌드 엑셀에서 흔히 쓰는 다른 머리글
var OTHER_ALIASES = {
  members: { '성명': 'name', '이름(성명)': 'name', 'name': 'name', '부서': 'part', '팀': 'part', '소속': 'part', '권한': 'role', '상태': 'active', '사용': 'active' },
  agenda: { '프로젝트명': 'project', '안건': 'project', '내용(설명)': 'content', '팀': 'team', '파트': 'team' },
  trend: { '브랜드': 'brand', '파트너': 'brand', '내용 ': 'content' },
};
// 엑셀 머리글 하나 → 항목 키(없으면 null). 공백 차이는 무시.
function importKeyOf_(key, header) {
  var hk = String(header).trim(), nospace = hk.replace(/\s/g, '');
  var t = DB_TABLES[key];
  for (var i = 0; i < t.cols.length; i++) if (t.cols[i].label.replace(/\s/g, '') === nospace && t.cols[i].type !== 'auto' || (t.cols[i].key === 'id' && t.cols[i].label.replace(/\s/g, '') === nospace)) return t.cols[i].key;
  if (key === 'deals' && DEAL_ALIASES[hk]) return DEAL_ALIASES[hk];
  var a = OTHER_ALIASES[key] || {};
  return a[hk] || a[nospace] || null;
}

// 업로드 미리보기용: 인식한 열 / 인식 못 한 열
function importColumns_(key, rawRows) {
  var seen = {}, matched = [], unknown = [];
  (rawRows || []).slice(0, 5).forEach(function (raw) {
    Object.keys(raw).forEach(function (h) {
      if (seen[h]) return;
      seen[h] = true;
      var k = importKeyOf_(key, h);
      var col = k ? DB_TABLES[key].cols.filter(function (c) { return c.key === k; })[0] : null;
      var isAuto = !k && DB_TABLES[key].cols.some(function (c) { return c.type === 'auto' && c.label.replace(/\s/g, '') === String(h).replace(/\s/g, ''); });
      if (k) matched.push(String(h).trim() + (col && col.label.replace(/\s/g, '') !== String(h).replace(/\s/g, '') ? '→' + col.label : ''));
      else if (!isAuto) unknown.push(String(h).trim()); // 자동 계산 열(내려받은 파일에 있는 것)은 조용히 무시
    });
  });
  return { matched: matched, unknown: unknown };
}

function mapImportRow_(key, raw, defaultsUsed) {
  var out = {};
  Object.keys(raw).forEach(function (h) {
    var k = importKeyOf_(key, h);
    if (k) out[k] = raw[h];
  });
  var fill = function (k, v, label) { if (out[k] === undefined || out[k] === '') { out[k] = v; if (defaultsUsed) defaultsUsed[label] = true; } };
  if (key === 'members') { fill('role', '팀원', '역할=팀원'); fill('active', '사용', '사용여부=사용'); }
  if (key === 'agenda' || key === 'trend' || key === 'kpiGoals' || key === 'fx') fill('year', cfg_().general.year, '연도=' + cfg_().general.year);
  if (key === 'fx') fill('unit', 1, '기준 단위=1');
  if (key === 'deals') {
    if (out.year !== undefined) out.year = String(out.year).replace(/[^\d]/g, '');
    if (!out.year) out.year = cfg_().general.year; // BIS 진행현황처럼 연도 칸이 없으면 현재 기준연도
    if (out.stage && BIS_STAGE_MAP[String(out.stage).replace(/\s/g, '')]) out.stage = BIS_STAGE_MAP[String(out.stage).replace(/\s/g, '')];
    if (!out.stage && raw['최종입금금액(KRW)'] !== undefined) out.stage = stageNameByWeight_(100); // 매출현황 = 확정 건
    if (!out.part) out.part = '광고';
    ['startStatus', 'endStatus'].forEach(function (f) { if (out[f] === '-' || out[f] === '') out[f] = ''; });
    if (out.monthsText && out.months === undefined) { var mm = String(out.monthsText).match(/(\d+)\s*개월/); out.months = mm ? mm[1] : (/일/.test(out.monthsText) ? 0 : ''); }
    delete out.monthsText;
    ['note', 'reason', 'cond', 'name'].forEach(function (f) { if (out[f] === '-') out[f] = ''; });
    if (out.paidKrw === 0 || out.paidKrw === '0') out.paidKrw = '';
    if (out.stage && /불발/.test(out.stage) && !out.reason && out.note) { out.reason = out.note; out.note = ''; }
  }
  return out;
}
function stageNameByWeight_(w) { var s = dbCodes_().stages.filter(function (x) { return x.weight === w; })[0]; return s ? s.name : ''; }

// 같은 사업 찾기: ID가 있으면 ID, 없으면 (브랜드+아티스트 그룹+계약구분+시작 월)
function dealFingerprint_(r) {
  var start = flexMonth_(normFlexDate_(r.startDate) || '');
  return [String(r.brand || '').replace(/\s/g, '').toLowerCase(), String(r.group || '').toUpperCase(), r.ckind || '', start ? start.y + '-' + start.m : ''].join('|');
}

function dealFingerprint2_(r) {
  return [String(r.brand || '').replace(/\s/g, '').toLowerCase(), String(r.group || '').toUpperCase(), r.ckind || ''].join('|');
}

function dbImport_(key, rawRows, user, commit) {
  var t = DB_TABLES[key];
  if (!t || !t.editable) throw new Error('업로드할 수 없는 탭입니다.');
  var run = function () {
    var existing = readTable_(key);
    var byId = {}, byFp = {}, byFp2 = {};
    existing.forEach(function (r) {
      byId[r.id] = r;
      if (key !== 'deals') return;
      (byFp[dealFingerprint_(r)] = byFp[dealFingerprint_(r)] || []).push(r);
      (byFp2[dealFingerprint2_(r)] = byFp2[dealFingerprint2_(r)] || []).push(r);
    });
    var fxRows = key === 'deals' ? readTable_('fx') : [];
    var defaultsUsed = {};
    var result = { added: 0, updated: 0, unchanged: 0, errors: 0, rows: [], columns: importColumns_(key, rawRows) };
    var toAppend = [], toUpdate = [], logs = [];
    var seq = existing.slice();
    rawRows.forEach(function (raw, i) {
      var mapped = mapImportRow_(key, raw, defaultsUsed);
      var errors = [];
      var rec = cleanRecord_(key, mapped, errors);
      var match = null;
      if (mapped.id && byId[mapped.id]) match = byId[mapped.id];
      else if (key === 'members' && rec.name) match = existing.filter(function (m) { return m.name === rec.name; })[0] || null;
      else if (key === 'deals') {
        var c = byFp[dealFingerprint_(rec)];
        if (c && c.length === 1) match = c[0];
        // 시작일이 없는 엑셀(예: BIS 진행현황)은 브랜드+아티스트 그룹+계약구분이 하나로 특정될 때만 같은 사업으로 봄
        else { var c2 = byFp2[dealFingerprint2_(rec)]; if (c2 && c2.length === 1 && (!rec.startDate || !c2[0].startDate)) match = c2[0]; }
      }
      var status = errors.length ? 'error' : match ? 'update' : 'new';
      var changes = [];
      if (match && !errors.length) {
        t.cols.forEach(function (c) {
          if (c.type === 'auto' || rec[c.key] === '' ) return; // 빈 칸은 기존 값 유지
          if (String(match[c.key]) !== String(rec[c.key])) changes.push({ field: c.label, before: match[c.key], after: rec[c.key] });
        });
        if (!changes.length) status = 'same';
      }
      result.rows.push({ line: i + 2, status: status, id: match ? match.id : '', summary: summaryOf_(key, rec), errors: errors, changes: changes.slice(0, 6), changeCount: changes.length });
      if (status === 'error') { result.errors++; return; }
      if (status === 'same') { result.unchanged++; return; }
      if (!commit) { status === 'new' ? result.added++ : result.updated++; return; }
      if (status === 'new') {
        rec.id = nextId_(key, rec, seq);
        rec.source = '엑셀 업로드 (' + nowStamp_().slice(0, 10) + ')';
        // 엑셀로 들어온 사업은 '오늘 단계가 바뀐 것'이 아니므로 엑셀의 확정/불발일을 단계 변경일로 씀(없으면 빈칸)
        if (key === 'deals') { rec.stageDate = rec.decidedDate || ''; computeDeal_(rec, fxRows); }
        rec.updatedBy = user; rec.updatedAt = nowStamp_();
        seq.push(rec); toAppend.push(rec); result.added++;
        logs.push({ user: user, table: key, recordId: rec.id, action: '엑셀 업로드-추가', before: '', after: summaryOf_(key, rec) });
      } else {
        var merged = stripRow_(match);
        t.cols.forEach(function (c) { if (c.type !== 'auto' && rec[c.key] !== '') merged[c.key] = rec[c.key]; });
        if (key === 'deals') {
          if (merged.stage !== match.stage) merged.stageDate = nowStamp_().slice(0, 10);
          if (match.approvedAt && kpiFieldsChanged_(match, merged)) {
            merged.approvedBy = ''; merged.approvedAt = '';
            logs.push({ user: user, table: key, recordId: match.id, action: '승인 해제', field: 'KPI 승인', before: '승인', after: '엑셀 업로드로 KPI 관련 내용 변경 → 승인 대기' });
          }
          computeDeal_(merged, fxRows);
        }
        merged.updatedBy = user; merged.updatedAt = nowStamp_();
        toUpdate.push({ row: match._row, rec: merged }); result.updated++;
        changes.forEach(function (ch) { logs.push({ user: user, table: key, recordId: match.id, action: '엑셀 업로드-수정', field: ch.field, before: ch.before, after: ch.after }); });
      }
    });
    result.columns.defaults = Object.keys(defaultsUsed);
    if (commit) {
      var sh = dbSpreadsheet_().getSheetByName(t.sheet);
      toUpdate.forEach(function (u) { var row = recordToRow_(key, u.rec); sh.getRange(u.row, 1, 1, row.length).setValues([row]); });
      if (toAppend.length) {
        var rows = toAppend.map(function (r) { return recordToRow_(key, r); });
        sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      }
      appendLogs_(logs);
    }
    return result;
  };
  return commit ? withLock_(run) : run();
}

// ============================================================
// 대시보드용 계산 — 화면이 원래 받던 모양 그대로 만들어 준다(화면 코드는 그대로 재사용)
// ============================================================
function weekKeyOf_(date) {
  return MONTH_ABBR[date.getMonth()] + '_' + Math.ceil(date.getDate() / 7);
}
function weekRange_(year, key) {
  var p = String(key).split('_'), m = MONTH_ABBR.indexOf(p[0]), w = parseInt(p[1], 10);
  var start = new Date(year, m, (w - 1) * 7 + 1);
  var lastDay = new Date(year, m + 1, 0).getDate();
  var end = new Date(year, m, Math.min(w * 7, lastDay), 23, 59, 59);
  return { start: start, end: end };
}
function parseFlexToDate_(s) {
  var m = String(s || '').match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  return m ? new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1) : null;
}
function eok_(krw) { return Math.round(krw / 1e6) / 100; } // 원 → 억원(소수 둘째 자리)

// 사업 원장 → {annual,h1,h2,parts:[광고,IP], pipeline}
function kpiStatusFromDeals_(year, deals, goals) {
  var goalOf = function (part, period) {
    var g = goals.filter(function (x) { return Number(x.year) === year && x.part === part && x.period === period; })[0];
    return g ? { goal: Number(g.goalS), goalBase: g.goalB === '' ? NaN : Number(g.goalB) } : { goal: NaN, goalBase: NaN };
  };
  var sum = function (part, half) {
    var t = 0;
    deals.forEach(function (d) {
      if (Number(d.year) !== year || !isConfirmedStage_(d.stage) || !isApproved_(d) || countedKrw_(d) === '') return;
      if (part !== '전체' && d.part !== part) return;
      if (half && d.kpiHalf !== half) return;
      t += countedKrw_(d);
    });
    return eok_(t);
  };
  var rec = function (part, period) {
    var g = goalOf(part, period);
    return { goal: g.goal, goalBase: g.goalBase, actual: sum(part, period === '연간' ? null : period) };
  };
  var pipe = { active: 0, weighted: 0, activeCount: 0, confirmedCount: 0, pending: 0, pendingCount: 0 };
  deals.forEach(function (d) {
    if (Number(d.year) !== year || typeof d.kpiKrw !== 'number') return;
    if (isConfirmedStage_(d.stage)) {
      if (isApproved_(d)) pipe.confirmedCount++;
      else { pipe.pending += d.kpiKrw; pipe.pendingCount++; }
      return;
    }
    if (isActiveStage_(d.stage)) { pipe.active += d.kpiKrw; pipe.weighted += d.kpiKrw * stageInfo_(d.stage).weight / 100; pipe.activeCount++; }
  });
  return {
    annual: rec('전체', '연간'), h1: rec('전체', '상반기'), h2: rec('전체', '하반기'),
    parts: ['광고', 'IP'].map(function (p) { return { name: p, annual: rec(p, '연간'), h1: rec(p, '상반기'), h2: rec(p, '하반기') }; }),
    pipeline: { active: eok_(pipe.active), weighted: eok_(pipe.weighted), activeCount: pipe.activeCount, confirmedCount: pipe.confirmedCount,
      pending: eok_(pipe.pending), pendingCount: pipe.pendingCount },
  };
}

// 이번 주 KPI를 KPI_주간기록에 남김(같은 주는 덮어씀) — 지난 주차 조회·추이 그래프의 근거.
function upsertSnapshot_(year, week, status) {
  var cache = CacheService.getScriptCache(), ck = 'snap_' + year + '_' + week;
  var sig = JSON.stringify([status.annual, status.h1, status.h2, status.pipeline]);
  if (cache.get(ck) === sig) return;
  withLock_(function () {
    var rows = readTable_('snapshots');
    var sh = dbSpreadsheet_().getSheetByName(DB_TABLES.snapshots.sheet);
    var lines = [];
    [['전체', status]].concat(status.parts.map(function (p) { return [p.name, p]; })).forEach(function (pair) {
      [['연간', 'annual'], ['상반기', 'h1'], ['하반기', 'h2']].forEach(function (pp) {
        var r = pair[1][pp[1]];
        lines.push({ part: pair[0], period: pp[0], goalS: isNaN(r.goal) ? '' : r.goal, goalB: isNaN(r.goalBase) ? '' : r.goalBase, actual: r.actual });
      });
    });
    lines.forEach(function (l) {
      var rec = { year: year, week: week, recordedAt: nowStamp_(), part: l.part, period: l.period, goalS: l.goalS, goalB: l.goalB, actual: l.actual,
        pipeline: l.part === '전체' && l.period === '연간' ? status.pipeline.active : '', weighted: l.part === '전체' && l.period === '연간' ? status.pipeline.weighted : '',
        confirmedCount: l.part === '전체' && l.period === '연간' ? status.pipeline.confirmedCount : '', activeCount: l.part === '전체' && l.period === '연간' ? status.pipeline.activeCount : '', source: '자동 기록' };
      var ex = rows.filter(function (r) { return Number(r.year) === year && r.week === week && r.part === l.part && r.period === l.period && r.source !== '시트 이관'; })[0];
      rec.id = ex ? ex.id : 'SN-' + year + '-' + week + '-' + l.part + '-' + l.period;
      var row = recordToRow_('snapshots', rec);
      if (ex) sh.getRange(ex._row, 1, 1, row.length).setValues([row]);
      else sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    });
  });
  cache.put(ck, sig, 600);
}

function snapshotStatus_(rows) {
  var get = function (part, period) {
    var r = rows.filter(function (x) { return x.part === part && x.period === period; })[0];
    if (!r) return null;
    return { goal: r.goalS === '' ? NaN : Number(r.goalS), goalBase: r.goalB === '' ? NaN : Number(r.goalB), actual: Number(r.actual) };
  };
  var annual = get('전체', '연간');
  if (!annual) return null;
  return {
    annual: annual, h1: get('전체', '상반기'), h2: get('전체', '하반기'),
    parts: ['광고', 'IP'].map(function (p) { return { name: p, annual: get(p, '연간'), h1: get(p, '상반기'), h2: get(p, '하반기') }; })
      .filter(function (p) { return p.annual || p.h1 || p.h2; }),
  };
}

function getKpiDataDb_() {
  var year = cfg_().general.year;
  var deals = readTable_('deals'), goals = readTable_('kpiGoals');
  var now = new Date();
  var curKey = weekKeyOf_(now);
  var status = kpiStatusFromDeals_(year, deals, goals);
  if (now.getFullYear() === year) { try { upsertSnapshot_(year, curKey, status); } catch (e) {} }
  var byWeek = {};
  var snaps = readTable_('snapshots').filter(function (s) { return Number(s.year) === year; });
  var weeks = {};
  snaps.forEach(function (s) { (weeks[s.week] = weeks[s.week] || []).push(s); });
  Object.keys(weeks).forEach(function (k) {
    var p = k.split('_');
    // 같은 주에 '시트 이관'과 '자동 기록'이 함께 있으면 자동 기록 우선
    var auto = weeks[k].filter(function (s) { return s.source !== '시트 이관'; });
    var st = snapshotStatus_(auto.length ? auto : weeks[k]);
    if (st) byWeek[k] = { monthAbbr: p[0], weekNum: parseInt(p[1], 10), data: st };
  });
  if (now.getFullYear() === year) {
    var cp = curKey.split('_');
    byWeek[curKey] = { monthAbbr: cp[0], weekNum: parseInt(cp[1], 10), data: status };
  }
  var latestGoal = status.annual.goal, latestH2 = status.h2.goal;
  return {
    ok: true, byWeek: byWeek,
    goal: isNaN(latestGoal) ? cfg_().kpi.goalAnnual : latestGoal,
    h2Goal: isNaN(latestH2) ? cfg_().kpi.goalH2 : latestH2,
    goalBase: isNaN(status.annual.goalBase) ? null : status.annual.goalBase,
    h2GoalBase: isNaN(status.h2.goalBase) ? null : status.h2.goalBase,
    pipeline: status.pipeline, source: 'db',
  };
}

function getAgendaDataDb_() {
  var year = cfg_().general.year, byWeek = {};
  var map = { WIN: 'wins', SHARE: 'share', CHALLENGE: 'challenge' };
  readTable_('agenda').filter(function (r) { return Number(r.year) === year; }).forEach(function (r) {
    var p = String(r.week).split('_');
    var e = byWeek[r.week] = byWeek[r.week] || { monthAbbr: p[0], weekNum: parseInt(p[1], 10), data: { wins: [], share: [], challenge: [] } };
    e.data[map[r.kind] || 'share'].push({ label: r.team || '', proj: r.project, content: r.content });
  });
  return { ok: true, byWeek: byWeek };
}

function getTrendDataDb_() {
  var year = cfg_().general.year, byWeek = {};
  readTable_('trend').filter(function (r) { return Number(r.year) === year; }).forEach(function (r) {
    var p = String(r.week).split('_');
    var e = byWeek[r.week] = byWeek[r.week] || { monthAbbr: p[0], weekNum: parseInt(p[1], 10), cats: {} };
    (e.cats[r.kind] = e.cats[r.kind] || []).push({ artist: r.artist, brand: r.brand, label: r.brand ? r.artist + ' · ' + r.brand : r.artist, content: r.content });
  });
  Object.keys(byWeek).forEach(function (k) {
    var e = byWeek[k], sections = [];
    ['내부', '외부'].forEach(function (cat) {
      if (e.cats[cat]) sections.push({ cls: cat === '내부' ? 'extra2' : 'extra1', title: '업계리포트 - ' + cat, items: e.cats[cat] });
    });
    byWeek[k] = { monthAbbr: e.monthAbbr, weekNum: e.weekNum, data: sections };
  });
  return { ok: true, byWeek: byWeek };
}

// 계약 알림: 확정 건의 계약 종료일. 종료일이 '월만' 있으면 그 달 말일로 보고 이름에 (예정) 표기.
function getBusinessCalendarDataDb_() {
  var today = new Date(); today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  var items = [];
  readTable_('deals').forEach(function (d) {
    if (!isConfirmedStage_(d.stage) || !d.endDate) return;
    var m = String(d.endDate).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
    if (!m) return;
    var exact = !!m[3];
    var end = exact ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(+m[1], +m[2], 0);
    var sm = String(d.startDate || '').match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
    items.push({
      project: d.brand + (d.group ? ' (' + (d.artist && d.artist !== d.group ? d.artist : d.group) + ')' : '') + (exact ? '' : ' (종료 예정월)'),
      category: d.part,
      startDate: sm ? { year: +sm[1], month: +sm[2], day: sm[3] ? +sm[3] : 1 } : null,
      endDate: { year: end.getFullYear(), month: end.getMonth() + 1, day: end.getDate() },
      months: d.months === '' ? null : Number(d.months),
      dDay: Math.round((end - today) / 86400000),
      markers: [],
    });
  });
  return { ok: true, items: items };
}

// 인사이트: 그 주에 확정된 사업(확정일 또는 단계 변경일 기준) + 현재 반기 KPI 기여 상위 5건
function getInsightDataDb_() {
  var year = cfg_().general.year;
  var deals = readTable_('deals').filter(function (d) { return Number(d.year) === year && isConfirmedStage_(d.stage) && isApproved_(d) && countedKrw_(d) !== ''; })
    .map(function (d) { var o = stripRow_(d); o.kpiKrw = countedKrw_(d); return o; }); // 인사이트도 실적 인정금액 기준
  var weekKeys = {};
  Object.keys(getKpiDataDb_().byWeek).forEach(function (k) { weekKeys[k] = true; });
  var half = new Date().getMonth() < 6 ? '상반기' : '하반기';
  var halfTotal = 0;
  deals.forEach(function (d) { if (d.kpiHalf === half) halfTotal += d.kpiKrw; });
  var top = deals.filter(function (d) { return d.kpiHalf === half; }).sort(function (a, b) { return b.kpiKrw - a.kpiKrw; }).slice(0, 5)
    .map(function (d) { return { artist: d.group, category: d.part, brand: d.brand, name: d.brand + (d.name ? ' ' + d.name : ''), amount: eok_(d.kpiKrw) }; });
  var byWeek = {};
  Object.keys(weekKeys).forEach(function (k) {
    var r = weekRange_(year, k), p = k.split('_');
    var thisWeek = deals.filter(function (d) {
      var dt = parseFlexToDate_(String(d.approvedAt || '').slice(0, 10)); // KPI 실적 인정 시점 = 관리자 승인일
      return dt && dt >= r.start && dt <= r.end;
    }).map(function (d) {
      return { category: d.part, project: d.brand + (d.name ? ' ' + d.name : ''), actual: eok_(d.kpiKrw), contribPct: halfTotal ? Math.round(d.kpiKrw / halfTotal * 1000) / 10 : null };
    });
    byWeek[k] = { monthAbbr: p[0], weekNum: parseInt(p[1], 10), data: { thisWeek: thisWeek, topAnnual: top } };
  });
  return { ok: true, byWeek: byWeek };
}

// ============================================================
// 기존 시트 데이터 이관 (관리자 설정 → [기존 데이터 가져오기]) — 여러 번 눌러도 중복되지 않음
// ============================================================
// ---- 기존 시트의 사업 데이터 → 사업 원장 ----
// ① 실적현황 최신 주차 '실적 인정 사업 리스트'(금액·반기 있음) ② 사업캘린더(main) 계약 목록 ③ 05_검토 Tracker 지난 계약.
// 같은 사업(브랜드 + 아티스트 그룹)이 이미 있으면 새로 만들지 않고 비어 있는 계약 시작·종료일만 채운다.
// 실적 인정 리스트 건도 KPI 중복 집계를 막기 위해 '승인 대기'로 들어간다(관리자가 확인 후 승인).
var OTHER_ARTISTS = ['BLACKPINK', 'YG', 'AKMU', '2NE1', 'BIGBANG', 'JENNIE', 'LISA', 'ROSÉ', 'JISOO'];
var GROUP_KO = { '트레저': 'TREASURE', '베이비몬스터': 'BABYMONSTER', '위너': 'WINNER', '빅뱅': 'BIGBANG', 'TR': 'TREASURE', 'BM': 'BABYMONSTER', 'WN': 'WINNER', 'BB': 'BIGBANG' };
function groupOf_(text) {
  var t = String(text || '').trim();
  if (GROUP_KO[t]) return GROUP_KO[t];
  var up = t.toUpperCase();
  var hit = dbCodes_().groups.filter(function (g) { return g !== '기타' && up.indexOf(g.toUpperCase()) >= 0; })[0];
  return hit || '';
}
function brandKey_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, ''); }
function sameBrand_(a, b) {
  var x = brandKey_(a), y = brandKey_(b);
  if (!x || !y) return false;
  if (x === y) return true;
  var short = x.length < y.length ? x : y, long = x.length < y.length ? y : x;
  if (short.length >= 2 && long.indexOf(short) === 0) return true;
  if (short.length >= 3 && long.indexOf(short) >= 0) return true; // '가르니에' ⊂ '로레알 가르니에'
  var i = 0; while (i < short.length && x[i] === y[i]) i++;
  return i >= 3; // 'ZUS Coffee' ↔ 'ZUS 커피'처럼 앞 3글자 이상 같으면 같은 브랜드로 봄(그룹도 같아야 함)
}
function findDeal_(deals, brand, group) {
  return deals.filter(function (d) { return sameBrand_(d.brand, brand) && (!group || !d.group || d.group === group || d.group === '기타'); });
}

function migrateDeals_(user, ss) {
  var report = [];
  var deals = readTable_('deals');
  // 다시 실행해도 중복으로 쌓이지 않도록: 이미 시트에서 옮긴 사업이 있으면 건너뜀
  if (deals.some(function (d) { return /^시트 이관/.test(String(d.source || '')); })) return ['사업 원장 ← 기존 시트: 이미 옮겨 왔음(건너뜀)'];
  var fxRows = readTable_('fx');
  var toAdd = [], toUpdate = {};
  var year = cfg_().general.year;
  var seq = deals.slice();
  var addDeal = function (d) {
    d.year = d.year || year; d.id = nextId_('deals', d, seq);
    d.updatedBy = '시트 이관'; d.updatedAt = nowStamp_(); d.stageDate = '';
    computeDeal_(d, fxRows);
    seq.push(d); toAdd.push(d); deals.push(d);
  };
  var fillDates = function (d, start, end, months) {
    var changed = false;
    if (start && !d.startDate) { d.startDate = start; d.startStatus = ''; changed = true; }
    if (end && !d.endDate) { d.endDate = end; d.endStatus = ''; changed = true; }
    if (months !== '' && months !== undefined && (d.months === '' || d.months === undefined)) { d.months = months; changed = true; }
    if (changed) { computeDeal_(d, fxRows); if (d._row) toUpdate[d._row] = d; }
    return changed;
  };
  var confirmed = stageNameByWeight_(100);

  // ① 실적 인정 사업 리스트(최신 주차)
  var perfAdded = 0, perfMatched = 0;
  var preExisting = deals.slice(), claimed = {}; // 이관 전부터 있던 사업(BIS 업로드 등)과만 같은 건 판단
  try {
    var kss = SpreadsheetApp.openById(cfg_().sources.kpiFile);
    var latest = null, lo = -1;
    kss.getSheets().forEach(function (sh) { var mw = monthWeekFromSheetName_(sh.getName()); if (mw && weekOrder_(mw.monthAbbr, mw.weekNum) > lo) { lo = weekOrder_(mw.monthAbbr, mw.weekNum); latest = sh; } });
    var rows = latest ? latest.getDataRange().getValues() : [];
    var h = -1, ci = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i].map(function (c) { return String(c).trim(); });
      var a = r.indexOf('아티스트'), n = -1;
      r.forEach(function (c, j) { if (/사업명/.test(c)) n = j; });
      if (a >= 0 && n >= 0) { h = i; ci = { half: a - 1, artist: a, part: a + 1, brand: r.indexOf('브랜드/파트너사명'), name: n }; r.forEach(function (c, j) { if (/신규\s*계약금/.test(c) && ci.amount === undefined) ci.amount = j; }); break; }
    }
    for (var k = h + 1; h >= 0 && k < rows.length; k++) {
      var row = rows[k];
      var name = String(row[ci.name] || '').trim(), amount = numOrBlank_(row[ci.amount]);
      if (!name || amount === '' || amount === null) continue;
      var half = String(row[ci.half] || '').trim();
      var group = groupOf_(row[ci.artist]) || '기타';
      var part = String(row[ci.part] || '').trim() === 'IP' ? 'IP' : '광고';
      var m = name.match(/^\[(.+?)\]\s*(.+)$/);
      var kind = m ? m[1] : '';
      var rest = (m ? m[2] : name).replace(/\(.*?\)/g, '').trim();
      // '[광고] ZUS Coffee_TR 현하요' → ZUS Coffee, '[광고] 키노 화보 6월' → 키노. 괄호 없는 예전 형식은 사업명 전체를 두고 확인 필요 표시
      var brand = String(row[ci.brand] || '').trim() || (m ? (rest.indexOf('_') >= 0 ? rest.split('_')[0].trim() : rest.split(/\s+/)[0]) : rest);
      var ckMap = { '광고': '광고', '화보': '화보', 'PPL': 'SNS 시딩', '행사': '행사', 'SNS': 'SNS 시딩' };
      var ckind = ckMap[kind] || (part === 'IP' ? (/MG/.test(name) ? 'MG' : /로열티/.test(name) ? '로열티' : /전시/.test(name) ? '전시' : '라이선스')
        : /로열티/.test(name) ? '로열티' : /화보/.test(name) ? '화보' : /행사|출연료/.test(name) ? '행사' : /SNS|PPL/.test(name) ? 'SNS 시딩' : '광고');
      var cands = m
        ? preExisting.filter(function (d) { return !claimed[d.id] && d.ckind === ckind && sameBrand_(d.brand, brand) && (!d.group || d.group === group); })
        : preExisting.filter(function (d) { var bk = brandKey_(d.brand); return !claimed[d.id] && d.ckind === ckind && d.group === group && bk.length >= 2 && brandKey_(name).indexOf(bk) >= 0; });
      if (cands.length === 1) { claimed[cands[0].id] = true; perfMatched++; continue; }
      addDeal({ part: part, group: group, artist: String(row[ci.artist] || '').trim() || group, brand: brand, name: name, ctype: '신규계약', ckind: ckind,
        stage: confirmed, cur: 'KRW', amount: amount, kpiHalfManual: half === '상반기' || half === '하반기' ? half : '',
        source: '시트 이관(실적 인정 리스트 ' + (latest ? latest.getName() : '') + ')', note: m ? '' : '시트 이관 — 브랜드·사업명 확인 필요' });
      perfAdded++;
    }
  } catch (e) { report.push('실적 인정 리스트: 읽지 못함 — ' + String(e && e.message || e)); }
  report.push('사업 원장 ← 실적 인정 리스트: ' + perfAdded + '건 추가 · ' + perfMatched + '건은 이미 있음');

  // ②·③ 사업캘린더(main) · 05_검토 Tracker 계약 목록
  var calAdded = 0, calFilled = 0, calMatched = 0, calAmbiguous = 0;
  try {
    var bss = SpreadsheetApp.openById(cfg_().sources.bizCalSheet);
    // 'GROUP - 브랜드'로 그룹이 적힌 시트(검토 Tracker)를 먼저 처리해야 그룹 없는 목록이 그 결과를 기준으로 맞춰짐
    var sheetsOrdered = bss.getSheets().slice().sort(function (a, b) { return (/Tracker/i.test(b.getName()) ? 1 : 0) - (/Tracker/i.test(a.getName()) ? 1 : 0); });
    sheetsOrdered.forEach(function (sh) {
      var values = sh.getDataRange().getValues();
      var hi = -1, col = {};
      for (var i = 0; i < Math.min(values.length, 10); i++) {
        var r = values[i].map(function (c) { return String(c).trim(); });
        if (r.indexOf('프로젝트') >= 0 && r.indexOf('계약 시작일') >= 0 && r.indexOf('계약 종료일') >= 0) {
          hi = i; col = { project: r.indexOf('프로젝트'), part: r.indexOf('구분'), start: r.indexOf('계약 시작일'), end: r.indexOf('계약 종료일'), months: r.indexOf('계약기간(개월)'), type: r.indexOf('사업 유형') };
          break;
        }
      }
      if (hi < 0) return;
      for (var k = hi + 1; k < values.length; k++) {
        var row = values[k];
        var project = String(row[col.project] || '').trim();
        if (!project || project === '프로젝트' || /^[▼▲※]/.test(project)) continue;
        var parts = project.split(/\s+-\s+/);
        var g0 = groupOf_(parts[0]) || (parts[1] && OTHER_ARTISTS.indexOf(parts[0].trim().toUpperCase()) >= 0 ? '기타' : '');
        var group = g0 || (parts[1] ? groupOf_(parts[1]) : '') || '';
        var brand = g0 && parts[1] ? parts[1] : parts[0];
        var artist = g0 ? (g0 === '기타' ? parts[0].trim() : g0) : (parts[1] || '');
        var start = normFlexDate_(row[col.start]) || '', end = normFlexDate_(row[col.end]) || '';
        var months = col.months >= 0 ? numOrBlank_(row[col.months]) : '';
        var hit = findDeal_(deals, brand, group);
        if (hit.length && !group) {
          var groups = {};
          hit.forEach(function (d) { groups[d.group] = true; });
          if (Object.keys(groups).length > 1) { calAmbiguous++; continue; } // 어느 그룹 계약인지 모름 → 건드리지 않음
        }
        if (hit.length) {
          var any = false;
          hit.forEach(function (d) { if (fillDates(d, start, end, months === null ? '' : months)) any = true; });
          if (any) calFilled++; else calMatched++;
          continue;
        }
        var sy = flexMonth_(start);
        addDeal({ part: String(row[col.part] || '').trim() === 'IP' ? 'IP' : '광고', year: sy ? sy.y : year, group: group || '기타', artist: artist || group || '-', brand: brand,
          name: col.type >= 0 ? String(row[col.type] || '').trim() : '', ctype: '신규계약', ckind: String(row[col.part] || '').trim() === 'IP' ? '라이선스' : '광고',
          stage: confirmed, cur: '', amount: '', startDate: start, endDate: end, months: months === null ? '' : months,
          source: '시트 이관(' + sh.getName() + ')', note: '' });
        calAdded++;
      }
    });
  } catch (e) { report.push('사업 캘린더 시트: 읽지 못함 — ' + String(e && e.message || e)); }
  report.push('사업 원장 ← 사업 캘린더 시트: ' + calAdded + '건 추가 · ' + calFilled + '건 계약일 보강 · ' + calMatched + '건은 이미 있음' + (calAmbiguous ? ' · ' + calAmbiguous + '건은 그룹 불명확으로 건너뜀' : ''));

  var sh2 = ss.getSheetByName(DB_TABLES.deals.sheet);
  Object.keys(toUpdate).forEach(function (r) { var row = recordToRow_('deals', toUpdate[r]); sh2.getRange(Number(r), 1, 1, row.length).setValues([row]); });
  if (toAdd.length) {
    var out = toAdd.map(function (d) { return recordToRow_('deals', d); });
    sh2.getRange(sh2.getLastRow() + 1, 1, out.length, out[0].length).setValues(out);
  }
  return report;
}

function migrateFromSheets_(user) {
  var year = cfg_().general.year, report = [];
  return withLock_(function () {
    var ss = dbSpreadsheet_();
    // 1) 팀 AGENDA·트렌드: 기존 폴더의 최신 시트 모든 주차
    var importWeeks = function (key, folderId, extractor, toRows) {
      var existing = readTable_(key);
      var have = {};
      existing.forEach(function (r) { have[r.week] = true; });
      var data = getByWeekSectionData_(folderId, extractor).byWeek;
      var recs = [];
      Object.keys(data).forEach(function (wk) {
        if (have[wk]) return; // 이미 있는 주차는 건드리지 않음
        toRows(wk, data[wk].data).forEach(function (r) { recs.push(r); });
      });
      var seq = existing.slice();
      var rows = recs.map(function (r) {
        r.year = year; r.id = nextId_(key, r, seq); r.updatedBy = '시트 이관'; r.updatedAt = nowStamp_(); seq.push(r);
        return recordToRow_(key, r);
      });
      if (rows.length) { var sh = ss.getSheetByName(DB_TABLES[key].sheet); sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows); }
      report.push(DB_TABLES[key].sheet + ': ' + rows.length + '건 가져옴 (' + Object.keys(data).length + '개 주차 중 새 주차만)');
    };
    importWeeks('agenda', cfg_().sources.agendaFolder, extractAgendaFromSheet_, function (wk, d) {
      var out = [];
      [['wins', 'WIN'], ['share', 'SHARE'], ['challenge', 'CHALLENGE']].forEach(function (p) {
        (d[p[0]] || []).forEach(function (it) { out.push({ week: wk, kind: p[1], team: it.label || '', project: String(it.proj || '-'), content: String(it.content || '') }); });
      });
      return out;
    });
    importWeeks('trend', cfg_().sources.trendFolder, extractTrendFromSheet_, function (wk, sections) {
      var out = [];
      (sections || []).forEach(function (sec) {
        var kind = /내부/.test(sec.title) ? '내부' : '외부';
        (sec.items || []).forEach(function (it) {
          var artist = it.artist !== undefined ? it.artist : String(it.label || '').split(' · ')[0];
          var brand = it.brand !== undefined ? it.brand : String(it.label || '').split(' · ').slice(1).join(' · ');
          out.push({ week: wk, kind: kind, artist: artist || '-', brand: brand === '-' ? '' : brand, content: String(it.content || '') });
        });
      });
      return out;
    });
    // 1-2) 사업 원장: 실적 인정 리스트·사업 캘린더 계약 목록
    report = report.concat(migrateDeals_(user, ss));
    // 2) KPI 주차 기록·목표: 기존 실적현황 시트의 주차별 KPI 표
    var kpi = getByWeekFromFile_(cfg_().sources.kpiFile, extractKpiStatusFromSheet_).byWeek;
    var snaps = readTable_('snapshots'), haveSnap = {};
    snaps.forEach(function (s) { haveSnap[s.week + '|' + s.part + '|' + s.period] = true; });
    var snapRows = [];
    var latestKey = null, latestOrder = -1;
    Object.keys(kpi).forEach(function (wk) {
      var st = kpi[wk].data;
      if (!st) return;
      var o = weekOrder_(kpi[wk].monthAbbr, kpi[wk].weekNum);
      if (o > latestOrder) { latestOrder = o; latestKey = wk; }
      var add = function (part, period, r) {
        if (!r || haveSnap[wk + '|' + part + '|' + period]) return;
        snapRows.push(recordToRow_('snapshots', { id: 'SN-' + year + '-' + wk + '-' + part + '-' + period + '-M', year: year, week: wk, recordedAt: nowStamp_(), part: part, period: period,
          goalS: isNaN(r.goal) ? '' : r.goal, goalB: isNaN(r.goalBase) ? '' : r.goalBase, actual: isNaN(r.actual) ? '' : r.actual, pipeline: '', weighted: '', confirmedCount: '', activeCount: '', source: '시트 이관' }));
      };
      add('전체', '연간', st.annual); add('전체', '상반기', st.h1); add('전체', '하반기', st.h2);
      (st.parts || []).forEach(function (p) { add(p.name, '연간', p.annual); add(p.name, '상반기', p.h1); add(p.name, '하반기', p.h2); });
    });
    if (snapRows.length) { var ssh = ss.getSheetByName(DB_TABLES.snapshots.sheet); ssh.getRange(ssh.getLastRow() + 1, 1, snapRows.length, snapRows[0].length).setValues(snapRows); }
    report.push('KPI_주간기록: ' + snapRows.length + '행 가져옴 (' + Object.keys(kpi).length + '개 주차)');
    // KPI 목표: 최신 주차 표의 목표를 KPI_목표에 (없는 것만)
    var goals = readTable_('kpiGoals'), haveGoal = {};
    goals.forEach(function (g) { haveGoal[g.year + '|' + g.part + '|' + g.period] = true; });
    var goalRecs = [];
    if (latestKey) {
      var st2 = kpi[latestKey].data;
      var addG = function (part, period, r) {
        if (!r || isNaN(r.goal) || haveGoal[year + '|' + part + '|' + period]) return;
        goalRecs.push({ year: year, part: part, period: period, goalS: r.goal, goalB: isNaN(r.goalBase) ? '' : r.goalBase, note: '실적현황 ' + latestKey + ' 이관' });
      };
      addG('전체', '연간', st2.annual); addG('전체', '상반기', st2.h1); addG('전체', '하반기', st2.h2);
      (st2.parts || []).forEach(function (p) { addG(p.name, '연간', p.annual); addG(p.name, '상반기', p.h1); addG(p.name, '하반기', p.h2); });
    }
    var gseq = goals.slice();
    var gRows = goalRecs.map(function (g) { g.id = nextId_('kpiGoals', g, gseq); g.updatedBy = '시트 이관'; g.updatedAt = nowStamp_(); gseq.push(g); return recordToRow_('kpiGoals', g); });
    if (gRows.length) { var gsh = ss.getSheetByName(DB_TABLES.kpiGoals.sheet); gsh.getRange(gsh.getLastRow() + 1, 1, gRows.length, gRows[0].length).setValues(gRows); }
    report.push('KPI_목표: ' + gRows.length + '건 가져옴');
    appendLogs_([{ user: user, table: '이관', recordId: '', action: '기존 시트 가져오기', before: '', after: report.join(' / ') }]);
    return report;
  });
}

// ============================================================
// 관리자 모드 기능 — KPI 승인, 운영 연도 전환, 기준 정보, 플랫폼 시작하기
// ============================================================
function dbApprove_(ids, approve, user) {
  return withLock_(function () {
    var sh = dbSpreadsheet_().getSheetByName(DB_TABLES.deals.sheet);
    var rows = readTable_('deals'), fxRows = readTable_('fx'), logs = [];
    var done = 0, skipped = [];
    (ids || []).forEach(function (id) {
      var d = rows.filter(function (r) { return r.id === id; })[0];
      if (!d) { skipped.push(id + ': 없음'); return; }
      if (approve) {
        if (!isConfirmedStage_(d.stage)) { skipped.push(id + ': 진행 확정이 아님'); return; }
        if (basisOf_(d) === '실입금액' && typeof d.paidKrw !== 'number') { skipped.push(id + ': 실입금액 기준인데 실입금액이 비어 있음'); return; }
        if (basisOf_(d) !== '실입금액' && typeof d.kpiKrw !== 'number') { skipped.push(id + ': KPI 추산금액 없음(KPI 고정환율 확인)'); return; }
        if (String(d.kpiHalf).indexOf('미정') === 0) { skipped.push(id + ': KPI 인정 반기 미정(시작일 또는 반기 직접 지정 필요)'); return; }
        if (d.approvedAt) return;
        d.approvedBy = user; d.approvedAt = nowStamp_();
      } else {
        if (!d.approvedAt) return;
        d.approvedBy = ''; d.approvedAt = '';
      }
      var row = recordToRow_('deals', computeDeal_(d, fxRows));
      sh.getRange(d._row, 1, 1, row.length).setValues([row]);
      logs.push({ user: user, table: 'deals', recordId: id, action: approve ? '실적 반영 ON' : '실적 반영 OFF', field: 'KPI 승인',
        before: approve ? '승인 대기' : '승인', after: approve ? '승인 (' + d.year + ' ' + d.kpiHalf + ' · ' + basisOf_(d) + ' 기준 ' + countedKrw_(d) + '원)' : '승인 대기' });
      done++;
    });
    appendLogs_(logs);
    return { ok: true, done: done, skipped: skipped };
  });
}

function dbSetBasis_(ids, basis, user) {
  if (basis !== '실입금액' && basis !== 'KPI 고정환율') throw new Error('실적 인정 기준을 확인해 주세요.');
  return withLock_(function () {
    var sh = dbSpreadsheet_().getSheetByName(DB_TABLES.deals.sheet);
    var rows = readTable_('deals'), fxRows = readTable_('fx'), logs = [], done = 0;
    (ids || []).forEach(function (id) {
      var d = rows.filter(function (r) { return r.id === id; })[0];
      if (!d || basisOf_(d) === basis) return;
      var before = basisOf_(d);
      d.kpiBasis = basis;
      var row = recordToRow_('deals', computeDeal_(d, fxRows));
      sh.getRange(d._row, 1, 1, row.length).setValues([row]);
      logs.push({ user: user, table: 'deals', recordId: id, action: '실적 인정 기준 변경', field: '실적 인정 기준', before: before, after: basis });
      done++;
    });
    appendLogs_(logs);
    return { ok: true, done: done, rows: rows.filter(function (r) { return (ids || []).indexOf(r.id) >= 0; }).map(stripRow_) };
  });
}

// KPI 고정환율 한 번에 저장(관리자 모드): rates = [{cur, unit, rate}] — 비운 환율은 삭제하지 않고 건너뜀
function dbSaveFx_(year, rates, user) {
  var y = parseInt(year, 10);
  if (!(y >= 2000 && y <= 2100)) throw new Error('연도를 확인해 주세요.');
  var curNames = dbCodes_().currencies.map(function (x) { return typeof x === 'string' ? x : x.name; });
  return withLock_(function () {
    var sh = dbSpreadsheet_().getSheetByName(DB_TABLES.fx.sheet) || ensureTable_(dbSpreadsheet_(), 'fx');
    var rows = readTable_('fx'), logs = [], errors = [], changed = 0;
    (rates || []).forEach(function (r) {
      var cur = String(r.cur || '').trim();
      if (!cur || cur === 'KRW') return;
      if (curNames.indexOf(cur) < 0) { errors.push(cur + ': 통화 목록에 없음'); return; }
      var rate = numOrBlank_(r.rate), unit = numOrBlank_(r.unit);
      if (rate === '' ) return;
      if (rate === null || rate <= 0) { errors.push(cur + ': 환율은 0보다 큰 숫자'); return; }
      if (unit === null || unit === '' || unit <= 0) unit = 1;
      var ex = rows.filter(function (x) { return Number(x.year) === y && x.cur === cur; })[0];
      if (ex && Number(ex.rate) === rate && Number(ex.unit || 1) === unit) return;
      var rec = ex ? ex : { id: nextId_('fx', {}, rows), year: y, cur: cur, note: '' };
      var before = ex ? summaryOf_('fx', ex) : '';
      rec.unit = unit; rec.rate = rate; rec.updatedBy = user; rec.updatedAt = nowStamp_();
      var row = recordToRow_('fx', rec);
      if (ex) sh.getRange(ex._row, 1, 1, row.length).setValues([row]);
      else { sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]); rows.push(rec); }
      logs.push({ user: user, table: 'fx', recordId: rec.id, action: ex ? '수정' : '추가', field: 'KPI 고정환율', before: before, after: summaryOf_('fx', rec) });
      changed++;
    });
    appendLogs_(logs);
    var recalced = changed ? recalcDeals_(user) : 0;
    return { ok: errors.length === 0 || changed > 0, changed: changed, errors: errors, recalced: recalced };
  });
}

function setOperatingYear_(year, user) {
  var y = parseInt(year, 10);
  if (!(y >= 2000 && y <= 2100)) throw new Error('연도를 확인해 주세요.');
  var c = JSON.parse(JSON.stringify(cfg_()));
  var before = c.general.year;
  c.general.year = y;
  saveConfig_(sanitizeConfig_(c), user, '운영 연도 전환: ' + before + ' → ' + y);
  if (dbReady_()) appendLogs_([{ user: user, table: '기준 정보', recordId: '', action: '운영 연도 전환', field: '운영 연도', before: before, after: y }]);
  return y;
}

function saveCodes_(codes, user) {
  var c = JSON.parse(JSON.stringify(cfg_()));
  var before = JSON.stringify(dbCodes_().stages);
  c.codes = codes || {};
  saveConfig_(sanitizeConfig_(c), user, '기준 정보(코드) 변경');
  if (dbReady_()) {
    appendLogs_([{ user: user, table: '기준 정보', recordId: '', action: '기준 정보 변경', field: '진행 단계 등', before: before, after: JSON.stringify(dbCodes_().stages) }]);
    withLock_(function () { recalcDeals_(user); }); // 가중치가 바뀌었을 수 있으므로 다시 계산
  }
  return dbCodes_();
}

function startPlatform_(user) {
  var report = [];
  if (!dbReady_()) { var db = createDb_(user); report.push('협업 DB 생성: ' + db.name); }
  else report.push('협업 DB 이미 있음');
  try { report = report.concat(migrateFromSheets_(user)); }
  catch (e) { report.push('기존 시트 가져오기 일부 실패: ' + String(e && e.message || e)); }
  return report;
}

function dbYears_() {
  var set = {};
  set[cfg_().general.year] = true;
  if (dbReady_()) {
    ['deals', 'kpiGoals', 'snapshots', 'agenda', 'trend'].forEach(function (k) {
      readTable_(k).forEach(function (r) { var y = parseInt(r.year, 10); if (y >= 2000 && y <= 2100) set[y] = true; });
    });
  }
  return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
}

// ============================================================
// 협업 API (Index.html → google.script.run.dbApi)
// ============================================================
function dbApi(action, password, user, payloadJson) {
  var pw = getPassword_();
  if (!pw || password !== pw) return JSON.stringify({ ok: false, error: 'unauthorized' });
  var payload = {};
  try { payload = JSON.parse(payloadJson || '{}') || {}; } catch (e) { payload = {}; }
  user = cleanText_(user, 20, '(이름 없음)');
  // 관리자 모드: 화면이 관리자 비밀번호를 함께 보내면 확인(틀리면 잠금 횟수에 포함)
  var adminDenied = payload.adminPw ? checkAdminPassword_(payload.adminPw) : { error: 'forbidden' };
  var isAdmin = !adminDenied;
  var ADMIN_ACTIONS = { importPreview: 1, importCommit: 1, approve: 1, setBasis: 1, saveFx: 1, setYear: 1, saveCodes: 1, start: 1, adminCheck: 1 };
  if (ADMIN_ACTIONS[action] && !isAdmin) {
    return JSON.stringify(adminDenied.error === 'forbidden' ? { ok: false, error: 'forbidden', message: '관리자 모드에서만 할 수 있습니다.' } : adminDenied);
  }
  try {
    var res;
    switch (action) {
      case 'adminCheck': res = { ok: true }; break;
      case 'approve': res = dbApprove_(payload.ids, payload.approve !== false, user); break;
      case 'setBasis': res = dbSetBasis_(payload.ids, payload.basis, user); break;
      case 'saveFx': res = dbSaveFx_(payload.year, payload.rates, user); break;
      case 'setYear': res = { ok: true, year: setOperatingYear_(payload.year, user) }; break;
      case 'saveCodes': res = { ok: true, codes: saveCodes_(payload.codes, user) }; break;
      case 'start': res = { ok: true, report: startPlatform_(user) }; break;
      case 'meta':
        res = { ok: true, ready: dbReady_(), year: cfg_().general.year, operatingYear: cfg_().general.year, years: dbYears_(), isAdmin: isAdmin, currentWeek: weekKeyOf_(new Date()),
          tables: DB_TABLE_ORDER.map(function (k) { return { key: k, sheet: DB_TABLES[k].sheet, editable: DB_TABLES[k].editable, adminOnly: !!DB_TABLES[k].adminOnly, cols: DB_TABLES[k].cols }; }),
          stageDefaults: DEFAULT_CODES.stages,
          codes: dbReady_() ? dbCodes_() : null,
          members: dbReady_() ? readTable_('members').filter(function (m) { return m.active !== '중지'; }).map(function (m) { return { name: m.name, role: m.role, part: m.part }; }) : [],
          dbUrl: dbReady_() ? 'https://docs.google.com/spreadsheets/d/' + cfg_().sources.dbSheet + '/edit' : '' };
        break;
      case 'list': res = { ok: true, rows: readTable_(payload.table).map(stripRow_) }; break;
      case 'save': res = dbSave_(payload.table, payload.record || {}, user, payload.baseUpdatedAt, isAdmin); break;
      case 'delete': res = dbDelete_(payload.table, payload.id, user, isAdmin); break;
      case 'restore': res = dbRestore_(payload.logId, user, isAdmin); break;
      case 'importPreview': res = { ok: true, result: dbImport_(payload.table, payload.rows || [], user, false) }; break;
      case 'importCommit': res = { ok: true, result: dbImport_(payload.table, payload.rows || [], user, true) }; break;
      default: res = { ok: false, error: 'unknown_action' };
    }
    return JSON.stringify(res);
  } catch (err) {
    return JSON.stringify({ ok: false, error: 'server_error', message: String(err && err.message || err) });
  }
}
