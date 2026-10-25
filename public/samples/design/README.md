# Photoshop PSB sample

[![Open in Anyfile](https://www.anyfile.top/brand/open-in-anyfile.svg)](https://www.anyfile.top/en/view#file=https%3A%2F%2Fwww.anyfile.top%2Fsamples%2Fdesign%2Fcolor-study.psb)

Preview the saved composite image in your browser without installing Photoshop.
This is read-only viewing. [Supported PSB files and limits](https://www.anyfile.top/en/formats/psb).

`color-study.psb` is an original 512×320, 8-bit RGB color study generated from
mathematical gradients and five color bars by this project. It contains no
third-party artwork. It is distributed under the repository's Apache-2.0
license, included in [LICENSE](LICENSE).

Regenerate it from the repository root with Node.js 24 and installed project
dependencies:

```sh
node scripts/generate-psb-sample.mjs
```

The generator uses the existing `ag-psd` dependency to write a PSB version 2
file smaller than 1 MiB. The sample contains a saved composite image; the writer
also adds one empty layer record. It demonstrates composite-image viewing, not layer editing, layer
visibility controls or full Photoshop document compatibility.
