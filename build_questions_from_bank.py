# -*- coding: utf-8 -*-
"""
Build questions.json from Assesement/Marksdown/Exam_Combined_Master_Bank.md

Run from quiz-app/:
  python build_questions_from_bank.py

Outputs: quiz-app/questions.json (overwrites)
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BANK = ROOT.parent / "Assesement" / "Marksdown" / "Exam_Combined_Master_Bank.md"
OUT = ROOT / "questions.json"

TOPIC_A = "Section A — Multiple choice"
TOPIC_B = "Section B — Objective"
TOPIC_C = "Section C — Short answer"
TOPIC_D = "Section D — Practical"

DIFF = {"A": "medium", "B": "medium", "C": "hard", "D": "hard"}

# TF items whose key line is explanatory text, not the word TRUE/FALSE
B_TF_ANSWER_OVERRIDES: dict[int, str] = {
    14: "TRUE",  # key names log loss; the statement is true
}

# Match items where the key is a short label (F1, Specificity) — map to option letter
B_MATCH_LETTER: dict[int, str] = {
    19: "C",
    23: "B",
}


def strip_appendix(text: str) -> str:
    if "# APPENDIX" in text:
        return text.split("# APPENDIX")[0].rstrip() + "\n"
    return text


def slice_between(text: str, start: str, end: str) -> str:
    a = text.index(start)
    b = text.index(end, a + len(start))
    return text[a:b]


def clean_md(s: str) -> str:
    s = re.sub(r"\*{1,2}", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def strip_md_asterisks(s: str) -> str:
    """Remove markdown bold markers (**)."""
    if not s:
        return s
    return s.replace("**", "")


def strip_leading_item_label(s: str) -> str:
    r"""Drop leading **A10.** / A10. / **B1.** if duplicated inside the stem."""
    return re.sub(r"^\*{0,2}[ABCD]\d+\.{1,2}\*{0,2}\s*", "", s, flags=re.I).strip()


def format_question_text(s: str, max_len: int = 2800) -> str:
    """Plain question text for the app: no **, no repeated A1./B2. prefix."""
    s = strip_md_asterisks(s)
    s = strip_leading_item_label(s)
    s = s.strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 3].rstrip() + "…"


def clean_option_text(s: str) -> str:
    return strip_md_asterisks(s.strip())


def parse_a_questions(region: str) -> dict[int, tuple[str, dict[str, str]]]:
    """n -> (stem, {a: text, b: text, ...})"""
    parts = re.split(r"(?=\*\*A\d+\.)", region)
    out: dict[int, tuple[str, dict[str, str]]] = {}
    for p in parts:
        p = p.strip()
        m = re.match(r"^\*\*A(\d+)\.\*\*\s*", p, re.M)
        if not m:
            continue
        n = int(m.group(1))
        rest = p[m.end() :]
        mo = re.search(r"(?m)^a\)\s*", rest)
        if not mo:
            continue
        stem = rest[: mo.start()].strip()
        opt_blob = rest[mo.start() :]
        opts: dict[str, str] = {}
        for om in re.finditer(r"(?m)^([a-d])\)\s*(.+)$", opt_blob):
            opts[om.group(1).lower()] = om.group(2).strip()
        if len(opts) < 4:
            continue
        out[n] = (stem, opts)
    return out


def parse_a_keys(region: str) -> dict[int, tuple[str, str]]:
    """n -> (letter, rationale)"""
    parts = re.split(r"(?=### A\d+\s)", region)
    out: dict[int, tuple[str, str]] = {}
    for p in parts:
        p = p.strip()
        m = re.match(r"### A(\d+)\s*—\s*Answer:\s*\*\*([a-d])\*\*", p, re.I)
        if not m:
            continue
        n = int(m.group(1))
        let = m.group(2).lower()
        rat = ""
        rm = re.search(r"\*\*Rationale:\*\*\s*(.+?)(?=### A\d+|\Z)", p, re.S | re.I)
        if rm:
            rat = rm.group(1).strip()
        else:
            rm2 = re.search(r"\*\*Correct:\s*([a-d])\.\*\*\s*(.+?)(?=### A\d+|\Z)", p, re.S | re.I)
            if rm2:
                rat = rm2.group(2).strip()
        out[n] = (let, re.sub(r"\s+", " ", rat)[:4000])
    return out


def parse_b_blocks(region: str) -> dict[int, str]:
    parts = re.split(r"(?=\*\*B\d+\.)", region)
    out: dict[int, str] = {}
    for p in parts:
        p = p.strip()
        m = re.match(r"^\*\*B(\d+)\.\*\*\s*", p, re.M)
        if not m:
            continue
        n = int(m.group(1))
        body = p[m.end() :].strip()
        if re.match(r"^#+\s", body):
            continue
        out[n] = body.split("\n---\n")[0].strip()
    return out


def classify_b(body: str) -> str:
    head = body[:900]
    if re.search(r"(?i)Complete:", head):
        return "complete"
    if re.search(r"(?i)TRUE or FALSE", head):
        return "tf"
    if re.search(r"(?m)^\-\s*\([A-Ea-e]\)\s", body):
        return "match"
    return "other"


def parse_match_options(body: str) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    for om in re.finditer(r"(?m)^\-\s*\(([A-Ea-e])\)\s*(.+)$", body):
        rows.append((om.group(1).upper(), om.group(2).strip()))
    order = "ABCDE"
    rows.sort(key=lambda x: order.index(x[0]) if x[0] in order else 99)
    return rows


def parse_b_keys(region: str) -> dict[int, str]:
    parts = re.split(r"(?=### B\d+\s*$)", region, flags=re.M)
    out: dict[int, str] = {}
    for p in parts:
        p = p.strip()
        m = re.match(r"### B(\d+)\s*\n", p)
        if not m:
            continue
        n = int(m.group(1))
        ans_m = re.search(r"\*\*Answer:\*\*\s*([^\n]+)", p)
        if ans_m:
            out[n] = clean_md(ans_m.group(1).strip())
        else:
            out[n] = ""
    return out


def resolve_b_mcq(body: str, key_val: str, n: int) -> tuple[str, list[str], str] | None:
    kind = classify_b(body)
    key_val = key_val.strip()

    if kind == "tf":
        opts = ["TRUE", "FALSE"]
        if n in B_TF_ANSWER_OVERRIDES:
            return "mcq", opts, B_TF_ANSWER_OVERRIDES[n]
        ku = re.sub(r"[^A-Z]", "", key_val.upper())
        if ku == "TRUE":
            ca = "TRUE"
        elif ku == "FALSE":
            ca = "FALSE"
        else:
            return None
        return "mcq", opts, ca

    if kind == "match":
        rows = parse_match_options(body)
        if not rows:
            return None
        opts = [f"({ltr}) {txt}" for ltr, txt in rows]
        letter_map = {ltr: f"({ltr}) {txt}" for ltr, txt in rows}

        km = re.match(r"^([A-E])\s*[—\-–]\s*", key_val)
        if km:
            L = km.group(1).upper()
            if L in letter_map:
                return "mcq", opts, letter_map[L]

        km2 = re.match(r"^([A-E])$", key_val.strip().upper())
        if km2 and km2.group(1) in letter_map:
            return "mcq", opts, letter_map[km2.group(1)]

        for L, label in letter_map.items():
            rest = re.sub(r"^[A-E]\s*[—\-–]\s*", "", key_val).strip()
            if rest and rest.lower() in label.lower():
                return "mcq", opts, label
            if key_val.upper() == L:
                return "mcq", opts, label

        if n in B_MATCH_LETTER and B_MATCH_LETTER[n] in letter_map:
            return "mcq", opts, letter_map[B_MATCH_LETTER[n]]

        kv_low = key_val.lower()
        for label in opts:
            if len(kv_low) >= 4 and (kv_low in label.lower() or label.lower() in kv_low):
                return "mcq", opts, label

        return "self_check", [], key_val

    if kind == "complete" or kind == "other":
        return "self_check", [], key_val

    return "self_check", [], key_val


def parse_c_blocks(region: str) -> dict[int, str]:
    parts = re.split(r"(?=\*\*C\d+\.)", region)
    out: dict[int, str] = {}
    for p in parts:
        p = p.strip()
        m = re.match(r"^\*\*C(\d+)\.\*\*\s*", p, re.M)
        if not m:
            continue
        n = int(m.group(1))
        body = p[m.end() :].strip().split("\n---\n")[0].strip()
        out[n] = body
    return out


def parse_c_keys(region: str) -> dict[int, str]:
    parts = re.split(r"(?=### C\d+\s*$)", region, flags=re.M)
    out: dict[int, str] = {}
    for p in parts:
        p = p.strip()
        m = re.match(r"### C(\d+)\s*\n", p)
        if not m:
            continue
        n = int(m.group(1))
        body = p[m.end() :].strip()
        body = re.sub(r"\n---\s*$", "", body)
        out[n] = body[:12000]
    return out


def parse_d_blocks(region: str) -> dict[int, str]:
    parts = re.split(r"(?=\*\*D\d+\.)", region)
    out: dict[int, str] = {}
    for p in parts:
        p = p.strip()
        m = re.match(r"^\*\*D(\d+)\.(?:\s*\[[^\]]+\])?\*\*\s*", p, re.M)
        if not m:
            continue
        n = int(m.group(1))
        body = p[m.end() :].strip().split("\n---\n")[0].strip()
        out[n] = body
    return out


def parse_d_keys(region: str) -> dict[int, str]:
    parts = re.split(r"(?=### D\d+\s)", region)
    out: dict[int, str] = {}
    for p in parts:
        p = p.strip()
        m = re.match(r"### D(\d+)\s*—\s*Model answer\s*\n", p, re.I)
        if not m:
            continue
        n = int(m.group(1))
        body = p[m.end() :].strip()
        body = re.sub(r"\n---\s*$", "", body)
        out[n] = body[:12000]
    return out


def main() -> None:
    if not BANK.is_file():
        raise SystemExit(f"Missing bank file: {BANK}")

    raw = strip_appendix(BANK.read_text(encoding="utf-8"))

    sec_a = slice_between(raw, "# SECTION A — Multiple choice", "# SECTION B — Objective")
    sec_b = slice_between(raw, "# SECTION B — Objective", "# SECTION C — Short answer")
    sec_c = slice_between(raw, "# SECTION C — Short answer", "# SECTION D — Practical")
    sec_d = slice_between(raw, "# SECTION D — Practical (Bug-fix, fill-in-blank, calculations) (50)", "# ANSWER KEY")

    key_blob = raw[raw.index("# ANSWER KEY") :]
    key_a = slice_between(key_blob, "## Section A — Multiple choice", "## Section B — Objective")
    key_b = slice_between(key_blob, "## Section B — Objective", "## Section C — Short answer")
    key_c = slice_between(key_blob, "## Section C — Short answer", "## Section D — Model answers")
    kd0 = key_blob[key_blob.index("## Section D — Model answers") :]
    _end = re.search(r"\n\*For classroom use", kd0)
    key_d = kd0[: _end.start()] if _end else kd0

    a_q = parse_a_questions(sec_a)
    a_k = parse_a_keys(key_a)
    b_q = parse_b_blocks(sec_b)
    b_k = parse_b_keys(key_b)
    c_q = parse_c_blocks(sec_c)
    c_k = parse_c_keys(key_c)
    d_q = parse_d_blocks(sec_d)
    d_k = parse_d_keys(key_d)

    items: list[dict] = []

    for n in sorted(a_q):
        if n not in a_k:
            continue
        stem, opts = a_q[n]
        let, rat = a_k[n]
        letters = ["a", "b", "c", "d"]
        if let not in opts:
            continue
        opt_list = [clean_option_text(opts[l]) for l in letters]
        ca = clean_option_text(opts[let])
        items.append(
            {
                "id": f"A{n}",
                "type": "mcq",
                "scored": True,
                "section": "A",
                "question": format_question_text(stem),
                "options": opt_list,
                "correct_answer": ca,
                "explanation": strip_md_asterisks(rat) if rat else "See course materials.",
                "difficulty": DIFF["A"],
                "topic": TOPIC_A,
            }
        )

    for n in sorted(b_q):
        if n not in b_k:
            continue
        body = b_q[n]
        kv = b_k[n]
        resolved = resolve_b_mcq(body, kv, n)
        if resolved is None:
            continue
        typ, opts, ca_or_expl = resolved
        stem_line = re.sub(r"(?s)\n\-\s*\([A-Ea-e]\).*", "", body).strip()
        qtext = format_question_text(stem_line)

        if typ == "mcq":
            opts = [clean_option_text(o) for o in opts]
            ca_or_expl = clean_option_text(str(ca_or_expl))
            expl = strip_md_asterisks((kv[:3000] or ca_or_expl))
            if n in B_TF_ANSWER_OVERRIDES and kv:
                expl = strip_md_asterisks(f"Correct: {ca_or_expl}. {kv}")
            items.append(
                {
                    "id": f"B{n}",
                    "type": "mcq",
                    "scored": True,
                    "section": "B",
                    "question": qtext,
                    "options": opts,
                    "correct_answer": ca_or_expl,
                    "explanation": expl,
                    "difficulty": DIFF["B"],
                    "topic": TOPIC_B,
                }
            )
        else:
            items.append(
                {
                    "id": f"B{n}",
                    "type": "self_check",
                    "scored": False,
                    "section": "B",
                    "question": qtext,
                    "options": [],
                    "correct_answer": "",
                    "explanation": strip_md_asterisks(
                        str(ca_or_expl or kv or "Draft your answer, then reveal the model notes.")
                    )[:12000],
                    "difficulty": DIFF["B"],
                    "topic": TOPIC_B,
                }
            )

    for n in sorted(c_q):
        if n not in c_k:
            continue
        body = c_q[n]
        expl = c_k[n]
        items.append(
            {
                "id": f"C{n}",
                "type": "self_check",
                "scored": False,
                "section": "C",
                "question": format_question_text(body),
                "options": [],
                "correct_answer": "",
                "explanation": strip_md_asterisks(expl[:12000]),
                "difficulty": DIFF["C"],
                "topic": TOPIC_C,
            }
        )

    for n in sorted(d_q):
        if n not in d_k:
            continue
        body = d_q[n]
        expl = d_k[n]
        items.append(
            {
                "id": f"D{n}",
                "type": "self_check",
                "scored": False,
                "section": "D",
                "question": format_question_text(body),
                "options": [],
                "correct_answer": "",
                "explanation": strip_md_asterisks(expl[:12000]),
                "difficulty": DIFF["D"],
                "topic": TOPIC_D,
            }
        )

    OUT.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    scored = sum(1 for x in items if x.get("scored"))
    print(f"Wrote {len(items)} items to {OUT} ({scored} scored MCQ, {len(items) - scored} self-check)")


if __name__ == "__main__":
    main()
