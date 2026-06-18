/**
 * 야구 스코어보드 - Google Apps Script 백엔드
 *
 * - doGet : 스코어보드 화면(Index.html)을 서빙. 현재 배포된 웹앱 URL을 템플릿에 주입.
 * - doPost: 프론트엔드에서 전송한 경기 결과(JSON)를 구글 시트에 저장.
 *
 * 결과를 저장할 스프레드시트는 최초 1회 자동 생성되며, 그 ID는
 * Script Properties("RESULT_SPREADSHEET_ID")에 저장되어 이후 재사용됩니다.
 */

var RESULT_PROP_KEY = 'RESULT_SPREADSHEET_ID';
var SUMMARY_SHEET = '경기요약';
var BATTER_SHEET = '타자기록';

/**
 * 최초 1회 권한 승인용 헬퍼.
 * Apps Script 에디터에서 이 함수를 한 번 실행하면 웹앱이 사용하는 모든 스코프
 * (SpreadsheetApp / PropertiesService / ScriptApp)에 대한 OAuth 동의가 부여되어,
 * 익명(ANYONE_ANONYMOUS) 접근 시 발생하던 403 / doPost 권한 오류가 해소된다.
 */
function authorize() {
  var ss = getResultSpreadsheet_();           // SpreadsheetApp + PropertiesService 스코프
  var url = ScriptApp.getService().getUrl();   // ScriptApp 스코프
  Logger.log('결과 시트: ' + ss.getUrl());
  Logger.log('웹앱 URL: ' + url);
  return '권한 승인 완료';
}

/**
 * 스코어보드 화면 서빙.
 */
function doGet() {
  var template = HtmlService.createTemplateFromFile('Index');
  // 결과 전송 기본값으로 쓰일 현재 웹앱(/exec) URL. 미배포 시 빈 문자열.
  template.webAppUrl = ScriptApp.getService().getUrl() || '';
  return template
    .evaluate()
    .setTitle('야구 스코어보드')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 경기 결과 수신 및 시트 저장.
 * 프론트엔드가 mode:'no-cors'로 전송하므로 응답 본문은 사용되지 않지만,
 * 직접 호출/디버깅을 위해 JSON 결과를 반환한다.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('요청 본문이 비어 있습니다.');
    }
    var data = JSON.parse(e.postData.contents);
    saveGameResult_(data);
    return jsonResponse_({ ok: true });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

/**
 * 결과 데이터를 두 개의 시트(경기요약, 타자기록)에 누적 기록.
 */
function saveGameResult_(data) {
  var ss = getResultSpreadsheet_();
  var date = data.date || new Date().toLocaleString();
  var away = data.awayTeam || {};
  var home = data.homeTeam || {};

  // 1) 경기 요약: 한 경기당 두 줄(어웨이/홈)
  var summary = getOrCreateSheet_(ss, SUMMARY_SHEET, [
    '일시', '구분', '팀명', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'R', 'H'
  ]);
  summary.appendRow(buildSummaryRow_(date, 'AWAY', away));
  summary.appendRow(buildSummaryRow_(date, 'HOME', home));

  // 2) 타자 기록: 선수 한 명당 한 줄
  var batters = getOrCreateSheet_(ss, BATTER_SHEET, [
    '일시', '팀명', '타순', '이름', '타수', '안타', '타율'
  ]);
  appendLineup_(batters, date, away);
  appendLineup_(batters, date, home);
}

function buildSummaryRow_(date, side, team) {
  var scores = team.scores || [];
  var row = [date, side, team.name || side];
  for (var i = 0; i < 9; i++) {
    row.push(typeof scores[i] === 'number' ? scores[i] : 0);
  }
  row.push(team.runs || 0);
  row.push(team.hits || 0);
  return row;
}

function appendLineup_(sheet, date, team) {
  var lineup = team.lineup || [];
  for (var i = 0; i < lineup.length; i++) {
    var b = lineup[i];
    sheet.appendRow([
      date,
      team.name || '',
      b.order,
      b.name,
      b.atBats || 0,
      b.hits || 0,
      formatAvg_(b.hits || 0, b.atBats || 0)
    ]);
  }
}

function formatAvg_(hits, atBats) {
  if (!atBats) return '.000';
  var avg = (hits / atBats).toFixed(3);
  return avg.charAt(0) === '0' ? avg.substring(1) : avg;
}

/**
 * 결과 저장용 스프레드시트를 가져오거나 최초 1회 생성.
 */
function getResultSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(RESULT_PROP_KEY);
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      // 시트가 삭제된 경우 새로 생성하도록 진행
    }
  }
  var ss = SpreadsheetApp.create('야구 스코어보드 경기기록');
  props.setProperty(RESULT_PROP_KEY, ss.getId());
  return ss;
}

function getOrCreateSheet_(ss, name, header) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
    // 기본 'Sheet1'/'시트1' 빈 시트 정리
    var first = ss.getSheets()[0];
    if (first.getName() !== name && first.getLastRow() === 0) {
      ss.deleteSheet(first);
    }
  }
  return sheet;
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
