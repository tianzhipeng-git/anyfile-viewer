# Three.js 0.185.1 FBX Worker patch

The bundled FBX parser uses `window.URL.createObjectURL` for binary embedded images,
although the standard `URL` API is available in dedicated Workers. Use `URL` directly
so parsing stays off the main thread without a window shim.

The loader also discards `sceneGraph.userData.unitScaleFactor` when collapsing a
single root group. Preserve that metadata so the adapter can convert centimeters
per source unit to meters without altering imported transforms or animation tracks.

Both changes are exercised by original binary/ASCII FBX room fixtures, including a
single group root, embedded image and centimeter units. Remove each hunk when a
locked upstream Three.js release includes the equivalent fix. Patched JS is bundled
in the local dynamic Worker, never served as original upstream code through jsDelivr.
