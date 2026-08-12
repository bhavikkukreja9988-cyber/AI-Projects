const { entrypoints, storage, host, shell } = require("uxp");
const ppro = require("premierepro");
const fs = require("fs");
const os = require("os");

const VERSION = "1.1.0";
const SETTINGS_FILE = "plugin-data:/settings.json";
const VIDEO_SUBFOLDER = "Media Ingest/Videos";

const lfs = storage.localFileSystem;
const $ = id => document.getElementById(id);
const setStatus = msg => $("status").textContent = msg;

function parseTimecode(value) {
  const s = String(value).trim();
  const parts = s.split(":").map(Number);
  if (!parts.length || parts.some(n => !Number.isFinite(n) || n < 0)) throw new Error("Invalid timecode. Use HH:MM:SS, MM:SS, or seconds.");
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  throw new Error("Use HH:MM:SS, MM:SS, or seconds.");
}

function validateSourceUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error("Paste a valid video URL."); }
  const hostName = u.hostname.toLowerCase().replace(/^www\./, "");
  const allowed = ["youtube.com", "youtu.be", "instagram.com", "facebook.com", "fb.watch"];
  if (!allowed.some(d => hostName === d || hostName.endsWith("." + d))) throw new Error("Only YouTube, Instagram, or Facebook URLs are supported.");
}

function validateHttps(raw, label) {
  let u;
  try { u = new URL(raw); } catch { throw new Error(`${label} is not a valid URL.`); }
  if (u.protocol !== "https:") throw new Error(`${label} must use HTTPS.`);
}

function cleanFileName(name) {
  return String(name || "clip.mp4").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 140) || "clip.mp4";
}

function premiereVersionFolder() {
  const m = String(host.version || "26.0.0").match(/^(\d+\.\d+)/);
  return m ? m[1] : "26.0";
}

function defaultVideoFolder() {
  const home = os.homedir().replace(/[\\/]$/, "");
  const v = premiereVersionFolder();
  return `${home}/Documents/Adobe/Premiere Pro/${v}/${VIDEO_SUBFOLDER}`;
}

async function ensureFolder(path) {
  await fs.mkdir(path, { recursive: true });
  return path;
}

async function loadSettings() {
  try {
    const folder = await lfs.getEntryWithUrl("plugin-data:/");
    const file = await folder.getEntry("settings.json");
    const s = JSON.parse(await file.read());
    $("endpoint").value = s.endpoint || "";
    $("apiKey").value = s.apiKey || "";
    $("folder").value = s.folder || defaultVideoFolder();
  } catch (_) {
    $("folder").value = defaultVideoFolder();
  }
}

async function saveSettings() {
  const folder = $("folder").value.trim() || defaultVideoFolder();
  const dataFolder = await lfs.getEntryWithUrl("plugin-data:/");
  const file = await dataFolder.createFile("settings.json", { overwrite: true });
  await file.write(JSON.stringify({ endpoint: $("endpoint").value.trim(), apiKey: $("apiKey").value, folder }, null, 2));
}

function tick(seconds) { return ppro.TickTime.createWithSeconds(seconds); }

async function getActiveSequence() {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("No active Premiere project.");
  const seq = await project.getActiveSequence();
  if (!seq) throw new Error("Open a Premiere sequence first.");
  return { project, sequence: seq };
}

async function getPlayhead(sequence) { return Number((await sequence.getPlayerPosition()).seconds); }

async function trackRanges(track) {
  const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
  const ranges = [];
  for (const item of items) {
    const a = Number((await item.getStartTime()).seconds);
    const b = Number((await item.getEndTime()).seconds);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) ranges.push([a, b]);
  }
  return ranges;
}

async function findEmptyStart(sequence, playhead, duration, vIndex, aIndex, withAudio) {
  const occupied = [];
  occupied.push(...await trackRanges(await sequence.getVideoTrack(vIndex)));
  if (withAudio) occupied.push(...await trackRanges(await sequence.getAudioTrack(aIndex)));
  occupied.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let cursor = playhead;
  for (const [start, end] of occupied) {
    if (end <= cursor + 0.00001) continue;
    if (start >= cursor && start - cursor >= duration - 0.00001) return cursor;
    if (start <= cursor && end > cursor) cursor = end;
  }
  return cursor;
}

async function callResolver(endpoint, apiKey, payload) {
  const headers = { "Content-Type": "application/json", "Accept": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
  let data = null;
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) throw new Error(data?.error || `Resolver returned HTTP ${response.status}.`);
  if (!data?.downloadUrl) throw new Error("Resolver did not return a clip download URL.");
  return data;
}

async function downloadToPath(url, nativePath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Clip download failed (HTTP ${response.status}).`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 1024) throw new Error("The returned clip is unexpectedly small.");
  await fs.writeFile(nativePath, buffer);
  return buffer.byteLength;
}

async function importAndInsert(project, sequence, nativePath, insertAt, vIndex, aIndex, withAudio) {
  const root = await project.getRootItem();
  const ok = await project.importFiles([nativePath], true, root, false);
  if (!ok) throw new Error("Premiere could not import the downloaded clip.");
  const expected = nativePath.split(/[\\/]/).pop().toLowerCase();
  let media = null;
  for (let attempt = 0; attempt < 20 && !media; attempt++) {
    const items = await root.getItems();
    media = items.find(item => String(item.name || "").toLowerCase() === expected);
    if (!media) await new Promise(r => setTimeout(r, 250));
  }
  if (!media) throw new Error("The clip was imported but could not be located in the Project panel.");

  const editor = await ppro.SequenceEditor.getEditor(sequence);
  project.lockedAccess(() => {
    const action = editor.createOverwriteItemAction(media, tick(insertAt), vIndex, withAudio ? aIndex : -1);
    project.executeTransaction(c => c.addAction(action), "Media Ingest - Add Clip");
  });
}

async function run() {
  const endpoint = $("endpoint").value.trim();
  const apiKey = $("apiKey").value.trim();
  const url = $("url").value.trim();
  const start = parseTimecode($("start").value);
  const end = parseTimecode($("end").value);
  const vIndex = Number($("vtrack").value) - 1;
  const aIndex = Number($("atrack").value) - 1;
  const emptyOnly = $("emptyOnly").checked;
  const withAudio = $("includeAudio").checked;
  const folder = $("folder").value.trim() || defaultVideoFolder();

  if (!endpoint) throw new Error("Set the resolver URL in Settings before downloading.");
  validateHttps(endpoint, "Resolver URL");
  validateSourceUrl(url);
  if (end <= start) throw new Error("End time must be after start time.");
  if (!Number.isInteger(vIndex) || vIndex < 0 || !Number.isInteger(aIndex) || aIndex < 0) throw new Error("Track numbers must be 1 or higher.");

  await ensureFolder(folder);
  await saveSettings();
  const { project, sequence } = await getActiveSequence();
  const playhead = await getPlayhead(sequence);
  const duration = end - start;
  const insertAt = emptyOnly ? await findEmptyStart(sequence, playhead, duration, vIndex, aIndex, withAudio) : playhead;

  setStatus("Requesting the selected section…");
  const result = await callResolver(endpoint, apiKey, { version: VERSION, url, start, end, quality: "1080p", format: "mp4", includeAudio: withAudio });

  const base = cleanFileName(result.filename || `media-ingest-${Math.round(start)}-${Math.round(end)}.mp4`);
  const fileName = base.toLowerCase().endsWith(".mp4") ? base : `${base}.mp4`;
  const nativePath = `${folder.replace(/[\\/]$/, "")}/${fileName}`;
  setStatus("Downloading the clip to your Media Ingest folder…");
  const bytes = await downloadToPath(result.downloadUrl, nativePath);

  setStatus(`Saved locally (${Math.round(bytes / 1048576)} MB). Importing into Premiere…`);
  await importAndInsert(project, sequence, nativePath, insertAt, vIndex, aIndex, withAudio);
  setStatus(`Done — saved to ${nativePath} and inserted at ${insertAt.toFixed(2)}s.`);
}

async function test() {
  const endpoint = $("endpoint").value.trim();
  validateHttps(endpoint, "Resolver URL");
  const headers = { Accept: "application/json" };
  const key = $("apiKey").value.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  setStatus("Testing resolver connection…");
  const response = await fetch(endpoint, { headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  setStatus(`Connected${data?.name ? ` — ${data.name}` : ""}.`);
}

async function openFolder() {
  const folder = $("folder").value.trim() || defaultVideoFolder();
  await ensureFolder(folder);
  const result = await shell.openPath(folder, "Open the Media Ingest Videos folder in Windows Explorer.");
  if (result) throw new Error(result);
}

$("add").addEventListener("click", async () => { $("add").disabled = true; try { await run(); } catch (e) { setStatus("Error: " + (e.message || e)); } finally { $("add").disabled = false; } });
$("test").addEventListener("click", async () => { $("test").disabled = true; try { await test(); } catch (e) { setStatus("Error: " + (e.message || e)); } finally { $("test").disabled = false; } });
$("openFolder").addEventListener("click", async () => { try { await openFolder(); } catch (e) { setStatus("Error: " + (e.message || e)); } });
$("endpoint").addEventListener("change", () => saveSettings().catch(() => {}));
$("apiKey").addEventListener("change", () => saveSettings().catch(() => {}));
$("folder").addEventListener("change", () => saveSettings().catch(() => {}));

entrypoints.setup({ panels: { mediaIngestPanel: { show() { setStatus("Ready."); } } } });
loadSettings().catch(e => setStatus("Settings warning: " + e.message));
