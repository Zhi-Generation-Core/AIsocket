#!/usr/bin/env python3
"""Build compact browser assets from the original OpenLimbTT and SocketSense files."""

import json
import pickle
import struct
from pathlib import Path

import numpy as np
from scipy.io import loadmat


ROOT = Path(__file__).resolve().parents[1]
OPENLIMB = ROOT / "app" / "assets" / "openlimbtt-2025-07"
SOCKETSENSE = ROOT / "app" / "assets" / "socketsense"
OUTPUT = ROOT / "app" / "assets" / "reference-data"
SECTIONS = 36
ANGLES = 32
MODES = 16
MODE_RANGES = [
    [-17.04, 24.25], [-10.38, 16.42], [-8.41, 10.04], [-6.42, 11.66],
    [-4.73, 5.21], [-4 / 3, 4.38], [-4.01, 4.01], [-2.55, 2.68],
    [-2.26, 2.5], [-1.97, 2.49], [-1.54, 2.2], [-0.96, 2.48],
    [-1.46, 2.49], [-0.96, 1.66], [-1.12, 1.65], [-0.95, 1.14],
]


def read_binary_stl(path):
    data = path.read_bytes()
    triangle_count = struct.unpack_from("<I", data, 80)[0]
    vertices = np.empty((triangle_count * 3, 3), dtype=np.float32)
    for index in range(triangle_count):
        values = struct.unpack_from("<12fH", data, 84 + index * 50)
        vertices[index * 3:(index + 1) * 3] = np.asarray(values[3:12], dtype=np.float32).reshape(3, 3)
    return vertices


def radial_grid(vertices, fallback=None):
    z = vertices[:, 2]
    radius = np.hypot(vertices[:, 0], vertices[:, 1])
    theta = np.mod(np.arctan2(vertices[:, 1], vertices[:, 0]), np.pi * 2)
    z_min, z_max = float(z.min()), float(z.max())
    section = np.clip(((z - z_min) / max(1e-9, z_max - z_min) * (SECTIONS - 1)).round().astype(int), 0, SECTIONS - 1)
    angle = np.clip((theta / (np.pi * 2) * ANGLES).astype(int), 0, ANGLES - 1)
    grid = np.full((SECTIONS, ANGLES), np.nan, dtype=np.float32)
    for s, a, r in zip(section, angle, radius):
        if np.isnan(grid[s, a]) or r > grid[s, a]:
            grid[s, a] = r
    if fallback is not None:
        grid[np.isnan(grid)] = fallback[np.isnan(grid)]
    for _ in range(4):
        for s in range(SECTIONS):
            row = grid[s]
            missing = np.isnan(row)
            if missing.any():
                row[missing] = np.nanmean(np.stack([np.roll(row, 1), np.roll(row, -1)]), axis=0)[missing]
        for s in range(SECTIONS):
            if np.isnan(grid[s]).any():
                previous = grid[max(0, s - 1)]
                following = grid[min(SECTIONS - 1, s + 1)]
                grid[s] = np.where(np.isnan(grid[s]), np.nanmean(np.stack([previous, following]), axis=0), grid[s])
    return np.nan_to_num(grid, nan=float(np.nanmean(grid)))


def build_openlimb():
    mean_full = read_binary_stl(OPENLIMB / "Mean-Limb.stl")
    mean_skin = read_binary_stl(OPENLIMB / "Mean-Skin.stl")
    components = np.load(OPENLIMB / "Components16.npy").astype(np.float32).reshape(32, -1, 3)
    skin_count = len(mean_skin)
    mean_skin_grid = radial_grid(mean_skin)
    mean_bone_grid = radial_grid(mean_full[skin_count:], fallback=np.zeros_like(mean_skin_grid))
    mean_thickness = np.maximum(0, mean_skin_grid - mean_bone_grid)
    skin_modes = []
    thickness_modes = []
    for mode in range(MODES):
        changed = mean_full + components[mode]
        skin_grid = radial_grid(changed[:skin_count], fallback=mean_skin_grid)
        bone_grid = radial_grid(changed[skin_count:], fallback=mean_bone_grid)
        thickness = np.maximum(0, skin_grid - bone_grid)
        skin_modes.append(skin_grid - mean_skin_grid)
        thickness_modes.append(thickness - mean_thickness)

    with open(OPENLIMB / "LR.pkl", "rb") as handle:
        lr = pickle.load(handle)

    return {
        "schema": 1,
        "source": "OpenLimbTT version-2025-07",
        "sourceUrl": "https://github.com/abel-research/OpenLimbTT",
        "license": "CC-BY-SA-4.0",
        "basis": "Mean-Limb.stl + first 16 modes of Components16.npy",
        "sections": SECTIONS,
        "angles": ANGLES,
        "modeCount": MODES,
        "modeRanges": MODE_RANGES,
        "meanSkin": rounded(mean_skin_grid),
        "skinModes": rounded(np.asarray(skin_modes)),
        "meanThickness": rounded(mean_thickness),
        "thicknessModes": rounded(np.asarray(thickness_modes)),
        "linearRegressionMetadata": {
            "inputFeatures": int(lr.n_features_in_),
            "outputFeatures": int(np.asarray(lr.coef_).shape[0]),
            "intercept": float(lr.intercept_),
            "note": "LR.pkl retained as provenance; browser registration directly fits the full PCA skin basis.",
        },
    }


def sensor_stats(values):
    array = np.asarray(values, dtype=float)
    return {
        "mean": round(float(np.nanmean(array)), 3),
        "p95": round(float(np.nanpercentile(array, 95)), 3),
        "max": round(float(np.nanmax(array)), 3),
    }


def build_socketsense():
    pressure = loadmat(SOCKETSENSE / "Subject001_PilotStudy_PressureOnly.mat", simplify_cells=True)["dataQTSS_export"]
    combined = loadmat(SOCKETSENSE / "Subject001_PilotStudy_Shear+Pressure.mat", simplify_cells=True)["dataQTSS_export"]
    tasks = {}
    for task_name, task in pressure.items():
        if not isinstance(task, dict):
            continue
        locations = {}
        for location, values in task.items():
            if not isinstance(values, dict) or location in {"time", "gaitState"}:
                continue
            locations[location] = {sensel: sensor_stats(series) for sensel, series in values.items()}
        tasks[task_name] = locations

    shear_runs = {}
    for task_name, task in combined.items():
        if not isinstance(task, dict):
            continue
        shear_runs[task_name] = {
            "pressure": {
                location: {sensel: sensor_stats(series) for sensel, series in values.items()}
                for location, values in task.items()
                if isinstance(values, dict) and location != "Shear"
            },
            "shearMicroSiemens": {
                channel: sensor_stats(series) for channel, series in task.get("Shear", {}).items()
            },
        }

    return {
        "schema": 1,
        "source": "SocketSense Ossur DS01 Pilot Study",
        "sourceRecords": [
            "https://zenodo.org/records/7624740",
            "https://zenodo.org/records/7624975",
        ],
        "templateReference": "https://zenodo.org/records/7625218",
        "samplingHz": 20,
        "pressureUnit": "kPa",
        "shearUnit": "microSiemens",
        "pressureTasks": tasks,
        "pressureShearRuns": shear_runs,
        "topology": {
            "Medial": {"theta": 0.75},
            "MedialPosterior": {"theta": 0.625},
            "Posterior": {"theta": 0.5},
            "Lateral": {"theta": 0.25},
            "Anterior": {"theta": 0.0},
        },
        "senselAxialPosition": {
            "p1": 0.96, "p2": 0.84, "p3": 0.72, "p4": 0.60,
            "p5": 0.48, "p6": 0.36, "p7": 0.24, "p8": 0.12,
        },
        "limitations": "Pilot sensor records are transfemoral; this app transfers only normalized strip topology and measured load statistics to transtibial coordinates.",
    }


def rounded(array):
    return np.round(array.astype(float), 6).tolist()


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "openlimbtt-pca.json").write_text(json.dumps(build_openlimb(), separators=(",", ":")), encoding="utf-8")
    (OUTPUT / "socketsense-pilot.json").write_text(json.dumps(build_socketsense(), separators=(",", ":")), encoding="utf-8")
    for file in OUTPUT.iterdir():
        print(file.name, file.stat().st_size)


if __name__ == "__main__":
    main()
