# NumPy array viewer (`dev-array-viewer`)

The plugin parses NPY 1.0–3.0 headers and pages numeric, boolean, fixed-width string, Unicode, complex, datetime/timedelta, and structured arrays with bounded `File.slice()` reads. C- and Fortran-order arrays share the same physical page reader and expose logical coordinates.

NPZ files are indexed from the ZIP central directory. Stored entries use direct range reads; DEFLATE entries are streamed only as far as the selected header or page. Object dtype is inspection-only and embedded Pickle content is never deserialized.

Safety limits include a 1 MiB NPY header, 32 dimensions, 10,000 NPZ entries, a 32 MiB ZIP directory, 2 GiB per selected array, and a 1000:1 compressed-entry ratio.
