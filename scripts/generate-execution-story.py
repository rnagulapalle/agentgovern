#!/usr/bin/env python3
"""Render the illustrative landing-page execution story as a silent WebM.

The video is deliberately generated from deterministic product states. It does
not represent connected customer telemetry or a production execution record.
"""

from __future__ import annotations

import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "landing" / "execution-integrity.webm"
POSTER = ROOT / "public" / "landing" / "execution-integrity-poster.png"

WIDTH = 2400
HEIGHT = 1120
FPS = 60
DURATION = 9.6

def available_font(*candidates: str) -> str:
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    raise SystemExit("Install SF Pro or DejaVu Sans before rendering the story")


FONT = available_font(
    "/System/Library/Fonts/SFNS.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
)
MONO = available_font(
    "/System/Library/Fonts/SFNSMono.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
)

INK = "#201f1c"
MUTED = "#77736c"
LINE = "#d6d2ca"
PAPER = "#f8f7f3"
PANEL = "#ffffff"
OLIVE = "#7f8b67"
GOLD = "#b28b55"
RUST = "#a4604d"
SOFT_OLIVE = "#e7eadf"
SOFT_GOLD = "#f2eadc"
SOFT_RUST = "#f2e2dc"


def font(size: int, mono: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(MONO if mono else FONT, size=size)


FONTS = {
    "label": font(22, True),
    "small": font(25),
    "body": font(30),
    "body_bold": font(30),
    "metric": font(52),
    "title": font(52),
    "step": font(25, True),
}


STEPS = [
    ("Proposed", "Vendor Ops agent requests a supplier bank-detail update.", "ACTION RECEIVED", OLIVE),
    ("Authority", "Identity, role, and delegated authority are verified.", "AUTHORITY VERIFIED", OLIVE),
    ("Policy hold", "Supplier banking policy requires a named approver.", "HELD BEFORE EFFECT", GOLD),
    ("Approved", "Maya Chen approves the reviewed request.", "APPROVAL ATTACHED", OLIVE),
    ("Execute", "ERP write sent once with action ID LL-2407-A1.", "WRITE IN FLIGHT", OLIVE),
    ("Uncertain", "The response is lost after the write. Retry is blocked.", "OUTCOME UNCERTAIN", RUST),
    ("Reconcile", "LoopLabs checks the ERP record and its current version.", "VERIFYING EFFECT", GOLD),
    ("Resolved", "The change already exists. No duplicate retry is issued.", "EFFECT VERIFIED", OLIVE),
]


def ease(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return 1 - (1 - value) ** 4


def rounded(draw: ImageDraw.ImageDraw, box, radius: int, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw: ImageDraw.ImageDraw, xy, value: str, key: str, fill=INK, anchor=None):
    draw.text(xy, value, font=FONTS[key], fill=fill, anchor=anchor)


def pill(draw: ImageDraw.ImageDraw, x: int, y: int, label: str, tone: str):
    fills = {OLIVE: SOFT_OLIVE, GOLD: SOFT_GOLD, RUST: SOFT_RUST}
    bbox = draw.textbbox((0, 0), label, font=FONTS["label"])
    width = bbox[2] - bbox[0] + 38
    rounded(draw, (x, y, x + width, y + 44), 3, fills[tone])
    draw.text((x + 19, y + 22), label, font=FONTS["label"], fill=tone, anchor="lm")


def frame_at(seconds: float) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    draw = ImageDraw.Draw(image)

    phase_float = seconds / (DURATION / len(STEPS))
    phase = min(len(STEPS) - 1, int(phase_float))
    phase_progress = ease(phase_float - math.floor(phase_float))
    title, description, state, tone = STEPS[phase]

    # Application frame and header.
    draw.rectangle((32, 28, WIDTH - 32, HEIGHT - 28), fill=PANEL, outline=LINE, width=2)
    draw.line((32, 116, WIDTH - 32, 116), fill=LINE, width=2)
    draw.rectangle((65, 62, 87, 84), outline=OLIVE, width=3)
    draw.line((65, 62, 87, 84), fill=OLIVE, width=2)
    draw.line((87, 62, 65, 84), fill=OLIVE, width=2)
    text(draw, (106, 74), "LoopLabs", "body", anchor="lm")
    text(draw, (1680, 74), "ILLUSTRATIVE WORKFLOW", "label", MUTED, "lm")
    text(draw, (2265, 74), "RUN LL-2407", "label", INK, "rm")

    # Intro copy.
    text(draw, (82, 164), "SUPPLIER ONBOARDING / ERP WRITE", "label", RUST)
    text(draw, (82, 211), "One action. Every decision attached.", "title")
    text(draw, (82, 276), "The control plane follows authority, approval, effect, and recovery across one run.", "body", MUTED)

    # Workflow rail.
    rail_left, rail_right, rail_y = 100, 1510, 396
    draw.line((rail_left, rail_y, rail_right, rail_y), fill=LINE, width=5)
    progress = (phase + phase_progress) / (len(STEPS) - 1)
    draw.line((rail_left, rail_y, rail_left + (rail_right - rail_left) * min(progress, 1), rail_y), fill=tone, width=7)
    gap = (rail_right - rail_left) / (len(STEPS) - 1)
    for index, (step_title, *_rest) in enumerate(STEPS):
        x = rail_left + gap * index
        complete = index < phase
        active = index == phase
        fill = OLIVE if complete else tone if active else PANEL
        outline = OLIVE if complete else tone if active else LINE
        radius = 17 if active else 13
        draw.ellipse((x - radius, rail_y - radius, x + radius, rail_y + radius), fill=fill, outline=outline, width=4)
        if complete:
            draw.line((x - 6, rail_y, x - 1, rail_y + 6), fill=PANEL, width=3)
            draw.line((x - 1, rail_y + 6, x + 8, rail_y - 7), fill=PANEL, width=3)
        text(draw, (x, rail_y + 38), step_title.upper(), "step", tone if active else MUTED, "ma")

    # Left action record.
    rounded(draw, (82, 478, 1570, 808), 6, "#fbfaf7", LINE, 2)
    text(draw, (116, 522), "ACTION RECORD", "label", MUTED)
    pill(draw, 1230, 500, state, tone)
    text(draw, (116, 585), description, "body_bold")
    rows = [
        ("Agent", "Vendor Ops agent"),
        ("Accountable owner", "Finance operations"),
        ("Policy", "Supplier banking · v3"),
        ("Action ID", "LL-2407-A1"),
    ]
    for index, (label, value) in enumerate(rows):
        y = 640 + index * 38
        text(draw, (116, y), label, "small", MUTED)
        text(draw, (520, y), value, "small", INK)

    # Right decision panel.
    rounded(draw, (1610, 350, 2318, 808), 6, PAPER, LINE, 2)
    text(draw, (1652, 398), "CURRENT DECISION", "label", MUTED)
    pulse = 1 + 0.08 * math.sin(seconds * math.tau * 1.6)
    pulse_radius = int(8 * pulse)
    draw.ellipse((1653 - pulse_radius, 458 - pulse_radius, 1653 + pulse_radius, 458 + pulse_radius), fill=tone)
    text(draw, (1680, 458), title, "metric", anchor="lm")
    wrap = {
        0: ["Action has not crossed", "the control boundary."],
        1: ["The agent can request", "this workflow step."],
        2: ["No external write until", "a named person approves."],
        3: ["Approval is bound to", "this policy and request."],
        4: ["Idempotency key prevents", "a duplicate effect."],
        5: ["Uncertainty contains the", "run before any retry."],
        6: ["Current ERP state is read", "before choosing recovery."],
        7: ["Observed effect is attached", "to the execution record."],
    }[phase]
    text(draw, (1652, 535), wrap[0], "body", MUTED)
    text(draw, (1652, 576), wrap[1], "body", MUTED)
    draw.line((1652, 630, 2276, 630), fill=LINE, width=2)
    details = [
        ("Execution state", "Contained" if phase in (2, 5, 6) else "Advancing" if phase < 7 else "Complete"),
        ("External effect", "Unknown" if phase in (5, 6) else "Verified" if phase == 7 else "None" if phase < 4 else "Pending"),
        ("Retry", "Blocked" if phase in (2, 5, 6) else "Not required" if phase == 7 else "Unavailable"),
    ]
    for index, (label, value) in enumerate(details):
        y = 674 + index * 45
        text(draw, (1652, y), label, "small", MUTED)
        text(draw, (2276, y), value, "small", INK, "ra")

    # Outcome bars. Independent scales keep low-volume outcomes legible.
    text(draw, (82, 864), "OUTCOMES / LAST 7 DAYS", "label", MUTED)
    values = [
        ("Verified", 0.71 + 0.16 * progress, "1,009" if phase < 7 else "1,010", OLIVE),
        ("Held", 0.48 + (0.12 if phase in (2, 3) else 0), "97", GOLD),
        ("Blocked", 0.29, "31", RUST),
        ("Uncertain", 0.18 + (0.38 if phase in (5, 6) else 0), "04" if phase < 7 else "03", INK),
    ]
    column_width = 548
    for index, (label, value, count, color) in enumerate(values):
        x = 82 + index * column_width
        text(draw, (x, 914), label, "small", MUTED)
        text(draw, (x + 485, 914), count, "small", INK, "ra")
        draw.rectangle((x, 952, x + 485, 974), fill="#ebe9e3")
        draw.rectangle((x, 952, x + int(485 * value), 974), fill=color)

    text(draw, (82, 1045), "SAMPLE DATA · PRODUCT TOUR · NO CONNECTED PRODUCTION SYSTEMS", "label", MUTED)
    text(draw, (2265, 1045), "CONTROL → EFFECT → RECOVERY", "label", INK, "ra")
    return image


def render() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frame_at(0).save(POSTER, optimize=True)
    command = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS), "-i", "-",
        "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "31",
        "-deadline", "good", "-cpu-used", "3", "-row-mt", "1",
        "-pix_fmt", "yuv420p", str(OUTPUT),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    try:
        for index in range(round(DURATION * FPS)):
            process.stdin.write(frame_at(index / FPS).tobytes())
    finally:
        process.stdin.close()
    if process.wait() != 0:
        raise SystemExit("ffmpeg failed")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} and {POSTER.relative_to(ROOT)}")


if __name__ == "__main__":
    render()
