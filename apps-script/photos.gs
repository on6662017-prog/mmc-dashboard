/**
 * ММЦ Мосфильмовская — список фото помещения для дашборда.
 * GET ?folder=<id папки>&callback=<имя функции>
 * Ответ (JSONP): callback({ok:true, files:[{id,name,mime,created}]}) — от новых к старым.
 * created — время съёмки из EXIF, если есть, иначе время загрузки (мс).
 * Отдаёт только папки внутри корневой папки проекта.
 */
var ROOT = '1nRCv1QHH1r4VHLI0nMeXHUj7aNl3T4RZ';
var CACHE_SEC = 300;

function doGet(e) {
  var p = (e && e.parameter) || {};
  var cb = String(p.callback || '').replace(/[^\w$.]/g, '');
  var out;
  try {
    var id = String(p.folder || '').replace(/[^\w-]/g, '');
    if (!id) throw new Error('no folder');
    var cache = CacheService.getScriptCache();
    var hit = cache.get('f:' + id);
    if (hit) {
      out = hit;
    } else {
      if (!insideRoot_(id)) throw new Error('forbidden');
      out = JSON.stringify({ ok: true, files: list_(id) });
      if (out.length < 90000) cache.put('f:' + id, out, CACHE_SEC);
    }
  } catch (err) {
    out = JSON.stringify({ ok: false, error: String(err && err.message || err) });
  }
  if (cb) return ContentService.createTextOutput(cb + '(' + out + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

function insideRoot_(id) {
  if (id === ROOT) return true;
  var seen = {}, queue = [DriveApp.getFolderById(id)], depth = 0;
  while (queue.length && depth < 8) {
    var next = [];
    for (var i = 0; i < queue.length; i++) {
      var it = queue[i].getParents();
      while (it.hasNext()) {
        var f = it.next(), fid = f.getId();
        if (fid === ROOT) return true;
        if (!seen[fid]) { seen[fid] = 1; next.push(f); }
      }
    }
    queue = next; depth++;
  }
  return false;
}

function list_(folderId) {
  var files = [], token = '', url;
  var q = encodeURIComponent("'" + folderId + "' in parents and trashed=false and (mimeType contains 'image/' or mimeType='application/pdf' or mimeType contains 'video/')");
  do {
    url = 'https://www.googleapis.com/drive/v3/files?q=' + q +
      '&fields=nextPageToken,files(id,name,mimeType,createdTime,imageMediaMetadata/time)&pageSize=1000' +
      '&supportsAllDrives=true&includeItemsFromAllDrives=true' + (token ? '&pageToken=' + token : '');
    var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('drive ' + res.getResponseCode());
    var d = JSON.parse(res.getContentText());
    (d.files || []).forEach(function (f) {
      files.push({ id: f.id, name: f.name, mime: f.mimeType, created: shotTime_(f) });
    });
    token = d.nextPageToken || '';
  } while (token);
  files.sort(function (a, b) { return b.created - a.created; });
  return files;
}

// EXIF «2026:09:08 14:22:31» → мс; иначе время загрузки
function shotTime_(f) {
  var t = f.imageMediaMetadata && f.imageMediaMetadata.time;
  var m = t && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(t);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  return new Date(f.createdTime).getTime();
}

// Запустить один раз вручную, чтобы выдать доступ
function test() {
  Logger.log(JSON.stringify(list_(ROOT)).slice(0, 500));
  DriveApp.getRootFolder();
}
