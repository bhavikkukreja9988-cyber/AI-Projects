V6.0.1 — two real bugs fixed, both root-caused with certainty

BUG 1: "Premiere insertion failed: vOrder.indexOf is not a function"

ExtendScript does not provide Array.prototype.indexOf. The Stack-mode track-search logic was rewritten using plain comparisons instead, with the same behavior. The jsx/index.js file was swept for other ES5+ Array/Object methods that are unavailable in ExtendScript; none were found elsewhere.

The actual function was tested in a restricted JavaScript context with Array.prototype limited to methods supported by ExtendScript, including the real-world Auto track selection scenario.

BUG 2: Downloaded filename doesn't match the YouTube title

The yt-dlp --restrict-filenames flag was removed. yt-dlp's default filename sanitization still handles Windows-illegal characters without forcing titles into ASCII-only names. The existing "VIDEOID - Title" naming pattern remains unchanged.

WHAT WAS NOT TOUCHED

Everything else — UI structure from V6.0.0, download/history/codec logic, and the playhead diagnostics added in V6.0.0. The diff against V6.0.0 confirms these are the only two changes.

WHAT TO TEST

1. Download & Add Selection into the timeline. It should no longer throw the vOrder error.
2. Download a video with spaces, accents, or non-English characters in its title and confirm the Project panel name is much closer to the real title.
