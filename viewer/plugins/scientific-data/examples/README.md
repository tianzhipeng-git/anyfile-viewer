# Scientific Data Container Examples

All sample files in this directory are original synthetic datasets generated specifically for Anyfile Viewer using standard libraries (`h5wasm` / `libhdf5` and `scipy.io`), licensed under Apache-2.0.

| File | Format | Contents |
|---|---|---|
| `climate.h5` | HDF5 | Nested groups (`/sensors`, `/grid`), 3D gzip-chunked `float32` `temperature` (`2×8×10`), 2D `float64` `elevation` (`12×16`), 1D `int32` `station_ids`, root/group/dataset attributes |
| `ocean-v4.nc4` | NetCDF-4 (HDF5) | CF-1.8 global attributes and 2D `float32` `sst` (`6×8`) dataset |
| `ocean-grid.nc` | NetCDF Classic (CDF-1) | Unlimited `time` record dimension (`3`), fixed `lat` (`4`) and `lon` (`5`) coordinates, 3D `temp` (`3×4×5`) record variable |
| `experiment.mat` | MATLAB Level 5 (compressed) | 2D `float64` `signal`, 3D `float32` `volume`, `char` `label`, `complex128` `phasor`, nested `struct` `meta`, and CSC `sparse` `weights` |
| `disguised-text.h5` | Negative sample | Plain ASCII text with `.h5` extension; must be rejected by `probe()` |
