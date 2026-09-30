#!/usr/bin/env python3
"""Generate the deterministic LoopLabs Product Hunt launch pack."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "launch" / "producthunt"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1270, 760
PAPER = "#f5f5f4"
PANEL = "#fafaf9"
INK = "#1c1917"
BODY = "#57534e"
MUTED = "#78716c"
LINE = "#d6d3d1"
ACCENT = "#918775"
GREEN = "#697650"
RUST = "#a26d3d"
RED = "#a55845"
SANS = "/System/Library/Fonts/SFNS.ttf"
MONO = "/System/Library/Fonts/SFNSMono.ttf"


def font(size, mono=False):
    return ImageFont.truetype(MONO if mono else SANS, size)


def canvas():
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    for y in range(18, H, 18):
        for x in range(18, W, 18):
            d.ellipse((x, y, x + 1, y + 1), fill="#dddcd8")
    d.rectangle((24, 24, W - 24, H - 24), fill=PAPER, outline=LINE, width=1)
    return im, d


def loop_mark(d, x, y, size=34, color=ACCENT):
    pts = [(x + size/2, y), (x + size, y + size*.27), (x + size, y + size*.75),
           (x + size/2, y + size), (x, y + size*.75), (x, y + size*.27)]
    d.line(pts + [pts[0]], fill=color, width=max(2, size//20), joint="curve")
    inner = [(x + size/2, y + size*.18), (x + size*.78, y + size*.34),
             (x + size*.78, y + size*.65), (x + size/2, y + size*.82),
             (x + size*.22, y + size*.65), (x + size*.22, y + size*.34)]
    d.line(inner + [inner[0]], fill=color, width=max(2, size//24), joint="curve")
    d.line((x, y + size*.27, x + size/2, y + size*.52, x + size, y + size*.27), fill=color, width=2)
    d.line((x + size/2, y + size*.52, x + size/2, y + size), fill=color, width=2)
    d.ellipse((x + size*.44, y + size*.46, x + size*.56, y + size*.58), fill=color)


def brand(d, x=60, y=54):
    loop_mark(d, x, y, 32)
    d.text((x + 45, y + 1), "LoopLabs", font=font(28), fill=INK)


def eyebrow(d, text, x, y, color=MUTED):
    d.text((x, y), text.upper(), font=font(13, True), fill=color)


def wrap(d, text, fnt, max_width):
    lines, current = [], ""
    for word in text.split():
        trial = f"{current} {word}".strip()
        if d.textbbox((0, 0), trial, font=fnt)[2] <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def paragraph(d, text, x, y, max_width, size=20, color=BODY, leading=1.35):
    fnt = font(size)
    for i, line in enumerate(wrap(d, text, fnt, max_width)):
        d.text((x, y + i * int(size * leading)), line, font=fnt, fill=color)


def title(d, text, x, y, size=58, max_width=700, color=INK):
    fnt = font(size)
    lines = wrap(d, text, fnt, max_width)
    for i, line in enumerate(lines):
        d.text((x, y + i * int(size * 1.02)), line, font=fnt, fill=color, stroke_width=0)
    return y + len(lines) * int(size * 1.02)


def footer(d, index, label):
    d.line((60, 692, W - 60, 692), fill=LINE, width=1)
    eyebrow(d, f"0{index} / {label}", 60, 710)
    d.text((W - 278, 707), "looplabs.run", font=font(15, True), fill=MUTED)


def card(d, box, label, heading, body, accent=ACCENT):
    x1, y1, x2, y2 = box
    d.rectangle(box, fill=PANEL, outline=LINE, width=1)
    d.rectangle((x1, y1, x1 + 6, y2), fill=accent)
    eyebrow(d, label, x1 + 28, y1 + 26)
    d.text((x1 + 28, y1 + 67), heading, font=font(28), fill=INK)
    paragraph(d, body, x1 + 28, y1 + 112, x2 - x1 - 56, 16)


def save(im, name):
    path = OUT / name
    im.save(path, optimize=True)
    return path


def slide_1():
    im, d = canvas(); brand(d)
    eyebrow(d, "Agent automation + control plane", 60, 145)
    y = title(d, "Agents move fast. Production mistakes move faster.", 60, 180, 58, 635)
    paragraph(d, "LoopLabs automates the workflow and checks every action, execution, and output before it reaches production.", 60, y + 24, 600, 21)
    x0, x1, gate, x2 = 748, 846, 973, 1118
    for i, yy in enumerate([235, 300, 365, 430, 495]):
        d.line((x0, yy, gate - 25, yy + [-16, 10, -11, 17, -7][i]), fill="#bdb7ae", width=2)
        d.ellipse((x0-7, yy-7, x0+7, yy+7), fill=RUST if i != 3 else RED)
        if i != 3:
            d.line((gate + 25, yy, x2, yy), fill="#aeb49a", width=2)
            d.ellipse((x2-6, yy-6, x2+6, yy+6), fill=GREEN)
    d.rectangle((gate-42, 190, gate+42, 540), fill="#eeeee9", outline="#b8b3a9", width=2)
    loop_mark(d, gate-21, 337, 42, GREEN)
    eyebrow(d, "Control boundary", gate-67, 565)
    d.rounded_rectangle((x0-42, 545, x0+95, 579), 17, fill="#f2e8e2", outline="#bf8f7d")
    d.text((x0-19, 555), "1 ACTION HELD", font=font(11, True), fill=RED)
    footer(d, 1, "THE PROBLEM")
    return im


def slide_2():
    im, d = canvas(); brand(d)
    eyebrow(d, "Workflow automation", 60, 145)
    title(d, "Start with work your team already does.", 60, 180, 56, 650)
    paragraph(d, "No agents yet? We map a frequent process with you, then add the agents, systems, approvals, and recovery steps it needs.", 60, 325, 590, 20)
    steps = [("01", "Capture", "Invoice arrives"), ("02", "Validate", "Vendor + amount"), ("03", "Control", "Policy check"), ("04", "Approve", "Exception only"), ("05", "Post", "Reviewed entry")]
    sx, sy, cw, gap = 60, 495, 207, 18
    for i, (n, h, b) in enumerate(steps):
        x = sx + i * (cw + gap)
        d.rectangle((x, sy, x+cw, sy+135), fill=PANEL, outline=LINE)
        eyebrow(d, n, x+18, sy+16)
        d.text((x+18, sy+52), h, font=font(24), fill=INK)
        d.text((x+18, sy+91), b, font=font(14), fill=MUTED)
        if i < len(steps)-1:
            d.line((x+cw, sy+67, x+cw+gap, sy+67), fill=ACCENT, width=2)
    footer(d, 2, "AUTOMATE")
    return im


def slide_3():
    im, d = canvas(); brand(d)
    eyebrow(d, "The production control layer", 60, 145)
    title(d, "One place to decide what agents may do.", 60, 180, 54, 690)
    paragraph(d, "Give every agent a role. Apply policy before work changes a real system. Keep the full run and result reviewable.", 60, 315, 640, 20)
    card(d, (60, 445, 421, 645), "ACTION CONTROLS", "Decide what may happen", "Permissions, limits, and approval rules check each proposed action.", RUST)
    card(d, (454, 445, 815, 645), "EXECUTION CONTROLS", "Supervise the full run", "Follow steps and handoffs. Pause, stop, or isolate work that leaves its bounds.", ACCENT)
    card(d, (848, 445, 1209, 645), "OUTPUT CONTROLS", "Inspect what leaves", "Redact sensitive data or block a result that breaks policy.", GREEN)
    footer(d, 3, "CONTROL")
    return im


def slide_4():
    im, d = canvas(); brand(d)
    eyebrow(d, "State recovery", 60, 145)
    title(d, "A blocked action is not enough after state changed.", 60, 180, 54, 720)
    paragraph(d, "LoopLabs isolates the agent, shows the affected record, and creates a reviewed recovery plan with version checks.", 60, 318, 680, 20)
    y = 500
    d.line((100, y, 1160, y), fill=LINE, width=3)
    events = [(150, "Proposed", "Net 30"), (430, "Changed", "Net 90"), (710, "Isolated", "Agent held"), (990, "Recovered", "Net 30 · v13")]
    colors = [ACCENT, RED, RUST, GREEN]
    for (x, h, b), c in zip(events, colors):
        d.ellipse((x-14, y-14, x+14, y+14), fill=PAPER, outline=c, width=4)
        d.text((x-50, y+35), h, font=font(24), fill=INK)
        d.text((x-50, y+73), b, font=font(15, True), fill=MUTED)
    d.rounded_rectangle((825, 408, 1165, 452), 5, fill="#e9ebe3", outline="#b7bea6")
    d.text((851, 421), "VERSION CHECK PASSED · RESTORE", font=font(13, True), fill=GREEN)
    footer(d, 4, "RECOVER")
    return im


def slide_5():
    im, d = canvas(); brand(d)
    eyebrow(d, "LoopLabs control plane", 60, 145)
    title(d, "See the decision behind every agent action.", 60, 180, 52, 650)
    # Product UI window
    bx = (60, 315, 1210, 650)
    d.rectangle(bx, fill="#edede8", outline="#b9b6af", width=2)
    d.rectangle((60, 315, 1210, 361), fill=PANEL, outline=LINE)
    loop_mark(d, 82, 326, 23)
    d.text((118, 328), "LoopLabs", font=font(17), fill=INK)
    d.text((980, 330), "EXECUTION  EX-1842", font=font(11, True), fill=MUTED)
    d.rectangle((82, 388, 340, 623), fill="#f7f7f5", outline=LINE)
    for i, text in enumerate(["Overview", "Agents", "Policies", "Approvals", "Runs", "Recovery"]):
        yy = 412 + i*33
        if text == "Approvals": d.rectangle((94, yy-5, 323, yy+24), fill="#e6e4de")
        d.text((111, yy), text, font=font(15), fill=INK if text == "Approvals" else MUTED)
    d.rectangle((367, 388, 1185, 623), fill=PANEL, outline=LINE)
    eyebrow(d, "PROPOSED ACTION", 395, 412)
    d.text((395, 452), "Send renewal email with a 25% discount", font=font(26), fill=INK)
    d.rounded_rectangle((952, 405, 1149, 442), 5, fill="#efe9de", outline="#ccb88f")
    d.text((986, 417), "NEEDS APPROVAL", font=font(11, True), fill="#8b7045")
    rows = [("Agent identity", "Verified", GREEN), ("Email tool", "Permitted", GREEN), ("Discount authority", "10% limit", RED)]
    for i, (k, v, c) in enumerate(rows):
        yy = 510 + i*38
        d.line((395, yy+25, 1148, yy+25), fill="#e7e5e4")
        d.text((395, yy), k, font=font(15), fill=BODY)
        d.text((1020, yy), v, font=font(14, True), fill=c)
    footer(d, 5, "REVIEW")
    return im


slides = [slide_1(), slide_2(), slide_3(), slide_4(), slide_5()]
for i, im in enumerate(slides, 1):
    save(im, f"gallery-{i:02d}.png")

# Square thumbnail: crisp at 240px but generated large for reuse.
thumb = Image.new("RGB", (1024, 1024), INK)
td = ImageDraw.Draw(thumb)
for y in range(0, 1024, 32):
    td.line((0, y, 1024, y), fill="#292524", width=1)
for x in range(0, 1024, 32):
    td.line((x, 0, x, 1024), fill="#292524", width=1)
loop_mark(td, 272, 170, 480, "#d6d0c4")
td.text((266, 742), "LoopLabs", font=font(92), fill="#fafaf9")
td.text((238, 860), "AGENT AUTOMATION + CONTROL", font=font(24, True), fill="#aaa294")
save(thumb, "thumbnail-1024.png")
thumb.resize((240, 240), Image.Resampling.LANCZOS).save(OUT / "thumbnail-240.png", optimize=True)

# One-page review board for sign-off. This is not uploaded to Product Hunt.
board = Image.new("RGB", (1500, 1480), "#e7e5e4")
bd = ImageDraw.Draw(board)
bd.text((55, 38), "LoopLabs · Product Hunt launch gallery", font=font(38), fill=INK)
bd.text((55, 92), "Sunday, October 4, 2026 · Draft prepared", font=font(18, True), fill=MUTED)
for i, im in enumerate(slides):
    preview = im.resize((650, 389), Image.Resampling.LANCZOS)
    x = 55 + (i % 2) * 715
    y = 145 + (i // 2) * 440
    board.paste(preview, (x, y))
    bd.text((x, y + 400), f"{i + 1:02d}", font=font(15, True), fill=MUTED)
thumb_preview = thumb.resize((389, 389), Image.Resampling.LANCZOS)
board.paste(thumb_preview, (770, 1025))
board.save(OUT / "review-board.png", optimize=True)

# Build a 1080p kinetic launch reel from the deterministic gallery artwork.
video = OUT / "looplabs-producthunt-1080p.mp4"
cmd = [
    "ffmpeg", "-y", "-loglevel", "error",
    "-framerate", "1/4", "-i", str(OUT / "gallery-%02d.png"),
    "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,"
          "zoompan=z='min(zoom+0.00045,1.035)':d=120:s=1920x1080:fps=30,"
          "fade=t=in:st=0:d=0.35,fade=t=out:st=19.3:d=0.6",
    "-t", "20", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(video)
]
subprocess.run(cmd, check=True)
print(f"Generated launch assets in {OUT}")
