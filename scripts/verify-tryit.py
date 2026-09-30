#!/usr/bin/env python3
"""Run the first <TryIt> of each chapter exactly as written and compare with its <Output>.

usage: python3 scripts/verify-tryit.py [chapter-number ...]

Handles python, c and cpp blocks that run on their own. Shell blocks (Docker, Redis, openssl) and blocks
that need extra packages are listed as SKIPPED: run those by hand and paste what they print. Set
KNOWSYS_PY to a Python that has any packages the blocks import (duckdb, cedarpy, boto3).
Timing lines will differ from run to run; every other line should match.
"""
import difflib, glob, os, re, subprocess, sys, tempfile

PY = os.environ.get("KNOWSYS_PY", "python3")
sel = set(sys.argv[1:])
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for p in sorted(glob.glob(os.path.join(root, "content/chapters/*.mdx"))):
    name = os.path.basename(p)[:-4]; num = name.split("-")[0]
    if sel and num not in sel: continue
    m = re.search(r'<TryIt what="([^"]*)" lang="([a-z]+)"[^>]*>(.*?)</TryIt>', open(p).read(), re.S)
    if not m: continue
    what, lang, body = m.groups()
    out = re.search(r"<Output>\s*```\n(.*?)```\s*</Output>", body, re.S)
    expected = out.group(1) if out else ""
    fences = re.findall(r"```(\w*)\n(.*?)```", re.sub(r"<Output>.*?</Output>", "", body, flags=re.S), re.S)
    if lang not in ("python", "c", "cpp") or len(fences) != 1:
        print(f"{name}: SKIPPED ({lang}, {len(fences)} code blocks): run by hand"); continue
    code = fences[0][1]
    with tempfile.TemporaryDirectory() as d:
        try:
            if lang == "python":
                open(f"{d}/x.py", "w").write(code)
                r = subprocess.run([PY, f"{d}/x.py"], capture_output=True, text=True, cwd=d, timeout=300)
            else:
                src = f"{d}/x.{'c' if lang == 'c' else 'cpp'}"; open(src, "w").write(code)
                cc = ["clang", "-O2"] if lang == "c" else ["clang++", "-std=c++20", "-O2"]
                c = subprocess.run(cc + [src, "-o", f"{d}/x"], capture_output=True, text=True, cwd=d)
                if c.returncode: print(f"{name}: COMPILE FAILED\n{c.stderr[:300]}"); continue
                r = subprocess.run([f"{d}/x"], capture_output=True, text=True, cwd=d, timeout=300)
        except Exception as e:
            print(f"{name}: ERROR {e}"); continue
    exp = [l.rstrip() for l in expected.strip("\n").splitlines()]
    act = [l.rstrip() for l in r.stdout.strip("\n").splitlines()]
    if exp == act: print(f"{name}: identical")
    else:
        print(f"{name}: differs (timing lines are expected to)")
        for l in difflib.unified_diff(exp, act, "printed", "actual", lineterm="", n=0):
            if not l.startswith(("---", "+++", "@@")): print("   ", l[:140])
