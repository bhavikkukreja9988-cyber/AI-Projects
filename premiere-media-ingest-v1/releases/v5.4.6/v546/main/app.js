(function(){
  'use strict';
  var cp, fs, os, path;
  try { cp = require('child_process'); fs = require('fs'); os = require('os'); path = require('path'); } catch (e) { console.error('Node init failed', e); }
  var cep = window.__adobe_cep__;
  var $ = function(id){ return document.getElementById(id); };
  var ytPath = '', ffPath = '', videoFolder = '';
  var SETTINGS_KEY = 'mediaIngest.settings.v545';
  var activeTab = 'single';
  var historyFilter = '';
  var historySort = 'newest';
  var historyFavoritesOnly = false;
  var historyPlatform = 'all';
  var historyRecentOnly = false;
  var historyQuality = 'all';
  var historyCodec = 'all';
  var historyMostUsedOnly = false;
  var quickModeOpen = false;
  var currentMetadata = null;
  var currentVideoDuration = null;
  var progressStageBase = 0;
  var progressStageSpan = 100;

  function askReuseChoice(existingPath) {
    return new Promise(function(resolve){
      var box = $('reuseChoice');
      $('reuseChoiceText').textContent = 'Already downloaded:\n' + existingPath;
      box.style.display = 'block';
      function cleanup(choice){
        box.style.display = 'none';
        useBtn.removeEventListener('click', onUse);
        againBtn.removeEventListener('click', onAgain);
        resolve(choice);
      }
      var useBtn = $('reuseUseExisting');
      var againBtn = $('reuseDownloadAgain');
      function onUse(){ cleanup(true); }
      function onAgain(){ cleanup(false); }
      useBtn.addEventListener('click', onUse);
      againBtn.addEventListener('click', onAgain);
    });
  }
  var MANIFEST_NAME = '.media-ingest-index.json';

  function setStatus(msg, cls) {
    var el = $('status'); el.textContent = msg; el.className = 'status' + (cls ? ' ' + cls : '');
  }
  function setProgress(n) { $('progressBar').style.width = Math.max(0, Math.min(100, Number(n)||0)) + '%'; }
  function setProgressStage(base, span) { progressStageBase = Number(base)||0; progressStageSpan = Number(span)||0; }
  function setStageProgress(localPct) { setProgress(progressStageBase + (Math.max(0, Math.min(100, Number(localPct)||0)) * progressStageSpan / 100)); }
  function setProgressDetail(text) { var el = $('progressDetail'); if(el) el.textContent = text || ''; }
  var batchProgressContext = null;
  function batchStage(baseFraction, spanFraction) {
    if(!batchProgressContext) return false;
    setProgressStage(batchProgressContext.base + batchProgressContext.span * baseFraction, batchProgressContext.span * spanFraction);
    return true;
  }
  function showResult(title, meta, filePath) {
    var card=$('resultCard'); if(!card) return;
    card.style.display='block';
    $('resultTitle').textContent=title||'';
    $('resultMeta').textContent=meta||'';
    $('resultPath').textContent=filePath ? ('File: '+filePath) : '';
  }
  function hideResult(){ var card=$('resultCard'); if(card) card.style.display='none'; }

  function evalHost(code) {
    return new Promise(function(resolve){
      try { cep.evalScript(code, function(r){ resolve(r); }); }
      catch (e) { resolve(JSON.stringify({ok:false,error:e.message})); }
    });
  }
  function hostCall(action, payload) {
    var inner = JSON.stringify(payload || {});
    var script = 'mediaIngestDispatch(' + JSON.stringify(action) + ',' + JSON.stringify(inner) + ')';
    return evalHost(script);
  }

  function formatTimecode(seconds) {
    seconds = Math.max(0, Number(seconds) || 0);
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = Math.floor(seconds % 60);
    if (h > 0) {
      return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
    }
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function parseTimestampString(str) {
    if (!str) return null;
    str = String(str).trim().toLowerCase();
    var hMatch = str.match(/(\d+)\s*h/);
    var mMatch = str.match(/(\d+)\s*m/);
    var sMatch = str.match(/(\d+)\s*s?/);
    
    if (str.indexOf(':') !== -1) return parseTimecode(str);

    var total = 0;
    if (hMatch) total += parseInt(hMatch[1], 10) * 3600;
    if (mMatch) total += parseInt(mMatch[1], 10) * 60;
    if (sMatch && !hMatch && !mMatch) total += parseInt(sMatch[1], 10);
    else if (sMatch && (hMatch || mMatch)) {
      var sVal = str.match(/(\d+)\s*s/);
      if (sVal) total += parseInt(sVal[1], 10);
    }
    return total > 0 ? total : null;
  }

  function parseTimecode(value) {
    var parts = String(value||'').trim().split(':').map(Number);
    if (!parts.length || parts.some(function(n){return !isFinite(n)||n<0;})) throw new Error('Invalid timecode. Use HH:MM:SS, MM:SS, or seconds.');
    if (parts.length===3) return parts[0]*3600+parts[1]*60+parts[2];
    if (parts.length===2) return parts[0]*60+parts[1];
    if (parts.length===1) return parts[0];
    throw new Error('Invalid timecode.');
  }

  function cleanSocialUrl(raw) {
    if (!raw) return { url: '', platformLabel: '' };
    var cleaned = String(raw).trim();
    var platformLabel = '';

    try {
      var u = new URL(cleaned);
      var host = u.hostname.toLowerCase().replace(/^www\./,'').replace(/^m\./,'');
      var path = u.pathname;

      var stripParams = ['si','feature','t','fbclid','igsh','igshid','utm_source','utm_medium','utm_campaign','utm_term','utm_content','ref','ref_src','s'];
      stripParams.forEach(function(p){ u.searchParams.delete(p); });

      if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        if (path.indexOf('/shorts/') === 0) platformLabel = 'YouTube Shorts';
        else platformLabel = 'YouTube Video';
      } else if (host === 'youtu.be') {
        platformLabel = 'YouTube Video';
      } else if (host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am') {
        if (path.indexOf('/reel/') !== -1 || path.indexOf('/reels/') !== -1) platformLabel = 'Instagram Reel';
        else if (path.indexOf('/p/') !== -1) platformLabel = 'Instagram Post';
        else platformLabel = 'Instagram Video';
      } else if (host === 'fb.watch' || host === 'facebook.com' || host.endsWith('.facebook.com')) {
        if (path.indexOf('/reel/') !== -1) platformLabel = 'Facebook Reel';
        else platformLabel = 'Facebook Watch';
      }

      cleaned = u.toString();
    } catch (e) {}

    return { url: cleaned, platformLabel: platformLabel };
  }

  function updateRangeDuration() {
    var durEl = $('rangeDuration');
    if (!durEl) return;
    try {
      var start = parseTimecode($('start').value);
      var end = parseTimecode($('end').value);
      var diff = end - start;
      if (diff <= 0) {
        durEl.textContent = 'End time must be after start time.';
        durEl.className = 'small bad';
      } else {
        var msg = 'Clip Duration: ' + diff.toFixed(2) + 's';
        if (currentVideoDuration !== null && end > currentVideoDuration) {
          msg += ' (Warning: End timestamp exceeds total video length ' + formatTimecode(currentVideoDuration) + ')';
          durEl.className = 'small warn';
        } else {
          durEl.className = 'small good';
        }
        durEl.textContent = msg;
      }
    } catch(e) {
      durEl.textContent = 'Clip Duration: --';
      durEl.className = 'small';
    }
  }

  async function fetchVideoMetadata(url) {
    if (!url) url = $('url').value.trim();
    if (!url || !ytPath) return;
    try {
      setStatus('Fetching video info');
      var args = ['--dump-single-json','--no-playlist','--no-warnings', url];
      var stdout = await new Promise(function(resolve){
        cp.execFile(ytPath, args, { windowsHide: true, encoding: 'utf8', maxBuffer: 10*1024*1024 }, function(err, out){
          if (err) resolve(''); else resolve(out);
        });
      });
      if (!stdout) { setStatus('Ready.'); return; }
      var info = JSON.parse(stdout);
      currentMetadata = info || null;
      if (info && (info.title || info.id)) {
        $('previewCard').style.display = 'block';
        $('previewTitle').textContent = info.title || 'Video';

        var cleaned = cleanSocialUrl(url);
        var platformEl = $('previewPlatform');
        if (platformEl) {
          if (cleaned.platformLabel) {
            platformEl.textContent = cleaned.platformLabel;
            platformEl.style.display = 'inline-block';
          } else {
            platformEl.style.display = 'none';
          }
        }

        var metaParts = [];
        if (info.uploader || info.channel) metaParts.push(info.uploader || info.channel);
        if (info.duration) {
          currentVideoDuration = Number(info.duration) || 0;
          metaParts.push(formatTimecode(info.duration));
        }
        var resolution = '';
        if (info.width && info.height) resolution = info.width + '×' + info.height;
        else if (info.height) resolution = info.height + 'p';
        if (resolution) metaParts.push(resolution);
        if (info.fps) metaParts.push((Math.round(Number(info.fps)*10)/10) + ' fps');
        $('previewMeta').textContent = metaParts.join(' • ');

        var badges = [];
        var vcodec = info.vcodec && info.vcodec !== 'none' ? String(info.vcodec) : '';
        var acodec = info.acodec && info.acodec !== 'none' ? String(info.acodec) : '';
        if (vcodec) badges.push('Video: ' + vcodec.toUpperCase());
        if (acodec) badges.push('Audio: ' + acodec.toUpperCase());
        if (info.format_note) badges.push(String(info.format_note));
        var badgeHost = $('previewBadges');
        if (badgeHost) {
          badgeHost.innerHTML = '';
          badges.forEach(function(text){
            var span = document.createElement('span');
            span.className = 'previewBadge';
            span.textContent = text;
            badgeHost.appendChild(span);
          });
          badgeHost.style.display = badges.length ? 'flex' : 'none';
        }

        if (info.thumbnail) {
          $('previewThumb').src = info.thumbnail;
          $('previewThumb').style.display = 'block';
        } else {
          $('previewThumb').style.display = 'none';
        }
        updateRangeDuration();
        setStatus('Ready.', 'good');
      }
    } catch(e) {
      setStatus('Ready.');
    }
  }

  function autoParseUrlInput() {
    var raw = $('url').value.trim();
    if (!raw) {
      var badge = $('urlBadge');
      if (badge) badge.style.display = 'none';
      $('previewCard').style.display = 'none';
      currentVideoDuration = null;
      updateRangeDuration();
      return;
    }

    var tokens = raw.split(/\s+/);
    if (tokens.length >= 2) {
      var possibleUrl = tokens[0];
      try {
        new URL(possibleUrl);
        $('url').value = possibleUrl;
        var parsedStart = parseTimestampString(tokens[1]);
        if (parsedStart !== null) $('start').value = formatTimecode(parsedStart);
        if (tokens.length >= 3) {
          var parsedEnd = parseTimestampString(tokens[2]);
          if (parsedEnd !== null) $('end').value = formatTimecode(parsedEnd);
        }
        raw = possibleUrl;
      } catch(e) {}
    }

    var cleanedObj = cleanSocialUrl(raw);
    if (cleanedObj.url && cleanedObj.url !== raw) {
      $('url').value = cleanedObj.url;
    }

    var badgeEl = $('urlBadge');
    if (badgeEl) {
      if (cleanedObj.platformLabel) {
        badgeEl.textContent = 'Detected: ' + cleanedObj.platformLabel + ' (Cleaned tracking parameters)';
        badgeEl.style.display = 'block';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    try {
      var u = new URL($('url').value);
      var tParam = u.searchParams.get('t') || u.searchParams.get('start');
      if (tParam) {
        var tSec = parseTimestampString(tParam);
        if (tSec !== null) {
          $('start').value = formatTimecode(tSec);
          var currentStart = tSec;
          var currentEnd = parseTimecode($('end').value);
          if (currentEnd <= currentStart) {
            $('end').value = formatTimecode(currentStart + 15);
          }
        }
      }
    } catch(e) {}

    updateRangeDuration();
  }


  function quickRunFromKey(event) {
    if (event.key !== 'Enter') return;
    if (event.shiftKey || event.altKey || event.metaKey) return;
    if (event.ctrlKey) return; // handled globally as explicit shortcut
    if (activeTab !== 'single') return;
    event.preventDefault();
    autoParseUrlInput();
    fetchVideoMetadata();
    setTimeout(function(){ run(); }, 40);
  }

  function quickParseAndRunShortcut(event) {
    if (event.key !== 'Enter' || !event.ctrlKey) return;
    if (event.shiftKey || event.altKey || event.metaKey) return;
    if (activeTab !== 'single' && activeTab !== 'batch') return;
    event.preventDefault();
    if (activeTab === 'single') {
      autoParseUrlInput();
      fetchVideoMetadata();
    }
    setTimeout(function(){ run(); }, 20);
  }

  function validateUrl(raw) {
    var u; try { u = new URL(raw); } catch(e){ throw new Error('Paste a valid video URL.'); }
    var h = u.hostname.toLowerCase().replace(/^www\./,'');
    var ok = ['youtube.com','youtu.be','instagram.com','instagr.am','facebook.com','fb.watch'].some(function(d){return h===d||h.endsWith('.'+d);});
    if(!ok) throw new Error('Only YouTube, Instagram, or Facebook URLs are supported.');
  }

  function normalizeVideoUrl(raw) {
    var u;
    try { u = new URL(raw); } catch(e){ return String(raw||'').trim(); }
    var host = u.hostname.toLowerCase().replace(/^www\./,'').replace(/^m\./,'');
    var path = u.pathname.replace(/\/+$/,'');

    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      var vParam = u.searchParams.get('v');
      if (vParam) return 'yt:' + vParam;
      var m = path.match(/^\/(shorts|embed|v)\/([A-Za-z0-9_-]{6,})/);
      if (m) return 'yt:' + m[2];
    }
    if (host === 'youtu.be') {
      var m2 = path.match(/^\/([A-Za-z0-9_-]{6,})/);
      if (m2) return 'yt:' + m2[1];
    }

    if (host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am') {
      var m3 = path.match(/\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
      if (m3) return 'ig:' + m3[2];
    }

    if (host === 'fb.watch') {
      var m4 = path.match(/^\/([A-Za-z0-9_-]+)/);
      if (m4) return 'fb:' + m4[1];
    }
    if (host === 'facebook.com' || host.endsWith('.facebook.com')) {
      var vParam2 = u.searchParams.get('v');
      if (vParam2) return 'fb:' + vParam2;
      var m5 = path.match(/\/videos\/(\d+)/);
      if (m5) return 'fb:' + m5[1];
      var m6 = path.match(/\/reel\/(\d+)/);
      if (m6) return 'fb:' + m6[1];
      var m7 = path.match(/\/share\/v\/([A-Za-z0-9_-]+)/);
      if (m7) return 'fb:' + m7[1];
    }

    var stripParams = ['si','feature','t','fbclid','igsh','igshid','utm_source','utm_medium','utm_campaign','utm_term','utm_content','ref','ref_src','s'];
    stripParams.forEach(function(p){ u.searchParams.delete(p); });
    var qs = u.searchParams.toString();
    return host + path + (qs ? '?' + qs : '');
  }

  function escapeHtml(v){ return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;'); }

  function renderHistoryManager() {
    var container = $('historyList');
    if (!container) return;
    container.innerHTML = '';

    var manifest = loadManifest();
    var entries = [];
    var totalBytes = 0;
    var validItemsCount = 0;
    var missingItemsCount = 0;
    var search = String(historyFilter || '').trim().toLowerCase();

    Object.keys(manifest).forEach(function(k){
      var entry = manifest[k];
      if (!entry || !entry.file) return;
      var fileExists = false, fileSize = 0;
      try {
        if (fs.existsSync(entry.file)) {
          fileExists = true;
          fileSize = fs.statSync(entry.file).size;
        }
      } catch(e) {}
      if (!fileExists) { missingItemsCount++; return; }

      if (historyFavoritesOnly && !entry.favorite) return;
      if (historyPlatform !== 'all' && String(entry.platform || '').toLowerCase().indexOf(historyPlatform.toLowerCase()) === -1) return;
      if (historyQuality !== 'all' && String(entry.resolutionGroup || '').toLowerCase() !== historyQuality.toLowerCase()) return;
      if (historyCodec !== 'all' && String(entry.videoCodec || '').toLowerCase() !== historyCodec.toLowerCase()) return;
      if (historyMostUsedOnly && !(Number(entry.useCount) > 0)) return;
      if (historyRecentOnly) {
        var recentStamp = entry.lastUsedAt || entry.downloadedAt;
        if (!recentStamp || (Date.now() - new Date(recentStamp).getTime()) > 7*24*60*60*1000) return;
      }
      var fileName = path.basename(entry.file);
      var hay = [fileName, entry.sourceUrl || '', entry.platform || '', entry.title || '', k].join(' ').toLowerCase();
      if (search && hay.indexOf(search) === -1) return;

      var item = {
        key:k, entry:entry, fileName:fileName, fileSize:fileSize, favorite:!!entry.favorite, resolutionGroup:String(entry.resolutionGroup||''), videoCodec:String(entry.videoCodec||''), useCount:Number(entry.useCount||0),
        date:entry.downloadedAt ? new Date(entry.downloadedAt).getTime() : 0
      };
      entries.push(item);
      totalBytes += fileSize;
      validItemsCount++;
    });

    entries.sort(function(a,b){
      if (historySort === 'oldest') return a.date - b.date;
      if (historySort === 'name') return a.fileName.localeCompare(b.fileName);
      if (historySort === 'size') return b.fileSize - a.fileSize;
      return b.date - a.date;
    });

    if (!entries.length) {
      container.innerHTML = '<div class="small" style="color:#888;padding:12px;text-align:center">' + (historyFavoritesOnly ? 'No favorite media items.' : (search ? 'No matching media.' : 'No downloaded media items yet.')) + '</div>';
      $('storageSummary').textContent = 'Media Storage: ' + formatBytes(totalBytes) + ' (' + validItemsCount + ' items)' + (missingItemsCount ? ' • ' + missingItemsCount + ' missing' : '');
      return;
    }

    entries.forEach(function(item){
      var entry = item.entry;
      var card = document.createElement('div');
      card.className = 'historyItem';
      var dateStr = entry.downloadedAt ? new Date(entry.downloadedAt).toLocaleString() : '';
      var rangeLabel = '';
      if(Array.isArray(entry.ranges) && entry.ranges.length){
        rangeLabel = entry.ranges.map(function(r){ return formatTimecode(r.start) + '–' + formatTimecode(r.end); }).join(', ');
      }
      var platform = entry.platform ? ' • ' + entry.platform : '';
      var mediaMeta = [entry.resolution, entry.videoCodec, entry.audioCodec, entry.useCount ? ('Used ' + entry.useCount + '×') : ''].filter(Boolean).join(' • ');
      var title = entry.title && entry.title !== item.fileName ? '<div class="small" style="margin-bottom:3px;color:#bbb">' + escapeHtml(entry.title) + '</div>' : '';
      var urlLine = entry.sourceUrl ? '<div class="small" style="word-break:break-all;color:#777;margin-top:3px">' + escapeHtml(entry.sourceUrl) + '</div>' : '';

      card.innerHTML =
        '<div class="historyTitle">' + escapeHtml(item.fileName) + '</div>' +
        title +
        '<div class="historyMeta">' + formatBytes(item.fileSize) + platform + (mediaMeta ? ' • ' + escapeHtml(mediaMeta) : '') + (dateStr ? ' • ' + escapeHtml(dateStr) : '') + '</div>' +
        (rangeLabel ? '<div class="small" style="margin-bottom:6px">Ranges: ' + escapeHtml(rangeLabel) + '</div>' : '') +
        urlLine +
        '<div class="row" style="gap:4px;margin-top:7px">' +
          '<button class="reinsertBtn" style="font-size:11px;padding:4px 8px">Re-Insert</button>' +
          '<button class="projectBtn secondary" style="font-size:11px;padding:4px 8px">Add to Project</button>' +
          '<button class="favoriteBtn secondary" data-key="' + escapeHtml(item.key) + '" style="font-size:11px;padding:4px 8px">' + (item.favorite ? '★ Favorited' : '☆ Favorite') + '</button>' +
          '<button class="copyUrlBtn secondary" style="font-size:11px;padding:4px 8px">Copy URL</button>' +
          '<button class="copyPathBtn secondary" style="font-size:11px;padding:4px 8px">Copy Path</button>' +
          '<button class="explorerBtn secondary" style="font-size:11px;padding:4px 8px">Explorer</button>' +
          '<button class="deleteBtn secondary" style="font-size:11px;padding:4px 8px;color:#ff8c8c">Delete</button>' +
        '</div>';

      card.querySelector('.reinsertBtn').addEventListener('click', function(){
        reinsertMediaFile(entry.file, entry.ranges || null);
      });
      card.querySelector('.projectBtn').addEventListener('click', async function(){
        try {
          entry.lastUsedAt = new Date().toISOString(); var lm=loadManifest(); var lk=normalizeVideoUrl(entry.sourceUrl||''); if(lm[lk]) { lm[lk].lastUsedAt=entry.lastUsedAt; saveManifest(lm); }
          setStatus('Importing existing media into the Premiere Project panel…', 'good');
          var raw = await hostCall('importOnly', { file: entry.file });
          var result = JSON.parse(raw || '{}');
          if (!result.ok) throw new Error(result.error || 'Premiere import failed.');
          try { var um=loadManifest(); var uk=item.key; if(um[uk]) { um[uk].useCount=Number(um[uk].useCount||0)+1; um[uk].lastUsedAt=new Date().toISOString(); saveManifest(um); } } catch(e){}
          setStatus('Complete\nAdded to the Premiere Project panel.', 'good');
          showResult('Added to Project', entry.title || item.fileName, entry.file);
        } catch (e) {
          setStatus('Error: ' + (e.message || e), 'bad');
        }
      });
      card.querySelector('.favoriteBtn').addEventListener('click', function(){
        var key = String(this.getAttribute('data-key') || '');
        var m = loadManifest();
        if (!m[key]) return;
        m[key].favorite = !m[key].favorite;
        saveManifest(m);
        renderHistoryManager();
        setStatus(m[key].favorite ? 'Added to Favorites.' : 'Removed from Favorites.', 'good');
      });
      card.querySelector('.copyUrlBtn').addEventListener('click', function(){
        try {
          var url = String(entry.sourceUrl || '').trim();
          if (!url) throw new Error('No source URL is stored for this item.');
          var ta = document.createElement('textarea');
          ta.value = url;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          setStatus('Source URL copied to clipboard.', 'good');
        } catch (e) {
          setStatus('Could not copy URL: ' + (e.message || e), 'bad');
        }
      });
      card.querySelector('.copyPathBtn').addEventListener('click', function(){
        try { copyTextToClipboard(entry.file); setStatus('File path copied to clipboard.', 'good'); }
        catch (e) { setStatus('Could not copy file path: ' + (e.message || e), 'bad'); }
      });
      card.querySelector('.explorerBtn').addEventListener('click', function(){
        if (cp) cp.execFile('explorer.exe', ['/select,', entry.file], { windowsHide: true }, function(){});
      });
      card.querySelector('.deleteBtn').addEventListener('click', function(){
        deleteMediaFile(item.key, entry.file);
      });
      container.appendChild(card);
    });

    $('storageSummary').textContent = 'Media Storage: ' + formatBytes(totalBytes) + ' (' + validItemsCount + ' items)' + (missingItemsCount ? ' • ' + missingItemsCount + ' missing' : '') + ((search || historyQuality !== 'all' || historyCodec !== 'all' || historyMostUsedOnly) ? ' • filtered' : '');
  }

  async function reinsertMediaFile(filePath, storedRanges) {
    try {
      if (!fs.existsSync(filePath)) throw new Error('File no longer exists on disk.');
      setStatus('Re-inserting local media into Premiere…', 'good');

      var entryKeyForUse = null; try { var mm=loadManifest(); Object.keys(mm).forEach(function(k){ if(mm[k] && mm[k].file === filePath) entryKeyForUse=k; }); } catch(e){}
      var ranges = Array.isArray(storedRanges) && storedRanges.length ? storedRanges.map(function(r){ return {start:Number(r.start), end:Number(r.end)}; }) : null;
      if(!ranges){
        var start = parseTimecode($('start').value);
        var end = parseTimecode($('end').value);
        ranges = [{start:start,end:end}];
      }
      var vTrack = selectedTrackValue('vtrack');
      var aTrack = selectedTrackValue('atrack');
      var streamMode = $('streamMode').value;
      var insertMode = $('insertMode').value;
      var snapToMarker = $('snapToMarker').checked;
      var scaleToFrame = $('scaleToFrame').checked;

      var resultRaw = await hostCall('importAndInsert', {
        file: filePath,
        ranges: ranges,
        videoTrack: vTrack,
        audioTrack: aTrack,
        streamMode: streamMode,
        insertMode: insertMode,
        snapToMarker: snapToMarker,
        scaleToFrame: scaleToFrame
      });

      var result = JSON.parse(resultRaw||'{}');
      if (!result.ok) throw new Error(result.error||'Premiere re-insertion failed.');
      setStatus('Complete\nRe-inserted clip successfully.\n' + filePath, 'good');
    } catch(e) {
      setStatus('Error: ' + e.message, 'bad');
    }
  }

  async function deleteMediaFile(key, filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        var missingManifest = loadManifest();
        delete missingManifest[key];
        saveManifest(missingManifest);
        renderHistoryManager();
        setStatus('File was already missing. Cleaned the history entry.', 'warn');
        return;
      }

      var usageRaw = await hostCall('fileUsage', { file: filePath });
      var usage = {};
      try { usage = JSON.parse(usageRaw || '{}'); } catch (eParse) { usage = {}; }

      if (usage && usage.used) {
        var details = '';
        try {
          details = (usage.references || []).slice(0, 5).map(function(ref){
            return (ref.sequence ? ref.sequence + ' — ' : '') + 'track ' + ref.track;
          }).join('\n');
          if ((usage.references || []).length > 5) details += '\n…and ' + ((usage.references || []).length - 5) + ' more.';
        } catch (eDetails) {}

        var warning = 'This media file is currently used by ' + usage.count + ' clip(s) in the Premiere project.\n\n' + filePath + '\n\nDeleting it will make those clips offline.';
        if (details) warning += '\n\nReferences:\n' + details;
        warning += '\n\nDelete it anyway?';
        if (!window.confirm(warning)) {
          setStatus('Delete cancelled because the media is used by the current project.', 'warn');
          return;
        }
      } else {
        if (!window.confirm('Delete this local Media Ingest file?\n\n' + filePath + '\n\nThis cannot be undone.')) {
          setStatus('Delete cancelled.', 'warn');
          return;
        }
      }

      fs.unlinkSync(filePath);
      var m = loadManifest();
      delete m[key];
      saveManifest(m);
      renderHistoryManager();
      setStatus('Deleted local file and cleaned entry.', 'warn');
    } catch(e) {
      setStatus('Could not delete file: ' + (e.message || e), 'bad');
    }
  }

  function copyTextToClipboard(text) {
    var value = String(text || '');
    if (!value) throw new Error('Nothing to copy.');
    var ta = document.createElement('textarea');
    ta.value = value;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  function cleanMissingHistory() {
    try {
      var m = loadManifest();
      var missing = [];
      Object.keys(m).forEach(function(k){
        if (!m[k] || !m[k].file || !fs.existsSync(m[k].file)) missing.push(k);
      });
      if (!missing.length) {
        setStatus('No missing Media Ingest entries found.', 'good');
        return;
      }
      if (!window.confirm('Remove ' + missing.length + ' missing item(s) from the Media Ingest history index?\n\nThis only removes stale history entries. No existing files will be deleted.')) {
        setStatus('Clean-up cancelled.', 'warn');
        return;
      }
      missing.forEach(function(k){ delete m[k]; });
      saveManifest(m);
      renderHistoryManager();
      setStatus('Complete\nRemoved ' + missing.length + ' missing history entr' + (missing.length === 1 ? 'y.' : 'ies.'), 'good');
    } catch (e) {
      setStatus('Error: ' + (e.message || e), 'bad');
    }
  }

  function parseBatchInput(rawText) {
    var lines = String(rawText||'').split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean);
    var grouped = {};
    var order = [];
    var currentKey = null;

    function addItemRange(url, start, end) {
      if (start === null || end === null || !(end > start)) return;
      var key = normalizeVideoUrl(url) || url;
      if (!grouped[key]) {
        grouped[key] = { url: url, ranges: [] };
        order.push(key);
      }
      grouped[key].ranges.push({ start: Number(start), end: Number(end) });
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf('#') === 0 || line.indexOf('//') === 0) continue;

      var tokens = line.split(/\s+/);
      var firstToken = tokens[0];
      var isUrl = false;
      try { new URL(firstToken); isUrl = true; } catch(e){}

      if (isUrl) {
        var cleanObj = cleanSocialUrl(firstToken);
        var targetUrl = cleanObj.url || firstToken;
        currentKey = normalizeVideoUrl(targetUrl) || targetUrl;

        // URL + optional inline start/end. With one timestamp, default to a 15s clip.
        if (tokens.length >= 2) {
          var s = parseTimestampString(tokens[1]);
          var e = tokens.length >= 3 ? parseTimestampString(tokens[2]) : (s !== null ? s + 15 : null);
          addItemRange(targetUrl, s, e);
        } else {
          // Create an item now so later range-only lines can still attach to it.
          if (!grouped[currentKey]) {
            grouped[currentKey] = { url: targetUrl, ranges: [] };
            order.push(currentKey);
          }
        }
      } else if (currentKey && grouped[currentKey]) {
        var rangeParts = line.split(/[-–—\s]+/).filter(Boolean);
        if (rangeParts.length >= 2) {
          var startSec = parseTimestampString(rangeParts[0]);
          var endSec = parseTimestampString(rangeParts[1]);
          addItemRange(grouped[currentKey].url, startSec, endSec);
        }
      }
    }

    // Keep plain URLs even when they have no timestamps. Batch mode is
    // project-panel-only, so timestamps are optional and are not used for insertion.
    return order.map(function(key){
      var item = grouped[key];
      var seen = {};
      item.ranges = item.ranges.filter(function(r){
        var sig = r.start + '|' + r.end;
        if (seen[sig]) return false;
        seen[sig] = true;
        return true;
      });
      return item;
    });
  }

  function syncPreset(){ var p=$('preferPreset'); if(!p) return; if(p.value==='h264'){ $('preferH264').checked=true; $('preferSmaller').checked=false; } else if(p.value==='small'){ $('preferH264').checked=false; $('preferSmaller').checked=true; } else { $('preferH264').checked=true; $('preferSmaller').checked=false; } scheduleSave(); }

  function switchTab(tab) {
    activeTab = tab;
    if (tab === 'single') {
      if($('add')) $('add').textContent = 'Download & Add Selection';
      if($('controlsPanel')) $('controlsPanel').style.display = 'block';
      if($('test')) $('test').style.display = 'inline-block';
      $('tabSingle').className = 'tab active';
      $('tabBatch').className = 'tab';
      $('tabHistory').className = 'tab';
      $('singleSection').style.display = 'block';
      $('batchSection').style.display = 'none';
      $('historySection').style.display = 'none';
    } else if (tab === 'batch') {
      if($('add')) $('add').textContent = 'Download & Import to Project';
      if($('controlsPanel')) $('controlsPanel').style.display = 'none';
      if($('test')) $('test').style.display = 'inline-block';
      $('tabSingle').className = 'tab';
      $('tabBatch').className = 'tab active';
      $('tabHistory').className = 'tab';
      $('singleSection').style.display = 'none';
      $('batchSection').style.display = 'block';
      $('historySection').style.display = 'none';
    } else if (tab === 'history') {
      if($('add')) $('add').textContent = 'Download & Add Selection';
      if($('controlsPanel')) $('controlsPanel').style.display = 'none';
      if($('test')) $('test').style.display = 'none';
      $('tabSingle').className = 'tab';
      $('tabBatch').className = 'tab';
      $('tabHistory').className = 'tab active';
      $('singleSection').style.display = 'none';
      $('batchSection').style.display = 'none';
      $('historySection').style.display = 'block';
      renderHistoryManager();
    }
  }

  function loadSettings(){
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if(!raw) return;
      var s = JSON.parse(raw);
      if(s.url !== undefined) $('url').value = s.url;
      if(s.start) $('start').value = s.start;
      if(s.end) $('end').value = s.end;
      if(s.batchText) $('batchText').value = s.batchText;
      if(s.vtrack) $('vtrack').value = s.vtrack;
      if(s.atrack) $('atrack').value = s.atrack;
      if(s.streamMode) $('streamMode').value = s.streamMode;
      if(s.insertMode) $('insertMode').value = s.insertMode;
      if(s.activeTab) switchTab(s.activeTab);
      if(typeof s.scaleToFrame === 'boolean') $('scaleToFrame').checked = s.scaleToFrame;
      if(typeof s.snapToMarker === 'boolean') $('snapToMarker').checked = s.snapToMarker;
      if(typeof s.reuseExisting === 'boolean') $('reuseExisting').checked = s.reuseExisting;
      if(s.quality) $('quality').value = s.quality;
      if(typeof s.preferH264 === 'boolean') $('preferH264').checked = s.preferH264;
      if(typeof s.preferSmaller === 'boolean') $('preferSmaller').checked = s.preferSmaller;
      if(typeof s.useTimeRange === 'boolean') $('useTimeRange').checked = s.useTimeRange;
      if(s.importMode) $('importMode').value = s.importMode;
      if(typeof s.quickUseTime === 'boolean') $('quickUseTime').checked = s.quickUseTime;
      if(s.quickImportMode) $('quickImportMode').value = s.quickImportMode;
      if(s.preferPreset) $('preferPreset').value = s.preferPreset;
      updateModeHint();
      updateRangeDuration();
    } catch(e){}
  }
  var saveTimer = null;
  function saveSettings(){
    try {
      var s = {
        url: $('url').value,
        start: $('start').value,
        end: $('end').value,
        batchText: $('batchText').value,
        vtrack: $('vtrack').value,
        atrack: $('atrack').value,
        streamMode: $('streamMode').value,
        insertMode: $('insertMode').value,
        activeTab: activeTab,
        scaleToFrame: $('scaleToFrame').checked,
        snapToMarker: $('snapToMarker').checked,
        reuseExisting: $('reuseExisting').checked,
        quality: $('quality').value,
        preferH264: $('preferH264').checked,
        preferSmaller: $('preferSmaller').checked,
        useTimeRange: $('useTimeRange').checked,
        importMode: $('importMode').value,
        quickUseTime: $('quickUseTime').checked,
        quickImportMode: $('quickImportMode').value,
        preferPreset: $('preferPreset') ? $('preferPreset').value : 'balanced'
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch(e){}
  }
  function scheduleSave(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSettings, 100);
  }

  function updateModeHint() {
    var mode = $('insertMode').value;
    var hint = $('modeHint');
    if (!hint) return;
    if (mode === 'stack') {
      hint.textContent = 'Stack at Playhead (default): Places clip precisely at playhead on the first unused track layer without overwriting or moving existing clips.';
    } else if (mode === 'ripple') {
      hint.textContent = 'Ripple Insert: Places clip at playhead and shifts all downstream clips to the right to make room.';
    } else if (mode === 'overwrite') {
      hint.textContent = 'Overwrite at Playhead: Overwrites existing material starting at the playhead on target tracks.';
    } else if (mode === 'gap') {
      hint.textContent = 'Find Next Empty Gap: Searches forward from the playhead for a continuous empty gap and places clip there.';
    }
  }

  function findWhere(name) {
    return new Promise(function(resolve){
      if(!cp){ resolve(''); return; }
      cp.execFile('where.exe',[name],{encoding:'utf8',windowsHide:true},function(err,stdout){
        if(err){ resolve(''); return; }
        var lines = String(stdout||'').split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean);
        resolve(lines[0]||'');
      });
    });
  }
  function commonCandidates(names) {
    var home = os && os.homedir ? os.homedir() : '';
    var local = home ? path.join(home,'AppData','Local') : '';
    var candidates=[];
    names.forEach(function(n){
      candidates.push(path.join(local,'Microsoft','WinGet','Links',n));
      candidates.push(path.join(home,'bin',n));
      candidates.push(path.join(home,'scoop','shims',n));
      candidates.push(path.join('C:\\Program Files',n));
      candidates.push(path.join('C:\\ffmpeg','bin',n));
      candidates.push(path.join('C:\\Tools',n));
    });
    return candidates;
  }
  async function findTool(name) {
    var fromPath = await findWhere(name); if(fromPath) return fromPath;
    var exact = commonCandidates([name]);
    for(var i=0;i<exact.length;i++){
      var p=exact[i];
      try{ if(fs.existsSync(p)) return p; }catch(e){}
    }
    try {
      var root = path.join(os.homedir(),'AppData','Local','Microsoft','WinGet','Packages');
      if(fs.existsSync(root)){
        var packages = fs.readdirSync(root);
        for(var j=0;j<packages.length;j++){
          var base=path.join(root,packages[j]);
          var entries=[];
          try { entries=fs.readdirSync(base); } catch(e1){ continue; }
          for(var k=0;k<entries.length;k++){
            var entryPath=path.join(base,entries[k]);
            var maybeBin=path.join(entryPath,'bin',name);
            if(fs.existsSync(maybeBin)) return maybeBin;
            try {
              var subs=fs.readdirSync(entryPath);
              for(var q=0;q<subs.length;q++){
                var p2=path.join(entryPath,subs[q],'bin',name);
                if(fs.existsSync(p2)) return p2;
              }
            } catch(e2){}
          }
        }
      }
    } catch(e3){}
    return '';
  }
  async function detectTools() {
    setStatus('Detecting yt-dlp and FFmpeg…');
    ytPath = await findTool('yt-dlp.exe');
    ffPath = await findTool('ffmpeg.exe');
    var ytEl = $('ytpath');
    var ffEl = $('ffpath');
    if (ytEl) {
      ytEl.textContent = ytPath ? 'Detected' : 'Not found';
      ytEl.className = 'toolpath small ' + (ytPath ? 'good' : 'bad');
      ytEl.title = ytPath || 'yt-dlp.exe was not found';
    }
    if (ffEl) {
      ffEl.textContent = ffPath ? 'Detected' : 'Not found';
      ffEl.className = 'toolpath small ' + (ffPath ? 'good' : 'bad');
      ffEl.title = ffPath || 'ffmpeg.exe was not found';
    }
    return !!ytPath && !!ffPath;
  }
  async function hostInfo() {
    try {
      var r = await hostCall('hostInfo',{}); var o = JSON.parse(r||'{}');
      if(o && o.version) {
        var m=String(o.version).match(/^(\d+\.\d+)/); var v=m?m[1]:'26.0';
        videoFolder = path.join(os.homedir(),'Documents','Adobe','Premiere Pro',v,'Media Ingest','Videos');
        $('folder').textContent='Folder: '+videoFolder;
        var pInfo = 'Premiere '+v;
        if (o.markerCount > 0) pInfo += ' (' + o.markerCount + ' markers)';
        $('premiereVersion').textContent = pInfo;

        var seqResEl = $('seqResolution');
        if (seqResEl) {
          if (o.frameWidth && o.frameHeight) {
            seqResEl.textContent = 'Sequence: ' + o.frameWidth + 'x' + o.frameHeight + ' (' + (o.aspectRatio||'Custom') + ')';
            seqResEl.style.display = 'block';
          } else {
            seqResEl.textContent = 'Sequence: No active sequence';
          }
        }

        return o;
      }
    } catch(e){}
    videoFolder = '';
    try { $('folder').textContent='Folder: unavailable'; } catch(eFolder) {}
    try { $('premiereVersion').textContent='Premiere version unavailable'; } catch(eVersion) {}
    throw new Error('Unable to determine the active Premiere Pro version. Media Ingest cannot safely choose a storage folder.');
  }
  function ensureFolder(folder){ if(!fs.existsSync(folder)) fs.mkdirSync(folder,{recursive:true}); }
  function manifestPath(){ return path.join(videoFolder, MANIFEST_NAME); }
  function loadManifest(){
    try {
      var p=manifestPath();
      if(!fs.existsSync(p)) return {};
      var obj=JSON.parse(fs.readFileSync(p,'utf8'));
      return obj && typeof obj==='object' ? obj : {};
    } catch(e){ return {}; }
  }
  function saveManifest(manifest){
    try { fs.writeFileSync(manifestPath(), JSON.stringify(manifest,null,2), 'utf8'); } catch(e) {}
  }
  function recordDownload(url,file,ranges){
    var m=loadManifest();
    var key = normalizeVideoUrl(url);
    var existing = m[key] || {};
    m[key]={
      file:file,
      downloadedAt:new Date().toISOString(),
      sourceUrl:url,
      title: (typeof currentMetadata !== 'undefined' && currentMetadata && currentMetadata.title) ? currentMetadata.title : (existing.title || ''),
      platform: (typeof currentMetadata !== 'undefined' && currentMetadata && currentMetadata.platform) ? currentMetadata.platform : (existing.platform || ''),
      ranges:Array.isArray(ranges) ? ranges.map(function(r){ return {start:Number(r.start),end:Number(r.end)}; }) : (existing.ranges || []),
      useCount:Number(existing.useCount||0), favorite:!!existing.favorite, resolution:existing.resolution||'', resolutionGroup:existing.resolutionGroup||'', videoCodec:existing.videoCodec||'', audioCodec:existing.audioCodec||''
    };
    saveManifest(m);
    renderHistoryManager();
  }
  async function enrichHistoryEntry(url, filePath){
    try {
      var m=loadManifest(); var key=normalizeVideoUrl(url); if(!m[key]) return;
      var ffprobe=findFfprobe(); if(!ffprobe) return;
      var raw=await new Promise(function(resolve){ cp.execFile(ffprobe,['-v','error','-show_entries','stream=codec_type,codec_name,width,height','-of','json',filePath],{windowsHide:true,encoding:'utf8'},function(err,stdout){ resolve(err?'':String(stdout||'')); }); });
      if(!raw) return; var obj=JSON.parse(raw); var v=null,a=null; (obj.streams||[]).forEach(function(st){ if(st.codec_type==='video' && !v) v=st; if(st.codec_type==='audio' && !a) a=st; });
      if(v && v.width && v.height){
        m[key].resolution=v.width+'x'+v.height; var h=Math.max(v.width,v.height); m[key].resolutionGroup = h>=2160 ? '4k+' : (h>=1440 ? '1440p' : (h>=1080 ? '1080p' : (h>=720 ? '720p' : '480p-or-lower')));
      }
      if(v && v.codec_name) m[key].videoCodec=v.codec_name.toLowerCase();
      if(a && a.codec_name) m[key].audioCodec=a.codec_name.toLowerCase();
      saveManifest(m); renderHistoryManager();
    } catch(e){}
  }

  function findExistingDownload(url){
    var m=loadManifest();
    var key = normalizeVideoUrl(url);
    var entry=m[key];
    if(!entry || !entry.file) return null;
    try { if(fs.existsSync(entry.file)) return entry.file; } catch(e){}
    delete m[key]; saveManifest(m);
    return null;
  }
  function findFfprobe(){
    try{
      if(!ffPath) return '';
      var p=path.join(path.dirname(ffPath),'ffprobe.exe');
      return fs.existsSync(p)?p:'';
    }catch(e){ return ''; }
  }
  function probeStream(filePath, selectStream, entry){
    var ffprobe=findFfprobe();
    if(!ffprobe) return Promise.resolve('');
    return new Promise(function(resolve){
      cp.execFile(ffprobe,['-v','error','-select_streams',selectStream,'-show_entries',entry,'-of','default=nw=1:nk=1',filePath],{windowsHide:true,encoding:'utf8'},function(err,stdout){ resolve(err?'':String(stdout||'').trim().toLowerCase()); });
    });
  }

  async function transcodeIfNeeded(filePath, opts){
    var streamMode = $('streamMode').value;
    var vcodec = await probeStream(filePath,'v:0','stream=codec_name');
    var acodec = await probeStream(filePath,'a:0','stream=codec_name');
    
    var needsVideoConvert = (streamMode !== 'audioOnly') && vcodec && vcodec !== 'h264';
    var needsAudioConvert = (streamMode !== 'videoOnly') && acodec && acodec !== 'aac' && acodec !== 'mp3';
    
    if(!needsVideoConvert && !needsAudioConvert) return filePath;

    var label = needsVideoConvert ? (vcodec.toUpperCase()+' video') : (acodec.toUpperCase()+' audio');
    setStatus(label+' detected. Converting for Premiere compatibility…');
    if(!batchStage(0.72, 0.20)) setProgressStage(70, 20);
    setStageProgress(0);
    setProgressDetail('Converting… 0%');

    var parsed=path.parse(filePath); var out=path.join(parsed.dir,parsed.name+'__conv.mp4');
    var vArgs = needsVideoConvert ? ['-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p'] : ['-c:v','copy'];
    var aArgs = needsAudioConvert ? ['-c:a','aac','-b:a','192k'] : ['-c:a','copy'];

    await new Promise(function(resolve,reject){
      var args=['-y','-i',filePath,'-map','0:v?','-map','0:a?'].concat(vArgs,aArgs,['-movflags','+faststart',out]);
      var child=cp.spawn(ffPath,args,{windowsHide:true}); var stderr=''; var durationSeconds=0;
      cp.execFile(findFfprobe() || ffPath,['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',filePath],{windowsHide:true,encoding:'utf8'},function(err,stdout){ if(!err) durationSeconds=parseFloat(String(stdout||''))||0; });
      child.stderr.on('data',function(d){
        var text=d.toString(); stderr+=text;
        var tm=text.match(/time=(\d+):(\d+):(\d+\.?\d*)/);
        if(tm){
          var cur=(parseInt(tm[1],10)*3600)+(parseInt(tm[2],10)*60)+parseFloat(tm[3]);
          var pct=durationSeconds>0 ? Math.min(100,(cur/durationSeconds)*100) : 0;
          setStageProgress(pct);
          setProgressDetail('Converting… '+pct.toFixed(0)+'%');
        }
      });
      activeConvertChild = child;
      child.on('error',function(err){ activeConvertChild=null; try{ if(fs.existsSync(out)) fs.unlinkSync(out); }catch(e){} reject(err); });
      child.on('close',function(code){
        activeConvertChild = null;
        if(cancelRequested){ try{ if(fs.existsSync(out)) fs.unlinkSync(out); }catch(e){} reject(new Error('CANCELLED')); return; }
        if(code===0 && fs.existsSync(out)) {
          try {
            var st = fs.statSync(out);
            if (!st.size) throw new Error('Converted file is empty.');
          } catch (verifyErr) {
            try{ if(fs.existsSync(out)) fs.unlinkSync(out); }catch(e2){}
            reject(new Error('FFmpeg conversion failed. '+verifyErr.message));
            return;
          }
          setStageProgress(100);
          setProgressDetail('Conversion complete.'); setStatus('Converting complete', 'good');
          resolve();
        } else {
          try{ if(fs.existsSync(out)) fs.unlinkSync(out); }catch(e3){}
          reject(new Error('FFmpeg conversion failed. '+stderr.slice(-1600)));
        }
      });
    });
    try{ fs.unlinkSync(filePath); }catch(e){}
    return out;
  }

  function buildFormatSelector(quality, preferH264, preferSmaller, streamMode){
    if (streamMode === 'audioOnly') {
      return { selector: 'ba/ba*', sort: '+size' };
    }
    var heightCap = quality === 'best' ? '' : '[height<='+quality+']';
    var vcodecPref = preferH264 ? '[vcodec^=avc1]' : '';
    var chain = [];
    function add(s){ if(chain.indexOf(s) === -1) chain.push(s); }
    add('bv*'+heightCap+vcodecPref+'+ba');
    if(vcodecPref) add('bv*'+heightCap+'+ba');
    if(heightCap) add('bv*'+vcodecPref+'+ba');
    add('bv*+ba');
    add('b');
    var sortParts = ['res','fps','quality'];
    if(preferH264) sortParts.unshift('vcodec:h264');
    if(preferSmaller) sortParts.push('+size');
    return { selector: chain.join('/'), sort: sortParts.join(',') };
  }

  var activeDownloadChild = null;
  var activeConvertChild = null;
  var cancelRequested = false;

  async function downloadFullVideo(url) {
    ensureFolder(videoFolder);
    var quality = $('quality').value;
    var preferH264 = $('preferH264').checked;
    var preferSmaller = $('preferSmaller').checked;
    var streamMode = $('streamMode').value;

    var fmt = buildFormatSelector(quality, preferH264, preferSmaller, streamMode);
    var args = ['--no-playlist','--newline','--restrict-filenames','--paths',videoFolder,'-o','%(id)s - %(title)s.%(ext)s','--format-sort',fmt.sort,'--format-sort-force','-f',fmt.selector,'--merge-output-format','mp4','--print','after_move:filepath',url];
    if(ffPath) args.splice(args.length-1,0,'--ffmpeg-location',path.dirname(ffPath));

    if(!batchStage(0, 0.72)) setProgressStage(0, 70);
    setStageProgress(0); setProgressDetail('Downloading… 0%'); setStatus('Downloading');
    cancelRequested = false;
    $('cancel').style.display = 'inline-block';
    return await new Promise(function(resolve,reject){
      if(!cp) return reject(new Error('Node child_process is unavailable.'));
      var child = cp.spawn(ytPath,args,{windowsHide:true}); var stdout='', stderr='';
      activeDownloadChild = child;

      var progressPat = /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\w+)(?:\s+at\s+([\d.]+\w+\/s|Unknown speed))?(?:\s+ETA\s+([\d:]+|Unknown))?/;
      function consume(text){
        String(text||'').split(/\r?\n/).forEach(function(line){
          var m = line.match(progressPat);
          if(!m) return;
          var pct = parseFloat(m[1]);
          setStageProgress(pct);
          var parts = [pct.toFixed(1)+'%', 'of '+m[2]];
          if(m[3] && m[3] !== 'Unknown speed') parts.push('at '+m[3]);
          if(m[4] && m[4] !== 'Unknown') parts.push('ETA '+m[4]);
          setProgressDetail(parts.join('  '));
        });
      }
      child.stdout.on('data',function(d){ stdout += d.toString(); consume(d.toString()); });
      child.stderr.on('data',function(d){ stderr += d.toString(); });
      child.on('error',function(err){ activeDownloadChild=null; reject(err); });
      child.on('close',function(code){
        activeDownloadChild = null;
        if(cancelRequested){ reject(new Error('CANCELLED')); return; }
        if(code!==0){ reject(new Error('yt-dlp failed ('+code+'). '+(stderr||stdout).slice(-1800))); return; }
        setStageProgress(100); setProgressDetail('Download complete.');
        var printed=locatePrintedPath(stdout);
        if(printed){ transcodeIfNeeded(printed).then(resolve).catch(reject); return; }
        try {
          var files=fs.readdirSync(videoFolder).map(function(name){ var full=path.join(videoFolder,name), st=fs.statSync(full); return {full:full,mtime:st.mtimeMs}; })
            .filter(function(x){return /\.(mp4|mkv|webm|mov|m4a|mp3)$/i.test(x.full);}).sort(function(a,b){return b.mtime-a.mtime;});
          if(files.length) return transcodeIfNeeded(files[0].full).then(resolve).catch(reject);
        } catch(e){}
        reject(new Error('Download completed, but the finished media file could not be located.'));
      });
    });
  }

  async function describeMediaFile(filePath){
    try {
      var ffprobe = findFfprobe();
      if(!ffprobe) return '';
      var out = await new Promise(function(resolve){
        cp.execFile(ffprobe,['-v','error','-show_entries','stream=codec_type,codec_name,width,height','-of','json',filePath],{windowsHide:true,encoding:'utf8'},function(err,stdout){resolve(err?'':String(stdout||''));});
      });
      if(!out) return '';
      var data=JSON.parse(out), streams=data.streams||[], v=null,a=null;
      streams.forEach(function(st){ if(st.codec_type==='video' && !v) v=st; if(st.codec_type==='audio' && !a) a=st; });
      var parts=[];
      if(v){ if(v.width && v.height) parts.push(v.width+'x'+v.height); if(v.codec_name) parts.push(v.codec_name.toUpperCase()); }
      if(a && a.codec_name) parts.push(a.codec_name.toUpperCase());
      return parts.join(' • ');
    }catch(e){ return ''; }
  }

  function locatePrintedPath(output) {
    var lines=String(output||'').split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean);
    for(var i=lines.length-1;i>=0;i--){
      var s=lines[i].replace(/^\[.*?\]\s*/,'').replace(/^"|"$/g,'').trim();
      if(/\.(mp4|mkv|webm|mov|m4a|mp3)$/i.test(s) && fs.existsSync(s)) return s;
    }
    return null;
  }

  function cleanupPartialDownloads(){
    try{
      if(!videoFolder || !fs.existsSync(videoFolder)) return;
      fs.readdirSync(videoFolder).forEach(function(name){
        if(/\.(part|ytdl)$/i.test(name)){
          try{ fs.unlinkSync(path.join(videoFolder,name)); }catch(e){}
        }
      });
    }catch(e){}
  }

  function cancelActive(){
    cancelRequested = true;
    try{ if(activeDownloadChild) activeDownloadChild.kill(); }catch(e){}
    try{ if(activeConvertChild) activeConvertChild.kill(); }catch(e){}
    cleanupPartialDownloads();
    setStatus('Cancelling','warn');
  }

  function selectedTrackValue(id){ var v=$(id).value; return v==='auto' ? 'auto' : Number(v); }

  async function run(){
    hideResult();
    $('add').disabled=true; setProgressStage(0, 100); setProgress(0); setProgressDetail('Preparing… 0%'); saveSettings();
    try{
      if(!ytPath || !ffPath){ if(!(await detectTools())) throw new Error('yt-dlp and FFmpeg must both be detected first.'); }
      await hostInfo(); ensureFolder(videoFolder);

      var vTrack=selectedTrackValue('vtrack'), aTrack=selectedTrackValue('atrack');
      var streamMode=$('streamMode').value;
      var insertMode=$('insertMode').value;
      var snapToMarker=$('snapToMarker').checked;
      var scaleToFrame=$('scaleToFrame').checked;

      var batchItems = [];
      if (activeTab === 'single') {
        autoParseUrlInput();
        var url=$('url').value.trim(); validateUrl(url);
        var useRange = $('useTimeRange').checked;
        var ranges = [];
        if (useRange) {
          var start=parseTimecode($('start').value), end=parseTimecode($('end').value);
          if(end<=start) throw new Error('End time must be after start time.');
          ranges = [{ start: start, end: end }];
        }
        batchItems.push({ url: url, ranges: ranges });
      } else if (activeTab === 'batch') {
        batchItems = parseBatchInput($('batchText').value);
        if (!batchItems.length) throw new Error('No valid URLs or timestamp ranges found in batch text.');
      } else {
        throw new Error('Switch to Single Clip or Batch tab to start a download.');
      }

      if (activeTab === 'batch') {
        setStatus('Batch ready: ' + batchItems.length + ' unique source(s). Project panel only — nothing will be inserted into the timeline.');
      }

      if (activeTab === 'batch') {
        // Batch mode is a download/import-only workflow. It deliberately does NOT
        // insert anything into the timeline. This keeps batch processing simple,
        // predictable, and independent from the single-clip insertion workflow.
        var importedCount = 0;

        for (var i = 0; i < batchItems.length; i++) {
          var item = batchItems[i];
          batchProgressContext = { base: (i / batchItems.length) * 92, span: (92 / batchItems.length) };
          setProgressStage(batchProgressContext.base, batchProgressContext.span);
          setStageProgress(0);
          setStatus('Downloading ' + (i+1) + ' of ' + batchItems.length + ':\n' + item.url, 'good');

          var file = null;
          var existing = $('reuseExisting').checked ? findExistingDownload(item.url) : null;
          if (existing) {
            file = existing;
            var existingManifest = loadManifest();
            var existingKey = normalizeVideoUrl(item.url);
            if(existingManifest[existingKey]) {
              existingManifest[existingKey].sourceUrl = item.url;
              existingManifest[existingKey].ranges = item.ranges.map(function(r){ return {start:Number(r.start),end:Number(r.end)}; });
              saveManifest(existingManifest);
            }
            setStageProgress(72);
            setStatus('Using existing download', 'good');
          } else {
            setStatus('Downloading [' + (i+1) + '/' + batchItems.length + ']: ' + item.url);
            file = await downloadFullVideo(item.url);
            recordDownload(item.url, file, item.ranges); enrichHistoryEntry(item.url, file);
          }

          var mediaSummary = await describeMediaFile(file);
          if(mediaSummary) setProgressDetail('Media: ' + mediaSummary);

          if(batchProgressContext){ setProgressStage(batchProgressContext.base + batchProgressContext.span * 0.72, batchProgressContext.span * 0.28); } else { setProgressStage(90, 8); }
          setStageProgress(0); setProgressDetail('Importing to Project panel… 0%');
          setStatus('Importing');
          var importRaw = await hostCall('importOnly', { file: file });
          var importResult = JSON.parse(importRaw || '{}');
          if (!importResult.ok) {
            throw new Error('Premiere import failed for ' + item.url + ': ' + (importResult.error || 'Unknown error'));
          }
          importedCount++;
          setStageProgress(100); setProgressDetail('Imported to Project panel.');
        }

        batchProgressContext = null; setProgressStage(98, 2); setStageProgress(100); setProgress(100); setProgressDetail('Batch complete.');
        setStatus('Complete\nDownloaded/imported ' + importedCount + ' unique source(s) into the Premiere Project panel. Nothing was inserted into the timeline.', 'good');
        showResult('Batch complete', importedCount + ' unique source(s) imported to the Premiere Project panel. Timeline insertion: none.', 'See History & Manager for downloaded files.');
      } else {
        // Single mode can import to Project only, or import and place on the timeline.
        var item = batchItems[0];
        var singleImportMode = $('importMode').value;
        if (singleImportMode === 'projectOnly') {
          var file = null;
          var existingOnly = $('reuseExisting').checked ? findExistingDownload(item.url) : null;
          file = existingOnly || await downloadFullVideo(item.url);
          if (!existingOnly) recordDownload(item.url, file, item.ranges); enrichHistoryEntry(item.url, file);
          var mediaSummaryOnly = await describeMediaFile(file);
          setProgressStage(90, 8); setStageProgress(0); setStatus('Importing'); setProgressDetail('Importing to Project panel… 0%');
          var importRawOnly = await hostCall('importOnly', { file: file });
          var importResultOnly = JSON.parse(importRawOnly || '{}');
          if (!importResultOnly.ok) throw new Error('Premiere import failed: ' + (importResultOnly.error || 'Unknown error'));
          setStageProgress(100); setProgress(100); setProgressDetail('Complete.');
          setStatus('Complete\nImported to the Premiere Project panel. Nothing was inserted into the timeline.', 'good');
          showResult('Added to Project', (mediaSummaryOnly || 'Premiere-compatible media'), file);
          return;
        }
        // Project + Timeline mode. With Use time range disabled, the whole media is used.
        var useFullVideo = !$('useTimeRange').checked;
        setStatus('Processing: ' + item.url + ' (' + item.ranges.length + ' clip' + (item.ranges.length>1?'s':'') + ')');

        var file = null;
        var existing = $('reuseExisting').checked ? findExistingDownload(item.url) : null;
        if (existing) {
          file = existing;
          var existingManifest = loadManifest();
          var existingKey = normalizeVideoUrl(item.url);
          if(existingManifest[existingKey]) {
            existingManifest[existingKey].sourceUrl = item.url;
            existingManifest[existingKey].ranges = item.ranges.map(function(r){ return {start:Number(r.start),end:Number(r.end)}; });
            saveManifest(existingManifest);
          }
          setProgress(100);
          setStatus('Using existing download', 'good');
        } else {
          setStatus('Downloading: ' + item.url);
          file = await downloadFullVideo(item.url);
          recordDownload(item.url, file, item.ranges); enrichHistoryEntry(item.url, file);
        }

        if (useFullVideo) {
          var durRaw2 = await hostCall('mediaDuration', { file: file });
          var durObj2 = JSON.parse(durRaw2 || '{}');
          if (!durObj2.ok || !(Number(durObj2.duration) > 0)) throw new Error('Could not determine the full video duration.');
          item.ranges = [{start:0,end:Number(durObj2.duration)}];
        }
        var mediaSummary = await describeMediaFile(file);
        if(mediaSummary) setProgressDetail('Media: ' + mediaSummary);
        setProgressStage(90, 7); setStageProgress(0); setProgressDetail('Importing & inserting… 0%');
        setStatus('Importing');
        var resultRaw = await hostCall('importAndInsert', {
          file: file,
          ranges: item.ranges,
          videoTrack: vTrack,
          audioTrack: aTrack,
          streamMode: streamMode,
          insertMode: insertMode,
          snapToMarker: snapToMarker,
          startPosition: null,
          scaleToFrame: scaleToFrame
        });

        var result = JSON.parse(resultRaw||'{}');
        if(!result.ok) throw new Error('Premiere insertion failed: ' + (result.error||'Unknown error'));
        if ((result.totalInserted || 0) !== item.ranges.length) {
          throw new Error('Premiere inserted ' + (result.totalInserted || 0) + ' of ' + item.ranges.length + ' requested clip(s).');
        }
        setStageProgress(100); setProgress(100); setProgressDetail('Complete.');
        setStatus('Complete\nInserted ' + (result.totalInserted || item.ranges.length) + ' clip(s) on the timeline.', 'good');
        showResult('Clip inserted successfully', (mediaSummary || 'Premiere-compatible media') + ' • ' + (result.totalInserted || item.ranges.length) + ' clip(s) inserted.', file);
      }
    }catch(e){
      if(e && e.message === 'CANCELLED'){ cleanupPartialDownloads(); setStatus('Cancelled.','warn'); setProgress(0); setProgressDetail(''); }
      else { setStatus('Error\n'+(e.message||e),'bad'); }
    }
    finally{ batchProgressContext=null; $('add').disabled=false; $('cancel').style.display='none'; activeDownloadChild=null; activeConvertChild=null; }
  }

  function formatSeconds(s){s=Math.max(0,Number(s)||0);var h=Math.floor(s/3600);s-=h*3600;var m=Math.floor(s/60);var sec=(s-m*60).toFixed(2);if(sec<10)sec='0'+sec;if(m<10)m='0'+m;if(h<10)h='0'+h;return h+':'+m+':'+sec;}
  async function testTools(){try{var ok=await detectTools();setStatus(ok?'yt-dlp and FFmpeg detected and ready.':'One or more required tools are missing.',''+(ok?'good':'bad'));}catch(e){setStatus('Tool detection error: '+e.message,'bad');}}
  async function openFolder(){try{await hostInfo();ensureFolder(videoFolder);cp.execFile('explorer.exe',[videoFolder],{windowsHide:true},function(){});}catch(e){setStatus('Could not open folder: '+e.message,'bad');}}


  async function readClipboardText(){
    if(navigator && navigator.clipboard && navigator.clipboard.readText){
      try { var t = await navigator.clipboard.readText(); if(t && t.trim()) return t.trim(); } catch(e){}
    }
    if(cp && cp.execFile){
      return await new Promise(function(resolve){
        cp.execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command','Get-Clipboard -Raw'],{encoding:'utf8',windowsHide:true},function(err,stdout){
          if(err){ resolve(''); return; }
          resolve(String(stdout||'').trim());
        });
      });
    }
    return '';
  }
  async function pasteAndStart(targetId){
    try{
      var text = await readClipboardText();
      if(!text) throw new Error('Clipboard is empty or could not be read.');
      $(targetId).value = text;
      if(targetId === 'url') {
        autoParseUrlInput();
        switchTab('single');
        setTimeout(function(){ run(); }, 20);
      } else {
        syncQuickToMain();
        switchTab('single');
        setTimeout(function(){ run(); }, 20);
      }
    }catch(e){ setStatus('Could not paste from clipboard: '+e.message,'bad'); }
  }
  function openQuickImport(){
    quickModeOpen = true;
    if($('quickPanel')) $('quickPanel').style.display='block';
    if($('quickUrl')) $('quickUrl').focus();
  }
  function closeQuickImport(){ quickModeOpen=false; if($('quickPanel')) $('quickPanel').style.display='none'; }
  function syncQuickToMain(){
    var raw=$('quickUrl').value.trim();
    $('url').value=raw;
    autoParseUrlInput();
    if($('quickStart').value) $('start').value=$('quickStart').value;
    if($('quickEnd').value) $('end').value=$('quickEnd').value;
    $('useTimeRange').checked=$('quickUseTime').checked;
    $('importMode').value=$('quickImportMode').value;
    updateRangeDuration();
  }
  $('quickPaste').addEventListener('click', function(){ pasteAndStart('quickUrl'); });
  $('pasteStart').addEventListener('click', function(){ pasteAndStart('url'); });
  $('quickToggle').addEventListener('click', function(){ if(quickModeOpen){ closeQuickImport(); } else { openQuickImport(); } });
  $('quickRun').addEventListener('click', function(){ syncQuickToMain(); switchTab('single'); setTimeout(run, 10); });
  $('quickUrl').addEventListener('keydown', function(e){ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); syncQuickToMain(); switchTab('single'); setTimeout(run, 10); } });

  $('tabSingle').addEventListener('click', function(){ switchTab('single'); scheduleSave(); });
  $('tabBatch').addEventListener('click', function(){ switchTab('batch'); scheduleSave(); });
  $('tabHistory').addEventListener('click', function(){ switchTab('history'); scheduleSave(); });
  $('refreshHistoryBtn').addEventListener('click', function(){ renderHistoryManager(); });
  $('historySearch').addEventListener('input', function(){ historyFilter=this.value||''; renderHistoryManager(); });
  $('historySort').addEventListener('change', function(){ historySort=this.value||'newest'; renderHistoryManager(); });
  $('historyClearSearch').addEventListener('click', function(){ $('historySearch').value=''; historyFilter=''; renderHistoryManager(); });
  $('historyFavoritesOnly').addEventListener('click', function(){ historyFavoritesOnly=!historyFavoritesOnly; this.classList.toggle('active', historyFavoritesOnly); renderHistoryManager(); });
  $('historyPlatform').addEventListener('change', function(){ historyPlatform=this.value||'all'; renderHistoryManager(); });
  $('historyRecent').addEventListener('click', function(){ historyRecentOnly=!historyRecentOnly; this.classList.toggle('active', historyRecentOnly); renderHistoryManager(); });
  $('historyQuality').addEventListener('change', function(){ historyQuality=this.value||'all'; renderHistoryManager(); });
  $('historyCodec').addEventListener('change', function(){ historyCodec=this.value||'all'; renderHistoryManager(); });
  $('historyMostUsed').addEventListener('click', function(){ historyMostUsedOnly=!historyMostUsedOnly; this.classList.toggle('active', historyMostUsedOnly); renderHistoryManager(); });
  $('cleanMissingBtn').addEventListener('click', cleanMissingHistory);

  $('add').addEventListener('click',run); $('test').addEventListener('click',testTools); $('openFolder').addEventListener('click',openFolder); $('rescan').addEventListener('click',testTools);
  $('cancel').addEventListener('click',cancelActive);
  $('fetchInfo').addEventListener('click', function(){ fetchVideoMetadata(); });
  $('insertMode').addEventListener('change', updateModeHint);
  if($('preferPreset')) $('preferPreset').addEventListener('change', syncPreset);
  $('url').addEventListener('paste', function(){ setTimeout(function(){ autoParseUrlInput(); fetchVideoMetadata(); }, 100); });
  $('url').addEventListener('change', function(){ autoParseUrlInput(); fetchVideoMetadata(); });
  $('url').addEventListener('input', autoParseUrlInput);
  $('url').addEventListener('keydown', quickRunFromKey);
  $('start').addEventListener('keydown', quickRunFromKey);
  $('end').addEventListener('keydown', quickRunFromKey);
  $('batchText').addEventListener('keydown', quickParseAndRunShortcut);
  document.addEventListener('keydown', quickParseAndRunShortcut);

  ['start','end'].forEach(function(id){
    var el = $(id);
    if(el) el.addEventListener('input', updateRangeDuration);
  });

  ['url','start','end','batchText','vtrack','atrack','streamMode','insertMode','scaleToFrame','snapToMarker','reuseExisting','quality','preferH264','preferSmaller','preferPreset','useTimeRange','importMode','quickUseTime','quickImportMode'].forEach(function(id){
    var el = $(id);
    if(el) { el.addEventListener('change',scheduleSave); el.addEventListener('input',scheduleSave); }
  });

  loadSettings();
  (async function init(){
    if(!cep){setStatus('CEP runtime was not detected.','bad');return;}
    if(!cp){setStatus('Node.js modules are unavailable.','bad');return;}
    await hostInfo(); await testTools();
  })();
})();
