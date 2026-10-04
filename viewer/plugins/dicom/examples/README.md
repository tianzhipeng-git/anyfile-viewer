# DICOM synthetic examples

Generated locally; no patient data or external image content. Rebuild with Node 24:

```sh
node viewer/plugins/dicom/examples/generate.mjs
```

- `synthetic-multiframe.dcm`: three signed 16-bit grayscale frames. Frame 2/3 shift the circular pattern left; window center 0, width 2400.
- `synthetic-rgb.dicom`: 128×128 RGB gradient. Red increases to the right, green downwards, blue decreases to the right.
- `synthetic-metadata-only.dcm`: unsupported palette photometric interpretation; must show an explicit metadata-only message.

These are minimal Part 10 test structures for the viewer, not complete clinical IOD conformance examples. Open files locally in the viewer, change frames/window settings, resize the window, rotate/zoom, switch files and return to confirm fresh state.
