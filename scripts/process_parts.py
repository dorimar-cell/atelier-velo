from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(r"D:\developmentProjects\velo-assemble")
SRC = ROOT / "aurumbikes_images"
OUT = ROOT / "public" / "parts"
CANVAS = (2048, 1366)
MIN_AREA = 1500
PAD = 8

TYPES = [
    {
        "id": "frame",
        "kicker": "01 — Основа",
        "title": "Рама",
        "lede": "Выберите раму. Она прилетит на место фиксации — с этого силуэта начинается сборка.",
    },
    {
        "id": "wheels",
        "kicker": "02 — Опора",
        "title": "Колёса",
        "lede": "Переднее и заднее колесо вылетают по отдельности и садятся в дропауты.",
    },
    {
        "id": "handlebar",
        "kicker": "03 — Управление",
        "title": "Руль",
        "lede": "Вынос и дропы фиксируются на рулевой колонке.",
    },
    {
        "id": "saddle",
        "kicker": "04 — Посадка",
        "title": "Седло",
        "lede": "Подседельный штырь и седло входят в верх трубы рамы.",
    },
    {
        "id": "groupset",
        "kicker": "05 — Привод",
        "title": "Групсет",
        "lede": "Шатуны с цепью и переключатель — отдельно от манетки. Каждая деталь на своё место.",
    },
    {
        "id": "cassette",
        "kicker": "06 — Кассета",
        "title": "Кассета",
        "lede": "Звёзды садятся на заднюю втулку.",
    },
    {
        "id": "brakes",
        "kicker": "07 — Тормоза",
        "title": "Тормоза",
        "lede": "Диски и калиперы разлетаются на переднюю и заднюю оси.",
    },
    {
        "id": "bottles",
        "kicker": "08 — Аксессуары",
        "title": "Флягодержатели",
        "lede": "Держатели встают на бобышки рамы.",
    },
]

SOURCES = [
    {
        "file": "AURUM-ARTIK-WHITE-EXTERIOR.png",
        "option": "artik-white",
        "type": "frame",
        "name": "Artik White",
        "split": False,
        "role": "frame",
        "z": 20,
    },
    {
        "file": "AURUM-ARTIK-WHITE-INTERIOR.png",
        "option": "artik-white",
        "type": "frame",
        "name": "Artik White",
        "split": False,
        "role": "interior",
        "z": 21,
    },
    {
        "file": "AURUM-GRIS-VELETA-EXTERIOR.png",
        "option": "gris-veleta",
        "type": "frame",
        "name": "Gris Veleta",
        "split": False,
        "role": "frame",
        "z": 20,
    },
    {
        "file": "AURUM-GRIS-VELETA-INTERIOR.png",
        "option": "gris-veleta",
        "type": "frame",
        "name": "Gris Veleta",
        "split": False,
        "role": "interior",
        "z": 21,
    },
    {
        "file": "CUADRO-ASTRUR-CON-PATILLA-AURUM.png",
        "option": "astur",
        "type": "frame",
        "name": "Astur",
        "split": False,
        "role": "frame",
        "z": 20,
    },
    {
        "file": "MANTO_int_col_astur.png",
        "option": "astur",
        "type": "frame",
        "name": "Astur",
        "split": False,
        "role": "interior",
        "z": 21,
    },
    {
        "file": "Scope-Artech-4G-manto.png",
        "option": "scope-artech",
        "type": "wheels",
        "name": "Scope Artech 4G",
        "split": "left-right",
        "roles": ["rear", "front"],
        "zs": [8, 9],
    },
    {
        "file": "Scope-R-Series-R-4G-manto.png",
        "option": "scope-r4g",
        "type": "wheels",
        "name": "Scope R-Series 4G",
        "split": "left-right",
        "roles": ["rear", "front"],
        "zs": [8, 9],
    },
    {
        "file": "MANTO-303-XPLR-SW.png",
        "option": "zipp-303",
        "type": "wheels",
        "name": "Zipp 303 XPLR SW",
        "split": "left-right",
        "roles": ["rear", "front"],
        "zs": [8, 9],
    },
    {
        "file": "MANTO_handlebar.png",
        "option": "manto-bar",
        "type": "handlebar",
        "name": "Manto carbon",
        "split": False,
        "role": "handlebar",
        "z": 40,
    },
    {
        "file": "MANTO_nack_seat.png",
        "option": "nack-seat",
        "type": "saddle",
        "name": "Nack",
        "split": False,
        "role": "saddle",
        "z": 35,
    },
    {
        "file": "GRUPO-SRAM-RED-XPLR-MANTO.png",
        "option": "sram-red",
        "type": "groupset",
        "name": "SRAM RED XPLR",
        "split": "low-high",
        "roles": ["drivetrain", "shifter"],
        "zs": [30, 41],
    },
    {
        "file": "force-XPLR-2025-gravel.png",
        "option": "sram-force",
        "type": "groupset",
        "name": "SRAM Force XPLR",
        "split": "low-high",
        "roles": ["drivetrain", "shifter"],
        "zs": [30, 41],
    },
    {
        "file": "MANTO-25-SRAM-RIVAL.png",
        "option": "sram-rival",
        "type": "groupset",
        "name": "SRAM Rival",
        "split": "low-high",
        "roles": ["drivetrain", "shifter"],
        "zs": [30, 41],
    },
    {
        "file": "GRUPO-CAMPAGNOLO-1X13-MANTO.png",
        "option": "campagnolo",
        "type": "groupset",
        "name": "Campagnolo 1×13",
        "split": "low-high",
        "roles": ["drivetrain", "shifter"],
        "zs": [30, 41],
    },
    {
        "file": "MANTO_group_shimano_grx.png",
        "option": "shimano-grx",
        "type": "groupset",
        "name": "Shimano GRX",
        "split": "low-high",
        "roles": ["drivetrain", "shifter"],
        "zs": [30, 41],
    },
    {
        "file": "CASSETE-XPLR2025.png",
        "option": "cass-xplr",
        "type": "cassette",
        "name": "SRAM XPLR",
        "split": False,
        "role": "cassette",
        "z": 22,
    },
    {
        "file": "MANTO_cassette_sram_red_xpl.png",
        "option": "cass-red",
        "type": "cassette",
        "name": "SRAM RED XPLR",
        "split": False,
        "role": "cassette",
        "z": 22,
    },
    {
        "file": "cassette-CAMPAGNOLO-1X13-MANTO.png",
        "option": "cass-campa",
        "type": "cassette",
        "name": "Campagnolo 1×13",
        "split": False,
        "role": "cassette",
        "z": 22,
    },
    {
        "file": "MANTO_cassette_shimano_grx.png",
        "option": "cass-grx",
        "type": "cassette",
        "name": "Shimano GRX",
        "split": False,
        "role": "cassette",
        "z": 22,
    },
    {
        "file": "DISCOS-FORCE.png",
        "option": "brake-force",
        "type": "brakes",
        "name": "SRAM Force",
        "split": "left-right",
        "roles": ["rear", "front"],
        "zs": [16, 17],
    },
    {
        "file": "DISCOS-XPLR2025.png",
        "option": "brake-xplr",
        "type": "brakes",
        "name": "SRAM XPLR",
        "split": "left-right",
        "roles": ["rear", "front"],
        "zs": [16, 17],
    },
    {
        "file": "FRENOS-DISCO-CAMPAGNOLO-1X13-MANTO.png",
        "option": "brake-campa",
        "type": "brakes",
        "name": "Campagnolo",
        "split": "left-right",
        "roles": ["rear", "front"],
        "zs": [16, 17],
    },
    {
        "file": "MANTO_brake_disc_shimano.png",
        "option": "brake-shimano",
        "type": "brakes",
        "name": "Shimano",
        "split": "left-right",
        "roles": ["rear", "front"],
        "zs": [16, 17],
    },
    {
        "file": "MANTO_brakes_sram_red_xpl.png",
        "option": "brake-red",
        "type": "brakes",
        "name": "SRAM RED XPLR",
        "split": "left-right",
        "roles": ["rear", "front"],
        "zs": [16, 17],
    },
    {
        "file": "MANTO_both_bottle_holder.png",
        "option": "bottles-two",
        "type": "bottles",
        "name": "Два держателя",
        "split": "left-right",
        "roles": ["seat", "down"],
        "zs": [25, 26],
    },
    {
        "file": "MANTO_right_bottle_holder.png",
        "option": "bottles-one",
        "type": "bottles",
        "name": "Один держатель",
        "split": False,
        "role": "down",
        "z": 26,
    },
    {
        "file": "MANTO_shadow.png",
        "option": "shadow",
        "type": "shadow",
        "name": "Тень",
        "split": False,
        "role": "shadow",
        "z": 1,
        "alpha_min": 1,
    },
]


def clean_rgb(arr):
    out = arr.copy()
    out[out[..., 3] == 0, :3] = 0
    return out


def bbox_from_mask(mask, pad=PAD):
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    x0 = max(int(xs.min()) - pad, 0)
    y0 = max(int(ys.min()) - pad, 0)
    x1 = min(int(xs.max()) + 1 + pad, mask.shape[1])
    y1 = min(int(ys.max()) + 1 + pad, mask.shape[0])
    return [x0, y0, x1 - x0, y1 - y0]


def crop_masked(arr, mask):
    box = bbox_from_mask(mask)
    if box is None:
        return None, None
    x, y, w, h = box
    piece = arr[y : y + h, x : x + w].copy()
    local = mask[y : y + h, x : x + w]
    piece[..., 3] = np.where(local, piece[..., 3], 0)
    piece = clean_rgb(piece)
    return piece, box


def crop_alpha(arr, alpha_min):
    mask = arr[..., 3] >= alpha_min
    box = bbox_from_mask(mask)
    if box is None:
        return None, None
    x, y, w, h = box
    piece = clean_rgb(arr[y : y + h, x : x + w].copy())
    return piece, box


def large_components(arr, alpha_min=16):
    mask = arr[..., 3] >= alpha_min
    labeled, n = ndimage.label(mask)
    if n == 0:
        return []
    sizes = ndimage.sum(mask, labeled, range(1, n + 1))
    objects = ndimage.find_objects(labeled)
    comps = []
    for i, sl in enumerate(objects):
        area = int(sizes[i])
        if area < MIN_AREA:
            continue
        comp_mask = labeled == (i + 1)
        cy = (sl[0].start + sl[0].stop) / 2
        cx = (sl[1].start + sl[1].stop) / 2
        comps.append({"mask": comp_mask, "area": area, "cx": cx, "cy": cy})
    return comps


def save_png(arr, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr, "RGBA").save(path, optimize=True)


def sort_left_right(comps):
    return sorted(comps, key=lambda c: c["cx"])


def sort_low_high(comps):
    return sorted(comps, key=lambda c: -c["cy"])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()

    options = {}
    layers_out = []

    for spec in SOURCES:
        arr = clean_rgb(np.array(Image.open(SRC / spec["file"]).convert("RGBA")))
        alpha_min = spec.get("alpha_min", 16)
        option = options.setdefault(
            spec["option"],
            {
                "id": spec["option"],
                "type": spec["type"],
                "name": spec["name"],
                "layers": [],
                "thumb": None,
            },
        )

        extracted = []
        if spec["split"]:
            comps = large_components(arr, alpha_min)
            if spec["split"] == "left-right":
                comps = sort_left_right(comps)
            elif spec["split"] == "low-high":
                comps = sort_low_high(comps)
            roles = spec["roles"]
            zs = spec["zs"]
            if len(comps) < len(roles):
                raise RuntimeError(f"{spec['file']}: expected {len(roles)} objects, got {len(comps)}")
            for comp, role, z in zip(comps, roles, zs):
                piece, box = crop_masked(arr, comp["mask"])
                extracted.append((role, z, piece, box))
        else:
            piece, box = crop_alpha(arr, alpha_min)
            extracted.append((spec["role"], spec["z"], piece, box))

        for role, z, piece, box in extracted:
            filename = f"{spec['option']}-{role}.png"
            save_png(piece, OUT / filename)
            layer = {
                "id": f"{spec['option']}-{role}",
                "src": f"/parts/{filename}",
                "role": role,
                "z": z,
                "bbox": box,
            }
            option["layers"].append(layer)
            layers_out.append({**layer, "source": spec["file"], "option": spec["option"]})
            print(f"{filename:40} {piece.shape[1]}x{piece.shape[0]}  bbox={box}  from {spec['file']}")

        if spec["type"] != "shadow" and option["thumb"] is None:
            boxes = [item[3] for item in extracted]
            x0 = min(b[0] for b in boxes)
            y0 = min(b[1] for b in boxes)
            x1 = max(b[0] + b[2] for b in boxes)
            y1 = max(b[1] + b[3] for b in boxes)
            thumb = clean_rgb(arr[y0:y1, x0:x1].copy())
            thumb_name = f"{spec['option']}-thumb.png"
            save_png(thumb, OUT / thumb_name)
            option["thumb"] = f"/parts/{thumb_name}"

    catalog = {
        "canvas": list(CANVAS),
        "types": TYPES,
        "options": [options[key] for key in dict.fromkeys(spec["option"] for spec in SOURCES if spec["type"] != "shadow")],
        "shadow": options["shadow"],
    }
    (OUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {len(catalog['options'])} options, {len(layers_out)} layers -> {OUT}")


if __name__ == "__main__":
    main()
