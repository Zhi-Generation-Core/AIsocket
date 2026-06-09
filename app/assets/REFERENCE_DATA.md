# Reference data provenance

## OpenLimbTT

- Source: https://github.com/abel-research/OpenLimbTT
- Version: `version-2025-07`
- Files used: `Components16.npy`, `LR.pkl`, `Mean-Limb.stl`, `Mean-Skin.stl`, `Mean-Bones-Full-Size.stl`
- Data license: CC BY-SA 4.0
- Modification: the build script samples the mean model and first 16 full-anatomy PCA modes into compact radial skin and skin-to-bone thickness bases for browser registration.

OpenLimbTT attribution:

F.E. Sunderland et al. (2025), OpenLimbTT, a transtibial residual limb shape model for prosthetics simulation and design, Data-Centric Engineering, 6:e39.

## SocketSense

- Template reference: https://zenodo.org/records/7625218
- Pressure pilot data: https://zenodo.org/records/7624740
- Pressure and shear pilot data: https://zenodo.org/records/7624975
- Files used: the published MAT sensor records and socket-map images.
- Modification: pressure and shear time series are summarized by mean, 95th percentile, and maximum values for each published sensor strip and sensel.

The template record currently exposes no downloadable files through the Zenodo API. The pilot records are transfemoral, so the application transfers only normalized sensor-strip topology and measured load statistics onto transtibial coordinates. Shear values remain in the published `microSiemens` unit.
