# NumPy fixtures

Run `node scripts/generate-examples.mjs` from this plugin directory to regenerate the committed NPY/NPZ fixtures. The files contain only deterministic synthetic values. `objects.npy` contains inert text after an object-dtype header and exists to verify that the viewer never invokes Pickle deserialization.
