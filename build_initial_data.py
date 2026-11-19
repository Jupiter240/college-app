#!/usr/bin/env python3
"""
Extracts all 13 tabs from data/original_sheet.xlsx (or a fresh Google Sheets export)
into structured JSON (data/app_data.json) and JS bundle (data/default_data.js).
"""
import datetime
import json
import os
import re
import zipfile
import xml.etree.ElementTree as ET

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
XLSX_PATH = os.path.join(BASE_DIR, "data", "original_sheet.xlsx")
JSON_OUT = os.path.join(BASE_DIR, "data", "app_data.json")
JS_OUT = os.path.join(BASE_DIR, "data", "default_data.js")

SHEET_URL = "https://docs.google.com/spreadsheets/d/1TQQxO4H7hZueiuH2XLK0yEbJjraDqKQWUdeCaIuyg48/edit?gid=0#gid=0"


def col_to_idx(col_str):
    res = 0
    for ch in col_str:
        res = res * 26 + (ord(ch) - ord("A") + 1)
    return res


def split_ref(ref):
    m = re.match(r"^([A-Z]+)(\d+)$", ref)
    if not m:
        return "", 0
    return m.group(1), int(m.group(2))


def excel_date_to_iso(val_str):
    try:
        fval = float(val_str)
        if 44000 <= fval <= 48000:
            dt = datetime.datetime(1899, 12, 30) + datetime.timedelta(days=fval)
            return dt.strftime("%Y-%m-%d")
    except Exception:
        pass
    return None


def parse_xlsx(xlsx_path):
    ns = {
        "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    }
    with zipfile.ZipFile(xlsx_path, "r") as z:
        wb_xml = ET.fromstring(z.read("xl/workbook.xml"))
        rels_xml = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rels = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels_xml}

        fills = []
        cell_xfs = []
        strike_xfs = set()
        if "xl/styles.xml" in z.namelist():
            st_xml = ET.fromstring(z.read("xl/styles.xml"))
            for fill in st_xml.findall(".//main:fills/main:fill", ns):
                fg = fill.find(".//main:fgColor", ns)
                fills.append(fg.attrib.get("rgb") if fg is not None else None)
            strikes = [
                font.find("main:strike", ns) is not None
                for font in st_xml.findall(".//main:fonts/main:font", ns)
            ]
            for i, xf in enumerate(st_xml.findall(".//main:cellXfs/main:xf", ns)):
                fid = int(xf.attrib.get("fillId", 0))
                cell_xfs.append(fills[fid] if fid < len(fills) else None)
                font_id = int(xf.attrib.get("fontId", 0))
                if font_id < len(strikes) and strikes[font_id]:
                    strike_xfs.add(i)

        shared_strings = []
        if "xl/sharedStrings.xml" in z.namelist():
            ss_xml = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in ss_xml.findall("main:si", ns):
                texts = [t.text or "" for t in si.findall(".//main:t", ns)]
                shared_strings.append("".join(texts))

        sheets = {}
        for sheet in wb_xml.findall(".//main:sheet", ns):
            name = sheet.attrib["name"]
            rid = sheet.attrib[
                "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
            ]
            target = "xl/" + rels[rid]
            ws_xml = ET.fromstring(z.read(target))

            sheet_rels_path = target.replace("worksheets/", "worksheets/_rels/") + ".rels"
            hlinks = {}
            if sheet_rels_path in z.namelist():
                srels_xml = ET.fromstring(z.read(sheet_rels_path))
                srels = {r.attrib["Id"]: r.attrib["Target"] for r in srels_xml}
                for hl in ws_xml.findall(".//main:hyperlink", ns):
                    ref = hl.attrib.get("ref")
                    hrid = hl.attrib.get(
                        "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
                    )
                    if ref and hrid in srels:
                        hlinks[ref] = srels[hrid]
                    elif ref and "location" in hl.attrib:
                        hlinks[ref] = hl.attrib["location"]

            rows_map = {}
            for row in ws_xml.findall(".//main:row", ns):
                r_idx = int(row.attrib["r"])
                row_dict = {}
                for c in row.findall("main:c", ns):
                    ref = c.attrib["r"]
                    col_str, _ = split_ref(ref)
                    t = c.attrib.get("t")
                    s_idx = int(c.attrib.get("s", 0))
                    bg = cell_xfs[s_idx] if s_idx < len(cell_xfs) else None
                    if bg in ("00000000", "FFFFFFFF"):
                        bg = None
                    elif bg and len(bg) == 8:
                        bg = "#" + bg[2:]
                    strike = s_idx in strike_xfs

                    f = c.find("main:f", ns)
                    v = c.find("main:v", ns)
                    is_el = c.find("main:is", ns)
                    val = None
                    iso_date = None
                    if v is not None and v.text is not None:
                        if t == "s":
                            val = shared_strings[int(v.text)]
                        elif t == "b":
                            val = bool(int(v.text))
                        else:
                            val = v.text
                            iso_date = excel_date_to_iso(val)
                    elif is_el is not None:
                        val = "".join([x.text or "" for x in is_el.findall(".//main:t", ns)])

                    formula = f.text if f is not None else None
                    link = hlinks.get(ref)

                    if val is not None or formula is not None or link is not None or strike:
                        row_dict[col_str] = {
                            "value": val,
                            "isoDate": iso_date,
                            "formula": formula,
                            "link": link,
                            "bg": bg,
                            "strike": strike,
                        }
                if row_dict:
                    rows_map[r_idx] = row_dict
            sheets[name] = rows_map
        return sheets


def cell_val(row_dict, col, default=""):
    if not row_dict or col not in row_dict:
        return default
    v = row_dict[col].get("value")
    if v is None:
        return default
    return str(v).strip() if not isinstance(v, bool) else v


def cell_date_or_text(row_dict, col, default=""):
    if not row_dict or col not in row_dict:
        return default, ""
    c = row_dict[col]
    if c.get("isoDate"):
        return c["isoDate"], c["isoDate"]
    raw = str(c.get("value") or "").strip()
    # Check if raw text like "January 10th" can be given a normalized ISO date for 2027
    if raw.lower() in ("january 10th", "jan 10", "january 10"):
        return raw, "2027-01-10"
    return raw, ""


def cell_link(row_dict, col):
    if not row_dict or col not in row_dict:
        return ""
    return row_dict[col].get("link") or ""


def cell_bg(row_dict, col):
    if not row_dict or col not in row_dict:
        return ""
    return row_dict[col].get("bg") or ""


def cell_strike(row_dict, col):
    if not row_dict or col not in row_dict:
        return False
    return bool(row_dict[col].get("strike"))


def build_structured_data():
    sheets = parse_xlsx(XLSX_PATH)

    # 1. INTERNSHIPS & QUICK LINKS
    intern_sheet = sheets.get("Internship", {})
    internships = []
    for r in range(2, 16):
        row = intern_sheet.get(r, {})
        if not row:
            continue
        raw_dl, iso_dl = cell_date_or_text(row, "C")
        # Also detect portal open date in status if no deadline or additional reminder
        status_str = cell_val(row, "F")
        internships.append({
            "id": f"intern-{r-1}",
            "organization": cell_val(row, "A"),
            "linkText": cell_val(row, "B"),
            "linkUrl": cell_link(row, "B") or (cell_val(row, "B").split("\n")[0].strip() if cell_val(row, "B").startswith("http") else ""),
            "deadlineDisplay": raw_dl,
            "deadlineDate": iso_dl,
            "projectArea": cell_val(row, "D"),
            "programDates": cell_val(row, "E"),
            "status": status_str,
            "resumeReq": cell_val(row, "G"),
            "coverLetterReq": cell_val(row, "H"),
            "otherDetails": cell_val(row, "I"),
            "highlightColor": cell_bg(row, "A"),
            "pinned": bool(cell_bg(row, "A")),
        })

    quick_docs = []
    for r in range(21, 27):
        row = intern_sheet.get(r, {})
        if not row or not cell_val(row, "A"):
            continue
        quick_docs.append({
            "id": f"doc-{r-20}",
            "title": cell_val(row, "A"),
            "url": cell_link(row, "A"),
            "category": "Master Document",
        })

    # 2. TODOS
    todo_sheet = sheets.get("ToDos", {})
    todos = []
    for r in sorted(todo_sheet.keys()):
        if r == 1:
            continue
        row = todo_sheet[r]
        raw_dl, iso_dl = cell_date_or_text(row, "C")
        update_text = cell_val(row, "D")
        todos.append({
            "id": f"todo-{r-1}",
            "what": cell_val(row, "A"),
            "who": cell_val(row, "B") or "Ayan / Family",
            "byWhen": iso_dl or raw_dl,
            "update": update_text,
            "completed": "closed the loop" in update_text.lower(),
        })

    # 3. COLLEGE COUNSELORS
    counselor_sheet = sheets.get("College counselors", {})
    counselors = [
        {
            "id": "counselor-1",
            "name": "Diya College Counselor Qs (Google Doc)",
            "role": "Interview Questions & Evaluation Notes",
            "url": cell_val(counselor_sheet.get(1, {}), "A") or cell_link(counselor_sheet.get(1, {}), "A"),
            "notes": "Master document with counselor interview questions & comparison notes.",
            "status": "Reference Doc",
        },
        {
            "id": "counselor-2",
            "name": "Colleen Boucher",
            "role": "Selected College Counselor",
            "url": cell_val(counselor_sheet.get(2, {}), "A") or cell_link(counselor_sheet.get(2, {}), "A"),
            "notes": "Closed the loop with PathIvy. Going with Colleen.",
            "status": "Active / Selected",
        },
    ]

    # 4. MAJORS
    majors_sheet = sheets.get(" Majors", sheets.get("Majors", {}))
    majors = []
    for r in sorted(majors_sheet.keys()):
        row = majors_sheet[r]
        name = cell_val(row, "A")
        if not name:
            continue
        majors.append({
            "id": f"major-{r}",
            "name": name,
            "details": cell_val(row, "B"),
            "highlightColor": cell_bg(row, "B") or cell_bg(row, "A"),
            "priority": r,
        })

    # 5. COLLEGES
    colleges_sheet = sheets.get("Colleges", {})
    crit_row = colleges_sheet.get(2, {})
    college_criteria = {
        "bucket": cell_val(crit_row, "A"),
        "label": cell_val(crit_row, "B"),
        "location": cell_val(crit_row, "C"),
        "why": cell_val(crit_row, "D"),
        "engineeringMajors": cell_val(crit_row, "E"),
        "preference": cell_val(crit_row, "F"),
        "overallRanking": cell_val(crit_row, "G"),
        "majorRanking": cell_val(crit_row, "H"),
        "distanceFromSfo": cell_val(crit_row, "I"),
        "extracurricular": cell_val(crit_row, "J"),
        "acceptanceStats": cell_val(crit_row, "K"),
        "applicationDeadlines": cell_val(crit_row, "L"),
        "financialAid": cell_val(crit_row, "M"),
        "thoughts": cell_val(crit_row, "N"),
        "satTest": cell_val(crit_row, "O"),
        "goodMastersPhd": cell_val(crit_row, "P"),
        "jobProspects": cell_val(crit_row, "Q"),
        "costOfAttendance": cell_val(crit_row, "R"),
    }

    colleges = []
    for r in sorted(colleges_sheet.keys()):
        if r <= 2:
            continue
        row = colleges_sheet[r]
        name = cell_val(row, "B")
        if not name:
            continue
        raw_bucket = cell_val(row, "A")
        # Normalize typo "Taget" -> "Target" while keeping display faithful or clean
        norm_bucket = "Target" if raw_bucket.lower() == "taget" else raw_bucket.strip()
        if not norm_bucket and cell_bg(row, "B") == "#D9D2E9":
            norm_bucket = "Reach"
        pref_raw = cell_val(row, "F")
        if pref_raw.endswith(".0"):
            pref_raw = pref_raw[:-2]
        colleges.append({
            "id": f"college-{r}",
            "rowNumber": r,
            "bucket": norm_bucket or "Reach",
            "bucketRaw": raw_bucket,
            "name": name,
            "url": cell_link(row, "B"),
            "location": cell_val(row, "C"),
            "why": cell_val(row, "D"),
            "engineeringMajors": cell_val(row, "E"),
            "preference": pref_raw,
            "overallRanking": cell_val(row, "G"),
            "majorRanking": cell_val(row, "H"),
            "distanceFromSfo": cell_val(row, "I"),
            "extracurricular": cell_val(row, "J"),
            "acceptanceStats": cell_val(row, "K"),
            "applicationDeadlines": cell_val(row, "L"),
            "financialAid": cell_val(row, "M"),
            "thoughts": cell_val(row, "N"),
            "satTest": cell_val(row, "O"),
            "goodMastersPhd": cell_val(row, "P"),
            "jobProspects": cell_val(row, "Q"),
            "costOfAttendance": cell_val(row, "R"),
            "bgColor": cell_bg(row, "B") or cell_bg(row, "A"),
            "strikethrough": cell_strike(row, "B") or cell_strike(row, "A"),
        })

    # 6. NO SUPPLEMENTAL COLLEGES
    nosupp_sheet = sheets.get("NoSupplemental Colleges", {})
    no_supplemental_colleges = []
    for r in sorted(nosupp_sheet.keys()):
        if r == 1:
            continue
        row = nosupp_sheet[r]
        name = cell_val(row, "A")
        if not name:
            continue
        no_supplemental_colleges.append({
            "id": f"nosupp-{r-1}",
            "name": name,
            "eligibleNov1": cell_val(row, "B"),
            "publicPrivate": cell_val(row, "C"),
            "worthIt": cell_val(row, "D"),
            "why": cell_val(row, "E"),
            "whyLink": cell_link(row, "E"),
            "statsAndNotes": cell_val(row, "F"),
            "location": cell_val(row, "G"),
            "highlighted": bool(cell_bg(row, "A")),
            "bgColor": cell_bg(row, "A"),
        })

    # 7. NOTES (Safety / Target / Reach definitions)
    notes_sheet = sheets.get("Notes", {})
    bucket_notes = [
        {
            "id": "note-safety",
            "title": cell_val(notes_sheet.get(1, {}), "A") or "Safety School:",
            "chanceRange": "75% or higher",
            "bullets": [
                cell_val(notes_sheet.get(2, {}), "A"),
                cell_val(notes_sheet.get(3, {}), "A"),
                cell_val(notes_sheet.get(4, {}), "A"),
            ],
            "color": "#B7B7B7",
        },
        {
            "id": "note-target",
            "title": cell_val(notes_sheet.get(5, {}), "A") or "Target School:",
            "chanceRange": "25% – 75%",
            "bullets": [
                cell_val(notes_sheet.get(6, {}), "A"),
                cell_val(notes_sheet.get(7, {}), "A"),
                cell_val(notes_sheet.get(8, {}), "A"),
                cell_val(notes_sheet.get(9, {}), "A"),
            ],
            "color": "#D9EAD3",
        },
        {
            "id": "note-reach",
            "title": cell_val(notes_sheet.get(10, {}), "A") or "Reach School:",
            "chanceRange": "Less than 25%",
            "bullets": [
                cell_val(notes_sheet.get(11, {}), "A"),
                cell_val(notes_sheet.get(12, {}), "A"),
                cell_val(notes_sheet.get(13, {}), "A"),
            ],
            "color": "#D9D2E9",
        },
    ]

    # 8. DIYAS NOTES
    diyas_sheet = sheets.get("Diyas Notes", {})
    diyas_notes = {
        "preferencesAndStrategy": [
            cell_val(diyas_sheet.get(1, {}), "A"),
            cell_val(diyas_sheet.get(4, {}), "A"),
            cell_val(diyas_sheet.get(5, {}), "A"),
            cell_val(diyas_sheet.get(6, {}), "A"),
        ],
        "interviews": [
            {
                "id": f"interview-{r-1}",
                "who": cell_val(diyas_sheet.get(r, {}), "C"),
                "questions": cell_val(diyas_sheet.get(r, {}), "D"),
                "responses": cell_val(diyas_sheet.get(r, {}), "E"),
            }
            for r in range(2, 7)
            if cell_val(diyas_sheet.get(r, {}), "C")
        ],
        "swathiNotes": [
            cell_val(diyas_sheet.get(r, {}), "F")
            for r in range(2, 31)
            if cell_val(diyas_sheet.get(r, {}), "F")
        ],
        "purdueVisitNotes": [
            cell_val(diyas_sheet.get(r, {}), "O")
            for r in range(2, 6)
            if cell_val(diyas_sheet.get(r, {}), "O")
        ],
    }

    # 9 & 10. GPA & UCCSU GPA
    def parse_gpa_sheet(sheet_dict, sheet_key):
        courses = []
        current_term = ""
        for r in range(3, 69):
            row = sheet_dict.get(r, {})
            term_cell = cell_val(row, "A")
            if term_cell:
                current_term = term_cell
            course_name = cell_val(row, "B")
            if course_name.endswith(".0") and course_name[:-2].isdigit():
                course_name = f"Course {course_name[:-2]}"
            w_raw = cell_val(row, "C")
            u_raw = cell_val(row, "D")
            note_raw = cell_val(row, "E")
            if not course_name and not w_raw and not u_raw:
                continue
            is_sports_or_pe = (
                "sports" in current_term.lower()
                or course_name.upper() == "PE"
            )
            is_10_to_12 = r >= 17 and r <= 61
            is_academic = (3 <= r <= 8) or (10 <= r <= 15) or (17 <= r <= 61)
            courses.append({
                "id": f"{sheet_key}-row-{r}",
                "rowNumber": r,
                "term": current_term,
                "course": course_name,
                "weighted": w_raw[:-2] if w_raw.endswith(".0") else w_raw,
                "unweighted": u_raw[:-2] if u_raw.endswith(".0") else u_raw,
                "letterNote": note_raw,
                "highlighted": bool(cell_bg(row, "B") or cell_bg(row, "C")),
                "isAcademic": is_academic and not is_sports_or_pe,
                "is10to12": is_10_to_12,
            })
        return courses

    gpa_data = {
        "regular": {
            "title": "Standard GPA",
            "subtitle": "All Honors & AP courses weighted (+1.0)",
            "courses": parse_gpa_sheet(sheets.get("GPA", {}), "gpa"),
            "projections": {
                "worstCase": {
                    "totalWeighted": "4.53",
                    "totalUnweighted": "3.92",
                    "academicWeighted": "4.60",
                    "academicUnweighted": "3.91",
                    "tenToTwelveWeighted": "4.65",
                    "tenToTwelveUnweighted": "3.87",
                },
                "bestCase": {
                    "totalWeighted": "4.57",
                    "totalUnweighted": "3.96",
                    "academicWeighted": "4.65",
                    "academicUnweighted": "3.95",
                    "tenToTwelveWeighted": "4.71",
                    "tenToTwelveUnweighted": "3.94",
                },
            },
        },
        "uccsu": {
            "title": "UC / CSU GPA",
            "subtitle": "*Honors classes only considered weighted if they directly lead to an AP class",
            "courses": parse_gpa_sheet(sheets.get("UCCSU GPA", {}), "uccsu"),
        },
    }

    # 11. UCs
    ucs_sheet = sheets.get("UCs", {})
    uc_campuses = []
    for r in range(2, 12):
        row = ucs_sheet.get(r, {})
        name = cell_val(row, "A")
        if not name:
            continue
        uc_campuses.append({
            "id": f"uc-{r}",
            "name": name,
            "location": cell_val(row, "B"),
            "majorsApplied": cell_val(row, "C"),
            "nationalRanking": cell_val(row, "D"),
            "acceptanceStats": cell_val(row, "E"),
            "goodMastersPhd": cell_val(row, "F"),
            "jobProspects": cell_val(row, "G"),
            "notes": cell_val(row, "H"),
            "selected": cell_bg(row, "A") == "#B6D7A8",
            "bgColor": cell_bg(row, "A"),
        })

    ucsd_colleges = []
    for r in range(16, 25):
        row = ucs_sheet.get(r, {})
        name = cell_val(row, "A")
        if not name:
            continue
        ucsd_colleges.append({
            "id": f"ucsd-{r}",
            "college": name,
            "educationReqs": cell_val(row, "B"),
            "dormLife": cell_val(row, "C"),
            "proposedRanking": cell_val(row, "D"),
            "notes": cell_val(row, "E"),
        })

    ucsd_recommended_summary = [
        {
            "rank": 1,
            "college": "John Muir",
            "rationale": "Best balance of minimal GEs, great central location, good food (Pines), and is well-regarded for pre-med/biology students.",
        },
        {
            "rank": 2,
            "college": "Sixth",
            "rationale": "Excellent modern facilities, good dining hall (Sixth Market/Bistro), relatively easy GEs, central location.",
        },
        {
            "rank": 3,
            "college": "Thurgood Marshall",
            "rationale": "Solid GEs and good food options (Oceanview), neutral location.",
        },
        {
            "rank": 4,
            "college": "Earl Warren",
            "rationale": "Decent GEs (especially if an IGETC is completed), offers nice views in some areas, but is a bit far from central campus.",
        },
        {
            "rank": 5,
            "college": "Seventh/Eighth",
            "rationale": "Newer facilities and flexible GEs are appealing, but they are further away from main campus areas.",
        },
        {
            "rank": 6,
            "college": "Eleanor Roosevelt (ERC)",
            "rationale": "Strong language requirement suits your interest, but the heavy GEs and distance make it less ideal for managing the rigorous bio curriculum.",
        },
        {
            "rank": 7,
            "college": "Revelle",
            "rationale": "Most rigorous GEs (including calculus/science sequences that can be redundant for a bio major) and older dorms make it the least flexible option, despite its proximity to some science buildings.",
        },
    ]

    ucs_data = {
        "campuses": uc_campuses,
        "ucsdColleges": ucsd_colleges,
        "ucsdGuideUrl": cell_link(ucs_sheet.get(25, {}), "B") or cell_val(ucs_sheet.get(25, {}), "B"),
        "ucsdRecommendedSummary": ucsd_recommended_summary,
        "ucsdSummaryImage": "assets/ucsd_ranking_summary.png",
    }

    # 12. QUESTIONS FOR COLLEEN
    q_sheet = sheets.get("Questions for Colleen", {})
    questions_for_colleen = []
    for r in sorted(q_sheet.keys()):
        if r == 1:
            continue
        q_text = cell_val(q_sheet[r], "A")
        if q_text:
            questions_for_colleen.append({
                "id": f"colleen-q-{r}",
                "question": q_text,
                "answer": cell_val(q_sheet[r], "B"),
                "asked": False,
            })

    # 13. COLLEGE DEADLINES
    dl_sheet = sheets.get("College Deadlines", {})
    college_deadlines = []
    for r in range(2, 22):
        row = dl_sheet.get(r, {})
        if r == 19:
            # Special milestone banner row: "ABOVE ONTRACK to SUBMIT on 04/24"
            continue
        college_name = cell_val(row, "E")
        if not college_name:
            continue
        essays_raw = cell_val(row, "G")
        if essays_raw.endswith(".0"):
            essays_raw = essays_raw[:-2]
        _, h_iso = cell_date_or_text(row, "H")
        _, j_iso = cell_date_or_text(row, "J")
        college_deadlines.append({
            "id": f"cdl-{r}",
            "rowNumber": r,
            "decision": cell_val(row, "A"),
            "decisionBg": cell_bg(row, "A"),
            "acceptDecline": bool(cell_val(row, "B", False)) if isinstance(cell_val(row, "B", False), bool) else str(cell_val(row, "B")) == "True",
            "fafsa": cell_val(row, "C"),
            "submitted": bool(cell_val(row, "D", False)) if isinstance(cell_val(row, "D", False), bool) else str(cell_val(row, "D")) == "True",
            "college": college_name,
            "essayDocUrl": cell_link(row, "E"),
            "appType": cell_val(row, "F"),
            "supplementalEssays": essays_raw,
            "deadline": h_iso or cell_val(row, "H"),
            "deadlineBg": cell_bg(row, "H"),
            "additionalPrograms": cell_val(row, "I"),
            "rdTimeline": j_iso or cell_val(row, "J"),
            "notes": cell_val(row, "K"),
            "notesStrike": cell_strike(row, "K"),
            "portalUrl": cell_link(row, "L") or (cell_val(row, "L") if cell_val(row, "L").startswith("http") else ""),
            "portalText": cell_val(row, "L"),
            "fafsaCode": cell_val(row, "U"),
            "section": "On-Track Group" if r < 19 else "Additional RD Schools",
        })

    uc_decisions = []
    for r in range(23, 32):
        row = dl_sheet.get(r, {})
        campus = cell_val(row, "C")
        if not campus:
            continue
        uc_decisions.append({
            "id": f"uc-dec-{r}",
            "campus": campus,
            "decision": cell_val(row, "A"),
            "decisionBg": cell_bg(row, "A"),
            "decisionStrike": cell_strike(row, "A"),
            "acceptDecline": bool(cell_val(row, "B", False)),
        })

    uc_portals = []
    for r in range(2, 11):
        row = dl_sheet.get(r, {})
        campus = cell_val(row, "P")
        if not campus:
            continue
        uc_portals.append({
            "id": f"uc-portal-{r}",
            "campus": campus,
            "portalUrl": cell_link(row, "Q") or (cell_val(row, "Q") if cell_val(row, "Q").startswith("http") else ""),
            "portalText": cell_val(row, "Q"),
        })

    csu_portals = []
    for r in range(14, 17):
        row = dl_sheet.get(r, {})
        campus = cell_val(row, "P")
        if not campus:
            continue
        csu_portals.append({
            "id": f"csu-portal-{r}",
            "campus": campus,
            "portalUrl": cell_link(row, "Q") or (cell_val(row, "Q") if cell_val(row, "Q").startswith("http") else ""),
            "portalText": cell_val(row, "Q"),
        })

    return {
        "meta": {
            "title": "Ayan's College & Internship Command Center",
            "googleSheetUrl": SHEET_URL,
            "lastSynced": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "milestoneNote": cell_val(dl_sheet.get(19, {}), "A") or "ABOVE ONTRACK to SUBMIT on 04/24",
        },
        "internships": internships,
        "quickDocs": quick_docs,
        "todos": todos,
        "counselors": counselors,
        "majors": majors,
        "collegeCriteria": college_criteria,
        "colleges": colleges,
        "noSupplementalColleges": no_supplemental_colleges,
        "bucketNotes": bucket_notes,
        "diyasNotes": diyas_notes,
        "gpa": gpa_data,
        "ucs": ucs_data,
        "questionsForColleen": questions_for_colleen,
        "collegeDeadlines": {
            "applications": college_deadlines,
            "ucDecisions": uc_decisions,
            "ucPortals": uc_portals,
            "csuPortals": csu_portals,
        },
    }


if __name__ == "__main__":
    data = build_structured_data()
    with open(JSON_OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    with open(JS_OUT, "w", encoding="utf-8") as f:
        f.write("window.INITIAL_APP_DATA = ")
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write(";\n")
    print(f"Successfully wrote {JSON_OUT} and {JS_OUT}")
    print(f"Counts: Internships={len(data['internships'])}, QuickDocs={len(data['quickDocs'])}, "
          f"ToDos={len(data['todos'])}, Majors={len(data['majors'])}, Colleges={len(data['colleges'])}, "
          f"NoSupp={len(data['noSupplementalColleges'])}, GPA_Reg={len(data['gpa']['regular']['courses'])}, "
          f"UCs={len(data['ucs']['campuses'])}, CollegeDeadlines={len(data['collegeDeadlines']['applications'])}")
