#!/usr/bin/env python3
"""Generate CC0-1.0 real CHM (.chm) example fixtures for @anyfile/chm-reader."""

from __future__ import annotations

import os
import struct
import zlib
from pathlib import Path

EXAMPLES_DIR = Path(__file__).resolve().parent.parent / "examples"


def encint(value: int) -> bytes:
    out = bytearray([value & 0x7F])
    value >>= 7
    while value:
        out.append(0x80 | (value & 0x7F))
        value >>= 7
    out.reverse()
    return bytes(out)


def make_png(width: int, height: int, rgba: tuple[int, int, int, int]) -> bytes:
    raw = b"".join(b"\x00" + bytes(rgba) * width for _ in range(height))

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def make_bmp(width: int, height: int, bgr: tuple[int, int, int]) -> bytes:
    row_pad = (4 - (width * 3) % 4) % 4
    pixel_row = bytes(bgr) * width + b"\x00" * row_pad
    pixels = pixel_row * height
    dib = struct.pack("<IIIHHIIIIII", 40, width, height, 1, 24, 0, len(pixels), 2835, 2835, 0, 0)
    header = struct.pack("<2sIHHI", b"BM", 14 + len(dib) + len(pixels), 0, 0, 14 + len(dib))
    return header + dib + pixels


class LzxBitWriter:
    def __init__(self) -> None:
        self.words: list[int] = []
        self.buf = 0
        self.bits = 0

    def write_bits(self, value: int, count: int) -> None:
        for shift in range(count - 1, -1, -1):
            self.buf = (self.buf << 1) | ((value >> shift) & 1)
            self.bits += 1
            if self.bits == 16:
                self.words.append(self.buf & 0xFFFF)
                self.buf = 0
                self.bits = 0

    def align_16(self) -> None:
        if self.bits > 0:
            self.buf <<= 16 - self.bits
            self.words.append(self.buf & 0xFFFF)
            self.buf = 0
            self.bits = 0

    def write_raw_bytes(self, raw: bytes) -> None:
        self.align_16()
        for i in range(0, len(raw), 2):
            lo = raw[i]
            hi = raw[i + 1] if i + 1 < len(raw) else 0
            self.words.append(lo | (hi << 8))

    def finish(self) -> bytes:
        self.align_16()
        return b"".join(struct.pack("<H", w) for w in self.words)


def canonical_codes(lengths: list[int]) -> list[int]:
    max_len = max(lengths) if lengths else 0
    codes = [0] * len(lengths)
    code = 0
    for bits in range(1, max_len + 1):
        for sym, ln in enumerate(lengths):
            if ln == bits:
                codes[sym] = code
                code += 1
        code <<= 1
    return codes


def build_huffman_lengths(freqs: list[int], max_bits: int = 12) -> list[int]:
    # Kraft-valid bounded Huffman lengths via simple sorted split or fixed balanced lengths.
    active = [i for i, f in enumerate(freqs) if f > 0]
    lengths = [0] * len(freqs)
    if not active:
        return lengths
    if len(active) == 1:
        lengths[active[0]] = 1
        lengths[0 if active[0] != 0 else 1] = 1
        return lengths
    # Build Huffman tree with depth limiting fallback.
    import heapq
    heap: list[tuple[int, int, object]] = [(freqs[s], s, s) for s in active]
    heapq.heapify(heap)
    uid = len(freqs)
    while len(heap) > 1:
        f1, _, n1 = heapq.heappop(heap)
        f2, _, n2 = heapq.heappop(heap)
        heapq.heappush(heap, (f1 + f2, uid, (n1, n2)))
        uid += 1

    def walk(node: object, depth: int) -> None:
        if isinstance(node, int):
            lengths[node] = max(1, depth)
        else:
            left, right = node  # type: ignore[misc]
            walk(left, depth + 1)
            walk(right, depth + 1)

    walk(heap[0][2], 0)
    if max(lengths) > max_bits:
        # Fallback to flat Kraft-valid lengths for active symbols.
        bits = 1
        while (1 << bits) < len(active):
            bits += 1
        for s in active:
            lengths[s] = bits
    return lengths


def encode_lzx_verbatim_interval(raw: bytes, window_bits: int = 16) -> bytes:
    """Encode a <= 512 KiB LZX reset interval using valid LZX Verbatim block(s)."""
    posn_slots = {15: 30, 16: 32, 17: 34, 18: 36, 19: 38, 20: 42, 21: 50}[window_bits]
    main_size = 256 + posn_slots * 8
    writer = LzxBitWriter()
    # Intel E8 header disabled: 1 bit = 0.
    writer.write_bits(0, 1)

    # Simple LZ77 tokenizing with slot 3 (offset 1 -> position_base 3 - 2 = 1) or literals.
    tokens: list[tuple[str, int, int]] = []
    i = 0
    n = len(raw)
    while i < n:
        # Look for an immediate RLE repeat of length >= 4 (offset 1 -> slot 3, footer 3 => slot 3).
        run = 1
        if i > 0 and raw[i] == raw[i - 1]:
            while i + run < n and run < 257 and raw[i + run] == raw[i - 1] and ((i + run) // 32768 == i // 32768):
                run += 1
        if run >= 4:
            tokens.append(("match", run, 1))
            i += run
        else:
            tokens.append(("lit", raw[i], 0))
            i += 1

    main_freqs = [0] * main_size
    len_freqs = [0] * 249
    for kind, val, _ in tokens:
        if kind == "lit":
            main_freqs[val] += 1
        else:
            ml = val - 2
            slot_len = min(ml, 7)
            main_freqs[256 + (3 << 3) + slot_len] += 1
            if ml >= 7:
                len_freqs[ml - 7] += 1

    main_lens = build_huffman_lengths(main_freqs, 12)
    len_lens = build_huffman_lengths(len_freqs, 12)
    main_codes = canonical_codes(main_lens)
    len_codes = canonical_codes(len_lens)

    # Block header: block_type = 1 (verbatim, 3 bits), block_length = len(raw) (24 bits).
    writer.write_bits(1, 3)
    writer.write_bits(len(raw) >> 8, 16)
    writer.write_bits(len(raw) & 0xFF, 8)

    def write_lengths(lens: list[int], first: int, last: int) -> None:
        syms = [(17 - ln) % 17 for ln in lens[first:last]]
        pre_freqs = [0] * 20
        for s in syms:
            pre_freqs[s] += 1
        pre_lens = build_huffman_lengths(pre_freqs, 12)
        pre_codes = canonical_codes(pre_lens)
        for pl in pre_lens:
            writer.write_bits(pl, 4)
        for s in syms:
            writer.write_bits(pre_codes[s], pre_lens[s])

    write_lengths(main_lens, 0, 256)
    write_lengths(main_lens, 256, main_size)
    write_lengths(len_lens, 0, 249)

    for kind, val, _ in tokens:
        if kind == "lit":
            writer.write_bits(main_codes[val], main_lens[val])
        else:
            ml = val - 2
            slot_len = min(ml, 7)
            sym = 256 + (3 << 3) + slot_len
            writer.write_bits(main_codes[sym], main_lens[sym])
            if ml >= 7:
                ls = ml - 7
                writer.write_bits(len_codes[ls], len_lens[ls])

    return writer.finish()


def encode_lzx_uncompressed_interval(raw: bytes) -> bytes:
    """Encode using valid LZX Uncompressed block (blockType = 3)."""
    writer = LzxBitWriter()
    writer.write_bits(0, 1)  # no Intel E8
    writer.write_bits(3, 3)  # blockType = 3 (Uncompressed)
    writer.write_bits(len(raw) >> 8, 16)
    writer.write_bits(len(raw) & 0xFF, 8)
    writer.align_16()
    # R0 = R1 = R2 = 1
    writer.write_raw_bytes(struct.pack("<III", 1, 1, 1))
    writer.write_raw_bytes(raw)
    return writer.finish()


def build_chm(
    files: list[tuple[str, bytes, int]],
    *,
    title: str,
    default_topic: str,
    hhc_path: str,
    hhk_path: str,
    lcid: int = 0x0409,
    text_encoding: str = "utf-8",
    topics_meta: list[tuple[str, str]] | None = None,
    use_uncompressed_lzx: bool = False,
) -> bytes:
    """Build a valid ITSF v3 CHM archive containing Section 0 and LZX Section 1."""
    # Build Section 1 stream + metadata files.
    sec1_buf = bytearray()
    sec1_entries: list[tuple[str, int, int, int]] = []
    sec0_entries: list[tuple[str, bytes]] = []

    for path, data, section in files:
        if section == 1:
            offset = len(sec1_buf)
            sec1_buf.extend(data)
            sec1_entries.append((path, 1, offset, len(data)))
        else:
            sec0_entries.append((path, data))

    # Build #STRINGS, #URLSTR, #URLTBL, #TOPICS in Section 1 if topics_meta given.
    if topics_meta:
        strings_buf = bytearray(b"\x00")
        urlstr_buf = bytearray(b"\x00")
        urltbl_buf = bytearray()
        topics_buf = bytearray()
        for idx, (topic_title, topic_url) in enumerate(topics_meta):
            title_off = len(strings_buf)
            strings_buf.extend(topic_title.encode(text_encoding) + b"\x00")
            urlstr_off = len(urlstr_buf)
            urlstr_buf.extend(b"\x00" * 8 + topic_url.encode(text_encoding) + b"\x00")
            urltbl_off = len(urltbl_buf)
            urltbl_buf.extend(struct.pack("<III", 0, idx, urlstr_off))
            topics_buf.extend(struct.pack("<IIIHH", 0, title_off, urltbl_off, 6, 0))
        for sys_name, sys_bytes in [
            ("/#STRINGS", bytes(strings_buf)),
            ("/#URLSTR", bytes(urlstr_buf)),
            ("/#URLTBL", bytes(urltbl_buf)),
            ("/#TOPICS", bytes(topics_buf)),
        ]:
            offset = len(sec1_buf)
            sec1_buf.extend(sys_bytes)
            sec1_entries.append((sys_name, 1, offset, len(sys_bytes)))

    # #SYSTEM in Section 0
    sys_buf = bytearray(struct.pack("<I", 3))

    def add_sys(code: int, payload: bytes) -> None:
        sys_buf.extend(struct.pack("<HH", code, len(payload)))
        sys_buf.extend(payload)

    lcid_opts = struct.pack("<I", lcid) + b"\x00" * 32
    add_sys(4, lcid_opts)
    if hhc_path:
        add_sys(0, hhc_path.lstrip("/").encode(text_encoding) + b"\x00")
    if hhk_path:
        add_sys(1, hhk_path.lstrip("/").encode(text_encoding) + b"\x00")
    if default_topic:
        add_sys(2, default_topic.lstrip("/").encode(text_encoding) + b"\x00")
    if title:
        add_sys(3, title.encode(text_encoding) + b"\x00")
    add_sys(6, b"sample\x00")
    sec0_entries.append(("/#SYSTEM", bytes(sys_buf)))

    # LZX compress Section 1 in reset intervals of 65536 bytes (2 frames of 32768).
    reset_interval = 65536
    uncomp_len = len(sec1_buf)
    padded_len = max(reset_interval, ((uncomp_len + reset_interval - 1) // reset_interval) * reset_interval)
    padded_sec1 = bytes(sec1_buf) + b"\x00" * (padded_len - uncomp_len)

    compressed_stream = bytearray()
    reset_offsets: list[int] = []
    num_frames = max(1, (uncomp_len + 32767) // 32768)
    for start in range(0, len(padded_sec1), reset_interval):
        chunk = padded_sec1[start : start + reset_interval]
        block_comp = (
            encode_lzx_uncompressed_interval(chunk)
            if use_uncompressed_lzx
            else encode_lzx_verbatim_interval(chunk, 16)
        )
        for _ in range(2):
            if len(reset_offsets) < num_frames:
                reset_offsets.append(len(compressed_stream))
        compressed_stream.extend(block_comp)

    control_data = struct.pack("<I4sIIIII", 6, b"LZXC", 2, 2, 2, 1, 0)
    span_info = struct.pack("<Q", uncomp_len)
    reset_table = bytearray(
        struct.pack("<IIIIQQQ", 2, len(reset_offsets), 8, 40, uncomp_len, len(compressed_stream), 32768)
    )
    for off in reset_offsets:
        reset_table.extend(struct.pack("<Q", off))

    name_list = (
        struct.pack("<HH", 30, 2)
        + struct.pack("<H", 12) + "Uncompressed\x00".encode("utf-16le")
        + struct.pack("<H", 12) + "MSCompressed\x00".encode("utf-16le")
    )

    sec0_entries.extend(
        [
            ("::DataSpace/NameList", name_list),
            ("::DataSpace/Storage/MSCompressed/ControlData", control_data),
            ("::DataSpace/Storage/MSCompressed/SpanInfo", span_info),
            (
                "::DataSpace/Storage/MSCompressed/Transform/{7FC28940-9D31-11D0-9B27-00A0C91E9C7C}/InstanceData/ResetTable",
                bytes(reset_table),
            ),
            ("::DataSpace/Storage/MSCompressed/Content", bytes(compressed_stream)),
        ]
    )

    sec0_data = bytearray()
    all_entries: list[tuple[str, int, int, int]] = list(sec1_entries)
    for path, data in sec0_entries:
        off = len(sec0_data)
        sec0_data.extend(data)
        all_entries.append((path, 0, off, len(data)))

    all_entries.sort(key=lambda e: e[0].lower())

    # Pack into 4096-byte PMGL chunks.
    chunk_size = 4096
    raw_chunks: list[bytes] = []
    encoded_records = [
        encint(len(name.encode("utf-8")))
        + name.encode("utf-8")
        + encint(sec)
        + encint(off)
        + encint(ln)
        for name, sec, off, ln in all_entries
    ]

    groups: list[list[bytes]] = [[]]
    cur_size = 0x14
    for rec in encoded_records:
        if cur_size + len(rec) + 4 > chunk_size:
            groups.append([])
            cur_size = 0x14
        groups[-1].append(rec)
        cur_size += len(rec)

    for idx, grp in enumerate(groups):
        body = b"".join(grp)
        free_space = chunk_size - 0x14 - len(body)
        prev_idx = idx - 1 if idx > 0 else -1
        next_idx = idx + 1 if idx + 1 < len(groups) else -1
        hdr = struct.pack("<4sIIii", b"PMGL", free_space, 0, prev_idx, next_idx)
        pad = b"\x00" * (free_space - 2) + struct.pack("<H", len(grp))
        raw_chunks.append(hdr + body + pad)

    itsp_hdr = struct.pack(
        "<4sIIIIIIiiiiiI16sI12s",
        b"ITSP",
        1,
        84,
        0x0A,
        chunk_size,
        2,
        1,
        -1,
        0,
        len(raw_chunks) - 1,
        -1,
        len(raw_chunks),
        lcid,
        b"\x6a\x92\x02\x5d\x2e\x21\xd0\x11\x9d\xf9\x00\xa0\xc9\x22\xe6\xec",
        84,
        b"\x00" * 12,
    )
    dir_bytes = itsp_hdr + b"".join(raw_chunks)
    pre_dir = b"\xfe\x01\x00\x00" + b"\x00" * 20
    dir_offset = 0x60 + len(pre_dir)
    content_offset = dir_offset + len(dir_bytes)

    itsf_hdr = struct.pack(
        "<4sIIIII16s16sQQQQQ",
        b"ITSF",
        3,
        0x60,
        1,
        0,
        lcid,
        b"\x10\xfd\x01\x7c\xaa\x7b\xd0\x11\x9e\x0c\x00\xa0\xc9\x22\xe6\xec",
        b"\x11\xfd\x01\x7c\xaa\x7b\xd0\x11\x9e\x0c\x00\xa0\xc9\x22\xe6\xec",
        0x60,
        len(pre_dir),
        dir_offset,
        len(dir_bytes),
        content_offset,
    )
    return itsf_hdr + pre_dir + dir_bytes + bytes(sec0_data)


def main() -> None:
    EXAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    png_bytes = make_png(16, 12, (34, 139, 230, 255))
    bmp_bytes = make_bmp(8, 8, (40, 180, 99))

    # 1. sample-handbook.chm: Real LZX Verbatim Huffman compressed CHM with HHC tree, HHK index, CSS, PNG, anchors, spaces.
    hhc_handbook = """<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML//EN">
<html><body><object type="text/site properties"><param name="ImageType" value="Folder"></object>
<ul>
  <li><object type="text/sitemap"><param name="Name" value="Welcome"><param name="Local" value="topics/getting%20started.html"></object>
    <ul>
      <li><object type="text/sitemap"><param name="Name" value="Architecture"><param name="Local" value="topics/architecture.html#overview"></object></li>
      <li><object type="text/sitemap"><param name="Name" value="Reference"><param name="Local" value="topics/reference.html"></object></li>
    </ul>
  </li>
</ul></body></html>"""
    hhk_handbook = """<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML//EN">
<html><body><ul>
  <li><object type="text/sitemap"><param name="Name" value="Getting Started"><param name="Local" value="topics/getting%20started.html"></object></li>
  <li><object type="text/sitemap"><param name="Name" value="PNG Diagram"><param name="Local" value="topics/architecture.html#diagram"></object></li>
  <li><object type="text/sitemap"><param name="Name" value="Limits"><param name="Local" value="topics/reference.html#limits"></object></li>
</ul></body></html>"""
    css_handbook = "h1 { color: #1d4ed8; } .note { border-left: 3px solid #2563eb; padding-left: 10px; }"
    t1 = """<!doctype html><html><head><link rel="stylesheet" href="../styles/main.css"></head>
<body><h1>Anyfile Handbook</h1><p class="note">Local CHM viewing without uploads.</p>
<p>Jump to <a href="architecture.html#diagram">Architecture Diagram</a> or <a href="ms-its:handbook.chm::/topics/reference.html#limits">Limits</a>.</p></body></html>"""
    t2 = """<!doctype html><html><head><link rel="stylesheet" href="../styles/main.css"></head>
<body><h1 id="overview">Architecture Overview</h1><p id="diagram">Embedded diagram below:</p>
<img src="../assets/diagram.png" alt="Sample diagram"><p><a href="getting%20started.html">Back to Welcome</a></p></body></html>"""
    t3 = """<!doctype html><html><head><link rel="stylesheet" href="../styles/main.css"></head>
<body><h1>Reference</h1><p id="limits">Bounded LZX reset interval decoding.</p></body></html>"""

    (EXAMPLES_DIR / "sample-handbook.chm").write_bytes(
        build_chm(
            [
                ("/toc.hhc", hhc_handbook.encode("utf-8"), 1),
                ("/index.hhk", hhk_handbook.encode("utf-8"), 1),
                ("/styles/main.css", css_handbook.encode("utf-8"), 1),
                ("/assets/diagram.png", png_bytes, 1),
                ("/topics/getting started.html", t1.encode("utf-8"), 1),
                ("/topics/architecture.html", t2.encode("utf-8"), 1),
                ("/topics/reference.html", t3.encode("utf-8"), 1),
            ],
            title="Anyfile CHM Handbook",
            default_topic="/topics/getting%20started.html",
            hhc_path="/toc.hhc",
            hhk_path="/index.hhk",
            topics_meta=[
                ("Welcome", "topics/getting started.html"),
                ("Architecture", "topics/architecture.html"),
                ("Reference", "topics/reference.html"),
            ],
        )
    )

    # 2. cjk-gbk.chm: GBK encoding (LCID 0x0804), non-ASCII filename, BMP image, uncompressed LZX block.
    hhc_gbk = """<html><body><ul>
  <li><object type="text/sitemap"><param name="Name" value="中文目录首页"><param name="Local" value="章节/说明.htm"></object></li>
</ul></body></html>"""
    html_gbk = """<html><head><meta http-equiv="Content-Type" content="text/html; charset=gbk"></head>
<body><h1>中文帮助手册</h1><p>这是一份使用 GBK 编码的 CHM 测试文档。</p><img src="../icon.bmp" alt="BMP icon"></body></html>"""
    (EXAMPLES_DIR / "cjk-gbk.chm").write_bytes(
        build_chm(
            [
                ("/目录.hhc", hhc_gbk.encode("gbk"), 1),
                ("/章节/说明.htm", html_gbk.encode("gbk"), 1),
                ("/icon.bmp", bmp_bytes, 0),
            ],
            title="中文帮助文档",
            default_topic="/章节/说明.htm",
            hhc_path="/目录.hhc",
            hhk_path="",
            lcid=0x0804,
            text_encoding="gbk",
            use_uncompressed_lzx=True,
        )
    )

    # 3. malicious-sandbox.chm: Active scripts, ActiveX object, form, iframe, remote image, cross-CHM ms-its, missing local image.
    malicious_html = """<html><body>
<h1>Security Isolation Test</h1>
<script>window.top.__chmAttack = true;</script>
<object type="application/x-oleobject" classid="clsid:adb880a6-d8ff-11cf-9377-00aa003b7a11"></object>
<iframe src="https://evil.invalid/frame"></iframe>
<form action="https://evil.invalid/steal"><input type="text"></form>
<img src="https://evil.invalid/pixel.png" onerror="window.__imgErr=1">
<img src="missing-diagram.png" alt="Missing local">
<a href="javascript:alert(1)">Bad JS Link</a>
<a href="ms-its:other.chm::/secret.htm">Cross CHM Link</a>
<p>Safe paragraph remains readable.</p>
</body></html>"""
    (EXAMPLES_DIR / "malicious-sandbox.chm").write_bytes(
        build_chm(
            [("/index.html", malicious_html.encode("utf-8"), 1)],
            title="Malicious Security Fixture",
            default_topic="/index.html",
            hhc_path="",
            hhk_path="",
        )
    )

    # 4. Negative fixtures.
    corrupt = bytearray(EXAMPLES_DIR.joinpath("sample-handbook.chm").read_bytes())
    # Point PMGL chunk 0 nextChunk (at dirOffset + 84 + 0x10) to 0 (infinite self-loop).
    struct.pack_into("<i", corrupt, 0x60 + 24 + 84 + 0x10, 0)
    (EXAMPLES_DIR / "corrupt-loop.chm").write_bytes(bytes(corrupt))
    (EXAMPLES_DIR / "truncated-header.chm").write_bytes(corrupt[:64])
    (EXAMPLES_DIR / "disguised-text.chm").write_bytes(b"Plain text masquerading as a CHM archive.\n")

    print("Generated CHM examples:", sorted(p.name for p in EXAMPLES_DIR.glob("*.chm")))


if __name__ == "__main__":
    main()
