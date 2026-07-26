import os, re, json

ROOT = "/home/claude/work/music-site-main"

EXCLUDE_NAMES = {"template.html", "404.html", "coming-soon.html"}
EXCLUDE_DIRS = {"includes", ".git"}

LANG_LABELS = {"telugu": "Telugu", "hindi": "Hindi", "tamil": "Tamil", "english": "English"}
CATEGORY_LABELS = {
    "heroes": "Heroes", "singers": "Singers", "music-directors": "Music Directors",
    "lyricists": "Lyricists", "moods": "Moods", "decades": "Decades",
}

CURRENT_RE = re.compile(r'<span class="current">(.*?)</span>', re.S)
TITLE_RE = re.compile(r'<title>(.*?)</title>', re.S)
H1_RE = re.compile(r'<h1>(.*?)</h1>', re.S)

def clean(text):
    text = re.sub(r"<[^>]+>", "", text or "")
    text = re.sub(r"&rsaquo;|&#8250;", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

entries = []
seen_hrefs = set()

for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
    for fname in filenames:
        if not fname.endswith(".html"):
            continue
        if fname in EXCLUDE_NAMES:
            continue
        full = os.path.join(dirpath, fname)
        rel = os.path.relpath(full, ROOT).replace(os.sep, "/")

        with open(full, encoding="utf-8", errors="ignore") as f:
            content = f.read()

        if not content.strip():
            continue  # skip still-empty placeholder pages

        m = CURRENT_RE.search(content)
        if m:
            name = clean(m.group(1))
        else:
            m2 = H1_RE.search(content)
            if m2:
                name = clean(m2.group(1))
            else:
                m3 = TITLE_RE.search(content)
                name = clean(m3.group(1)).split("|")[0].strip() if m3 else fname

        parts = rel.split("/")
        lang = LANG_LABELS.get(parts[0]) if len(parts) > 1 else None
        cat = CATEGORY_LABELS.get(parts[1]) if len(parts) > 2 else None

        if fname == "index.html":
            if len(parts) == 2:
                # language hub, e.g. telugu/index.html
                subtitle = ""
                if not name or name.lower().startswith("home"):
                    name = f"{lang} Home"
            elif len(parts) == 3:
                # category index, e.g. telugu/singers/index.html
                subtitle = lang or ""
                name = f"{lang} {cat}".strip()
            else:
                subtitle = " \u00b7 ".join(filter(None, [lang]))
        else:
            subtitle = " \u00b7 ".join(filter(None, [lang, cat]))

        href = "/" + rel
        if href in seen_hrefs:
            continue
        seen_hrefs.add(href)

        entries.append({"name": name, "href": href, "subtitle": subtitle})

# Static top-level pages (non-language)
for fname, name in [
    ("about.html", "About Us"),
    ("contact.html", "Contact Us"),
    ("privacy-policy.html", "Privacy Policy"),
    ("terms-of-use.html", "Terms of Use"),
    ("disclaimer.html", "Disclaimer"),
]:
    href = "/" + fname
    if href not in seen_hrefs and os.path.exists(os.path.join(ROOT, fname)):
        entries.append({"name": name, "href": href, "subtitle": "Site"})
        seen_hrefs.add(href)

entries.sort(key=lambda e: (e["subtitle"], e["name"]))

with open(os.path.join(ROOT, "search-index.json"), "w", encoding="utf-8") as f:
    json.dump(entries, f, ensure_ascii=False, indent=2)

print("total entries:", len(entries))
for e in entries[:15]:
    print(e)
