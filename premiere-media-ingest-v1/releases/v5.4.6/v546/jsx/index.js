function mediaIngestTime(seconds) {
    var t = new Time();
    t.seconds = Number(seconds) || 0;
    return t;
}

function mediaIngestTrackRanges(track) {
    var ranges = [];
    if (!track) return ranges;
    for (var i = 0; i < track.clips.numItems; i++) {
        var c = track.clips[i];
        ranges.push([c.start.seconds, c.end.seconds]);
    }
    return ranges;
}

function mediaIngestTrackIsFreeAt(track, start, duration) {
    if (!track) return true;
    var end = start + duration;
    var ranges = mediaIngestTrackRanges(track);
    for (var i = 0; i < ranges.length; i++) {
        var s = ranges[i][0], e = ranges[i][1];
        if (s < end - 0.000001 && e > start + 0.000001) return false;
    }
    return true;
}

// Finds a video/audio track pair that is free at the exact given position.
// Tries the caller's preferred track first (if it's a valid index in THIS
// sequence), then scans every remaining track from 0 upward. This matters
// for two reasons that previously caused Stack mode to report "no free
// track space" even when free space genuinely existed at the playhead:
//   1. A "preferred" track index left over from a different sequence (more
//      tracks than the current one) must not silently skip the whole scan.
//   2. A free LOWER-index track must still be found even if the preferred
//      track itself is occupied, instead of immediately giving up on the
//      exact playhead and falling through to a later timestamp.
function mediaIngestFindStackedTrackAtPosition(seq, duration, position, preferredV, preferredA, streamMode) {
    var maxV = seq.videoTracks ? seq.videoTracks.numTracks : 0;
    var maxA = seq.audioTracks ? seq.audioTracks.numTracks : 0;
    var includeVideo = streamMode !== 'audioOnly';
    var includeAudio = streamMode !== 'videoOnly';

    var vOrder = [];
    if (includeVideo) {
        if (preferredV >= 0 && preferredV < maxV) vOrder.push(preferredV);
        for (var vv = 0; vv < maxV; vv++) { if (vOrder.indexOf(vv) === -1) vOrder.push(vv); }
    } else {
        vOrder = [-1];
    }
    var aOrderBase = [];
    if (includeAudio) {
        if (preferredA >= 0 && preferredA < maxA) aOrderBase.push(preferredA);
        for (var aa = 0; aa < maxA; aa++) { if (aOrderBase.indexOf(aa) === -1) aOrderBase.push(aa); }
    } else {
        aOrderBase = [-1];
    }

    for (var vi = 0; vi < vOrder.length; vi++) {
        var v = vOrder[vi];
        var vt = includeVideo ? seq.videoTracks[v] : null;
        if (includeVideo && !mediaIngestTrackIsFreeAt(vt, position, duration)) continue;

        if (!includeAudio) {
            return { videoTrack: v, audioTrack: -1 };
        }

        for (var ai = 0; ai < aOrderBase.length; ai++) {
            var a = aOrderBase[ai];
            var at = seq.audioTracks[a];
            if (mediaIngestTrackIsFreeAt(at, position, duration)) {
                return { videoTrack: includeVideo ? v : -1, audioTrack: a };
            }
        }
    }
    return null;
}

function mediaIngestFindGapOnTracks(seq, duration, vIndex, aIndex, streamMode, startPosition) {
    var ranges = [];
    var includeVideo = streamMode !== 'audioOnly';
    var includeAudio = streamMode !== 'videoOnly';

    if (includeVideo && vIndex >= 0 && vIndex < seq.videoTracks.numTracks) {
        ranges = ranges.concat(mediaIngestTrackRanges(seq.videoTracks[vIndex]));
    }
    if (includeAudio && aIndex >= 0 && aIndex < seq.audioTracks.numTracks) {
        ranges = ranges.concat(mediaIngestTrackRanges(seq.audioTracks[aIndex]));
    }
    ranges.sort(function(a, b) { return a[0] - b[0] || a[1] - b[1]; });

    var cursor = startPosition;
    for (var k = 0; k < ranges.length; k++) {
        var s = ranges[k][0], e = ranges[k][1];
        if (e <= cursor + 0.000001) continue;
        if (s >= cursor && (s - cursor) >= duration - 0.000001) return cursor;
        if (s <= cursor && e > cursor) cursor = Math.max(cursor, e);
    }
    return cursor;
}

function mediaIngestFindAutoTracks(seq, duration, streamMode, startPosition) {
    var maxV = seq.videoTracks ? seq.videoTracks.numTracks : 0;
    var maxA = seq.audioTracks ? seq.audioTracks.numTracks : 0;
    var includeVideo = streamMode !== 'audioOnly';
    var includeAudio = streamMode !== 'videoOnly';

    var best = null;

    var vCandidates = includeVideo ? [] : [-1];
    var aCandidates = includeAudio ? [] : [-1];
    if (includeVideo) for (var v = 0; v < maxV; v++) vCandidates.push(v);
    if (includeAudio) for (var a = 0; a < maxA; a++) aCandidates.push(a);

    for (var vi = 0; vi < vCandidates.length; vi++) {
        for (var ai = 0; ai < aCandidates.length; ai++) {
            var vIndex = vCandidates[vi];
            var aIndex = aCandidates[ai];
            var insertAt = mediaIngestFindGapOnTracks(seq, duration, vIndex, aIndex, streamMode, startPosition);
            var candidate = { videoTrack: vIndex, audioTrack: aIndex, insertAt: insertAt };
            if (!best || insertAt < best.insertAt - 0.000001 ||
                (Math.abs(insertAt - best.insertAt) < 0.000001 &&
                 ((vIndex >= 0 ? vIndex : 999) + (aIndex >= 0 ? aIndex : 999)) <
                 ((best.videoTrack >= 0 ? best.videoTrack : 999) + (best.audioTrack >= 0 ? best.audioTrack : 999)))) {
                best = candidate;
            }
        }
    }
    return best;
}

function mediaIngestFindNearestMarkerTime(seq, playhead, snapToMarker) {
    if (!snapToMarker || !seq || !seq.markers) return playhead;
    try {
        var markers = seq.markers;
        var current = markers.getFirstMarker();
        var bestTime = playhead;
        var minDiff = 1000000;
        
        while (current) {
            var diff = Math.abs(current.start.seconds - playhead);
            if (diff < minDiff && diff <= 10.0) {
                minDiff = diff;
                bestTime = current.start.seconds;
            }
            current = markers.getNextMarker(current);
        }
        return bestTime;
    } catch (e) {
        return playhead;
    }
}

function mediaIngestFindProjectItem(root, filePath) {
    var target = String(filePath).replace(/\\/g, '/').split('/').pop().toLowerCase();
    function walk(bin) {
        if (!bin || !bin.children) return null;
        for (var i = 0; i < bin.children.numItems; i++) {
            var item = bin.children[i];
            if (!item) continue;
            if (item.type !== ProjectItemType.BIN && String(item.name).toLowerCase() === target) return item;
            if (item.type === ProjectItemType.BIN) {
                var found = walk(item);
                if (found) return found;
            }
        }
        return null;
    }
    return walk(root);
}

function mediaIngestFileUsage(filePath) {
    var target = String(filePath).replace(/\\/g, '/').toLowerCase();
    var refs = [];
    if (!app.project) return JSON.stringify({ used: false, count: 0, references: [] });

    function matchesProjectItem(item) {
        if (!item) return false;
        try {
            if (typeof item.getMediaPath === 'function') {
                var mediaPath = String(item.getMediaPath() || '').replace(/\\/g, '/').toLowerCase();
                if (mediaPath && mediaPath === target) return true;
            }
        } catch (e) {}
        return false;
    }

    function scanSequence(seq) {
        if (!seq) return;
        var seqName = '';
        try { seqName = String(seq.name || ''); } catch (eName) {}
        function scanTracks(tracks) {
            if (!tracks) return;
            for (var t = 0; t < tracks.numTracks; t++) {
                var track = tracks[t];
                if (!track || !track.clips) continue;
                for (var c = 0; c < track.clips.numItems; c++) {
                    var clip = track.clips[c];
                    try {
                        if (clip && matchesProjectItem(clip.projectItem)) {
                            refs.push({ sequence: seqName, track: t + 1, start: clip.start.seconds, end: clip.end.seconds });
                        }
                    } catch (eClip) {}
                }
            }
        }
        try { scanTracks(seq.videoTracks); } catch (eV) {}
        try { scanTracks(seq.audioTracks); } catch (eA) {}
    }

    try {
        if (app.project.sequences && app.project.sequences.numSequences) {
            for (var i = 0; i < app.project.sequences.numSequences; i++) scanSequence(app.project.sequences[i]);
        } else if (app.project.activeSequence) {
            scanSequence(app.project.activeSequence);
        }
    } catch (eSeq) {
        try { if (app.project.activeSequence) scanSequence(app.project.activeSequence); } catch (eActive) {}
    }

    return JSON.stringify({ used: refs.length > 0, count: refs.length, references: refs });
}

function mediaIngestImport(filePath) {
    var root = app.project.rootItem;
    var existing = mediaIngestFindProjectItem(root, filePath);
    if (existing) return existing;
    var ok = app.project.importFiles([filePath], true, root, false);
    if (!ok) throw new Error('Premiere could not import the downloaded video.');
    for (var attempt = 0; attempt < 80; attempt++) {
        var found = mediaIngestFindProjectItem(root, filePath);
        if (found) return found;
        $.sleep(250);
    }
    throw new Error('Video was downloaded but could not be located in the Project panel.');
}


function mediaIngestMediaDuration(filePath) {
    try {
        var f = String(filePath || '').replace(/\\/g, '/');
        // Premiere import is the reliable source of duration for supported media.
        var item = mediaIngestImport(f);
        var dur = item && item.getMediaDuration ? Number(item.getMediaDuration()) : Number(item && item.duration);
        return JSON.stringify({ ok: isFinite(dur) && dur > 0, duration: dur || 0 });
    } catch (e) {
        return JSON.stringify({ ok: false, duration: 0, error: String(e) });
    }
}

function mediaIngestHostInfo() {
    var seq = app.project && app.project.activeSequence;
    var playhead = seq ? seq.getPlayerPosition().seconds : 0;
    var markerCount = 0;
    var width = 0, height = 0, ratioStr = '';

    if (seq) {
        try {
            width = Number(seq.frameSizeHorizontal) || 0;
            height = Number(seq.frameSizeVertical) || 0;
            if (width > 0 && height > 0) {
                if (width === height) ratioStr = '1:1 Square';
                else if (width < height) ratioStr = '9:16 Vertical';
                else ratioStr = '16:9 Landscape';
            }
        } catch (eRes) {}

        if (seq.markers) {
            try {
                var m = seq.markers.getFirstMarker();
                while (m) { markerCount++; m = seq.markers.getNextMarker(m); }
            } catch (eM) {}
        }
    }

    return JSON.stringify({
        ok: true,
        version: String(app.version || ''),
        project: !!app.project,
        sequence: !!seq,
        playerSeconds: playhead,
        markerCount: markerCount,
        frameWidth: width,
        frameHeight: height,
        aspectRatio: ratioStr
    });
}

function mediaIngestApplyScaleToFrame(seq, vTrackIndex, insertAt) {
    if (!seq || vTrackIndex < 0 || vTrackIndex >= seq.videoTracks.numTracks) return;
    try {
        var vt = seq.videoTracks[vTrackIndex];
        for (var i = 0; i < vt.clips.numItems; i++) {
            var c = vt.clips[i];
            if (Math.abs(c.start.seconds - insertAt) < 0.1) {
                if (typeof c.setScaleToFrameSize === 'function') {
                    c.setScaleToFrameSize(1);
                }
                break;
            }
        }
    } catch (eScale) {}
}

function mediaIngestDispatch(action, payloadString) {
    try {
        var args = JSON.parse(payloadString || '{}');
        if (action === 'hostInfo') return mediaIngestHostInfo();
        if (action === 'mediaDuration') return mediaIngestMediaDuration(args.file);
        if (action === 'fileUsage') return mediaIngestFileUsage(args.file);
        if (action === 'importOnly') {
            if (!app.project) throw new Error('No Premiere project is open.');
            var importedItem = mediaIngestImport(args.file);
            return JSON.stringify({ ok: true, file: args.file, name: importedItem && importedItem.name ? String(importedItem.name) : '' });
        }
        if (action !== 'importAndInsert') throw new Error('Unknown action: ' + action);
        if (!app.project) throw new Error('No Premiere project is open.');
        var seq = app.project.activeSequence;
        if (!seq) throw new Error('Open a Premiere sequence first.');

        var ranges = args.ranges;
        if (!ranges || !ranges.length) {
            var s = Number(args.start), e = Number(args.end);
            if (isFinite(s) && isFinite(e)) ranges = [{ start: s, end: e }];
        }
        if (!ranges || !ranges.length) throw new Error('No valid selection ranges provided.');

        var vArg = args.videoTrack;
        var aArg = args.audioTrack;
        var streamMode = args.streamMode || 'both';
        var insertMode = args.insertMode || 'stack';
        var snapToMarker = !!args.snapToMarker;
        var scaleToFrame = args.scaleToFrame !== false;

        var includeVideo = streamMode !== 'audioOnly';
        var includeAudio = streamMode !== 'videoOnly';

        var playhead = seq.getPlayerPosition().seconds;
        var requestedStart = Number(args.startPosition);
        var hasRequestedStart = isFinite(requestedStart) && requestedStart >= 0;
        var currentPosition = hasRequestedStart ? requestedStart : mediaIngestFindNearestMarkerTime(seq, playhead, snapToMarker);

        var item = mediaIngestImport(args.file);
        var insertedClips = [];
        var lastInsertEnd = null;

        for (var i = 0; i < ranges.length; i++) {
            var rStart = Number(ranges[i].start);
            var rEnd = Number(ranges[i].end);
            var duration = rEnd - rStart;

            if (!(isFinite(rStart) && isFinite(rEnd) && duration > 0)) continue;
            if (rStart < 0) continue;

            var vIndex = (vArg === 'auto') ? -1 : Number(vArg);
            var aIndex = (aArg === 'auto') ? -1 : Number(aArg);
            var insertAt = currentPosition;
            var useOverwrite = false;

            if (insertMode === 'stack') {
                var preferredV = vIndex >= 0 ? vIndex : 0;
                var preferredA = aIndex >= 0 ? aIndex : 0;
                var stacked = mediaIngestFindStackedTrackAtPosition(seq, duration, currentPosition, preferredV, preferredA, streamMode);
                if (!stacked) {
                    // If every eligible track is occupied at the playhead, find the
                    // next safe empty position instead of failing immediately. This
                    // preserves the plugin's original intent: never overwrite by
                    // default, and use the nearest available empty space.
                    var fallback = mediaIngestFindAutoTracks(seq, duration, streamMode, currentPosition);
                    if (!fallback) {
                        var diagMaxV = seq.videoTracks ? seq.videoTracks.numTracks : 0;
                        var diagMaxA = seq.audioTracks ? seq.audioTracks.numTracks : 0;
                        throw new Error('No free track space available at or after ' + currentPosition.toFixed(2) +
                            's. (sequence has ' + diagMaxV + ' video track(s), ' + diagMaxA + ' audio track(s), ' +
                            'stream mode: ' + streamMode + '). Add a track in Premiere and try again.');
                    }
                    vIndex = fallback.videoTrack;
                    aIndex = fallback.audioTrack;
                    insertAt = fallback.insertAt;
                } else {
                    vIndex = stacked.videoTrack;
                    aIndex = stacked.audioTrack;
                    insertAt = currentPosition;
                }
                useOverwrite = true;
            } else if (insertMode === 'gap') {
                if (vIndex < 0 && aIndex < 0) {
                    var autoPair = mediaIngestFindAutoTracks(seq, duration, streamMode, currentPosition);
                    if (!autoPair) throw new Error('No track pair has enough empty space after ' + currentPosition.toFixed(2) + 's.');
                    vIndex = autoPair.videoTrack;
                    aIndex = autoPair.audioTrack;
                    insertAt = autoPair.insertAt;
                } else {
                    if (vIndex < 0 && includeVideo) vIndex = 0;
                    if (aIndex < 0 && includeAudio) aIndex = 0;
                    insertAt = mediaIngestFindGapOnTracks(seq, duration, vIndex, aIndex, streamMode, currentPosition);
                }
                // A gap is explicitly verified as empty; use overwrite so we DO NOT ripple anything.
                useOverwrite = true;
            } else if (insertMode === 'ripple') {
                if (vIndex < 0 && includeVideo) vIndex = 0;
                if (aIndex < 0 && includeAudio) aIndex = 0;
                insertAt = currentPosition;
                useOverwrite = false;
            } else if (insertMode === 'overwrite') {
                if (vIndex < 0 && includeVideo) vIndex = 0;
                if (aIndex < 0 && includeAudio) aIndex = 0;
                insertAt = currentPosition;
                useOverwrite = true;
            }

            if (includeVideo && (vIndex < 0 || vIndex >= seq.videoTracks.numTracks)) {
                throw new Error('Video track V' + (vIndex + 1) + ' does not exist in sequence.');
            }
            if (includeAudio && (aIndex < 0 || aIndex >= seq.audioTracks.numTracks)) {
                throw new Error('Audio track A' + (aIndex + 1) + ' does not exist in sequence.');
            }

            if (insertMode === 'gap') {
                var videoFree = !includeVideo || mediaIngestTrackIsFreeAt(seq.videoTracks[vIndex], insertAt, duration);
                var audioFree = !includeAudio || mediaIngestTrackIsFreeAt(seq.audioTracks[aIndex], insertAt, duration);
                if (!videoFree || !audioFree) {
                    throw new Error('The selected gap is no longer empty at ' + insertAt.toFixed(2) + 's. No clips were intentionally overwritten.');
                }
            }

            var previousIn = null, previousOut = null;
            try { previousIn = item.getInPoint().seconds; } catch (e1) {}
            try { previousOut = item.getOutPoint().seconds; } catch (e2) {}

            var targetVTrack = includeVideo ? vIndex : -1;
            var targetATrack = includeAudio ? aIndex : -1;
            var insertionError = null;
            try {
                item.setInPoint(rStart, 4);
                item.setOutPoint(rEnd, 4);

                if (useOverwrite) {
                    seq.overwriteClip(item, mediaIngestTime(insertAt), targetVTrack >= 0 ? targetVTrack : 0, targetATrack);
                } else {
                    seq.insertClip(item, mediaIngestTime(insertAt), targetVTrack >= 0 ? targetVTrack : 0, targetATrack);
                }

                if (scaleToFrame && includeVideo && targetVTrack >= 0) {
                    mediaIngestApplyScaleToFrame(seq, targetVTrack, insertAt);
                }
            } catch (insertErr) {
                insertionError = insertErr;
            } finally {
                try {
                    if (previousIn !== null && isFinite(previousIn)) item.setInPoint(previousIn, 4);
                    else item.clearInPoint();
                } catch (restoreInErr) {}
                try {
                    if (previousOut !== null && isFinite(previousOut)) item.setOutPoint(previousOut, 4);
                    else item.clearOutPoint();
                } catch (restoreOutErr) {}
            }
            if (insertionError) throw insertionError;

            insertedClips.push({
                insertAt: insertAt,
                duration: duration,
                sourceIn: rStart,
                sourceOut: rEnd,
                videoTrack: includeVideo ? (vIndex + 1) : null,
                audioTrack: includeAudio ? (aIndex + 1) : null
            });

            currentPosition = insertAt + duration + 0.05;
            lastInsertEnd = insertAt + duration;
        }

        try { app.project.save(); } catch (saveErr) {}

        return JSON.stringify({
            ok: true,
            clips: insertedClips,
            totalInserted: insertedClips.length,
            insertAt: insertedClips.length ? insertedClips[0].insertAt : currentPosition,
            lastInsertEnd: lastInsertEnd,
            mode: insertMode,
            streamMode: streamMode
        });
    } catch (e) {
        return JSON.stringify({ ok: false, error: String(e && e.message || e) });
    }
}
