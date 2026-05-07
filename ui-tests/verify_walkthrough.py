# -*- coding: utf-8 -*-
"""Verification harness for tasks 5.1 / 5.3 / 5.4 of the
feature-walkthrough-test-report change.

Runs `feature_walkthrough.py` one or more times under different conditions and
asserts the resulting report behaves correctly. Does NOT eyeball the report —
that is task 5.2 (a printed checklist at the end).

Prerequisites (same as feature_walkthrough.py): backend on :8000,
frontend on :5173, Google logged in at http://localhost:5173.

IMPORTANT — login state across phases:
  Phase 5.1 runs the full walkthrough INCLUDING TC-12 (logout), so it logs
  you out at the end. Phases 5.3 and 5.4 patch out TC-12 so they don't,
  but they do require you to be logged in *when they start*. So:

    1. Log in at http://localhost:5173
    2. python ui-tests/verify_walkthrough.py --phase 5.1   # logs you out
    3. Log in again at http://localhost:5173
    4. python ui-tests/verify_walkthrough.py --phase 5.3   # stays logged in
    5. python ui-tests/verify_walkthrough.py --phase 5.4   # stays logged in

  --phase all runs them in order without re-login between 5.3 and 5.4, but
  STILL requires you to log in again after 5.1 — so it pauses and waits.

Exit codes:
  0 — all requested phases passed
  1 — a phase failed; details printed
  2 — script error (e.g. missing files, stale results)
"""
from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).parent
WALKTHROUGH = HERE / "feature_walkthrough.py"
RESULTS = HERE / "feature_walkthrough_results.json"
REPORT = HERE / "feature_walkthrough_report.html"

# Selector swap for 5.3. We anchor on the longer string to target TC-10
# specifically (line ~420), not TC-09's earlier `.dir-input` (line ~385).
INJECT_FROM = '.locator(".dir-input").fill(str(TEMP_NORMALIZE_DIR))'
INJECT_TO = '.locator(".dir-input-VERIFY-INJECTED-FAILURE").fill(str(TEMP_NORMALIZE_DIR))'

# TC-12 logout swap — comment it out of the all_tcs list so 5.3/5.4 don't
# log the user out, allowing back-to-back runs.
LOGOUT_FROM = '            tc_12_logout,\n'
LOGOUT_TO = '            # tc_12_logout,  # patched out by verify_walkthrough.py\n'


# ─── walkthrough invocation with stale-results detection ────────────────────

def _results_mtime() -> float:
    return RESULTS.stat().st_mtime if RESULTS.exists() else 0.0


def run_walkthrough(label: str) -> tuple[int, bool]:
    """Run the walkthrough. Returns (exit_code, fresh_results_written).

    `fresh_results_written` is False if the results file mtime didn't change
    after the run — typically because precondition_check aborted before any
    case ran (e.g. user got logged out).
    """
    before = _results_mtime()
    print(f"\n[{label}] running: python {WALKTHROUGH.name} ...", flush=True)
    t0 = time.monotonic()
    proc = subprocess.run(
        [sys.executable, str(WALKTHROUGH)],
        cwd=str(HERE.parent),
    )
    elapsed = time.monotonic() - t0
    after = _results_mtime()
    fresh = after > before
    print(f"[{label}] walkthrough exited {proc.returncode} in {elapsed:.0f}s "
          f"(results {'rewritten' if fresh else 'NOT rewritten'})", flush=True)
    return proc.returncode, fresh


def precondition_failure_message(label: str) -> str:
    return (
        f"\n[{label} ABORT] the walkthrough exited without writing fresh results.\n"
        f"  Most likely cause: you're not logged in at http://localhost:5173\n"
        f"  (a previous phase may have run TC-12 logout — phase 5.1 always does this).\n"
        f"  Action: log in again at http://localhost:5173, then re-run this phase.\n"
    )


def load_results() -> list[dict]:
    if not RESULTS.exists():
        raise FileNotFoundError(f"results file not written: {RESULTS}")
    return json.loads(RESULTS.read_text(encoding="utf-8"))


def case_passed(case: dict) -> bool:
    return (all(s["status"] == "PASS" for s in case["steps"])
            and len(case["steps"]) >= case["min_steps"])


def fmt_summary(cases: list[dict]) -> str:
    rows = []
    for c in cases:
        status = "PASS" if case_passed(c) else "FAIL"
        n_fail = sum(1 for s in c["steps"] if s["status"] == "FAIL")
        rows.append(f"  {c['id']:8s} {status:4s}  steps={len(c['steps']):2d}/{c['min_steps']:2d}  fail_steps={n_fail}")
    return "\n".join(rows)


# ─── source patching ────────────────────────────────────────────────────────

def apply_patches(patches: list[tuple[str, str, str]]) -> None:
    """Apply a list of (label, from_str, to_str) substitutions atomically.

    Each substitution must match exactly once in the current file.
    Raises RuntimeError if any from_str is missing or its to_str is already
    present (would indicate a leftover patch from a previous failed run).
    """
    src = WALKTHROUGH.read_text(encoding="utf-8")
    for label, fr, to in patches:
        if to in src:
            raise RuntimeError(
                f"patch {label!r}: target {to!r} already present — "
                "previous run may not have reverted cleanly. "
                "Restore feature_walkthrough.py from git, then re-run."
            )
        if src.count(fr) != 1:
            raise RuntimeError(
                f"patch {label!r}: expected exactly 1 occurrence of {fr!r}, "
                f"found {src.count(fr)}"
            )
        src = src.replace(fr, to)
        print(f"  [patch] {label}: {fr!r} -> {to!r}")
    WALKTHROUGH.write_text(src, encoding="utf-8")


def revert_patches(patches: list[tuple[str, str, str]]) -> None:
    """Reverse the substitutions. Tolerates partial state (label-by-label)."""
    src = WALKTHROUGH.read_text(encoding="utf-8")
    for label, fr, to in patches:
        if to in src:
            src = src.replace(to, fr, 1)
            print(f"  [revert] {label}: {to!r} -> {fr!r}")
    WALKTHROUGH.write_text(src, encoding="utf-8")
    final = WALKTHROUGH.read_text(encoding="utf-8")
    leftover = [label for label, _fr, to in patches if to in final]
    if leftover:
        print(f"  [WARN] revert incomplete; leftover patches: {leftover}. "
              "Inspect feature_walkthrough.py and use git to restore if needed.")


# ─── phases ─────────────────────────────────────────────────────────────────

def phase_5_1() -> bool:
    """Smoke: run once unmodified, expect exit 0 and an all-PASS report."""
    print("\n" + "=" * 70)
    print("PHASE 5.1 — smoke run (full 12 TCs including logout)")
    print("=" * 70)
    rc, fresh = run_walkthrough("5.1")
    if not fresh:
        print(precondition_failure_message("5.1"))
        return False
    cases = load_results()
    print(f"[5.1] cases attempted: {len(cases)}")
    print(fmt_summary(cases))
    n_pass = sum(1 for c in cases if case_passed(c))
    if rc != 0:
        print(f"[5.1 FAIL] expected exit 0, got {rc} (some cases failed)")
        return False
    if n_pass != len(cases):
        print(f"[5.1 FAIL] {n_pass}/{len(cases)} cases passed (want all)")
        return False
    print(f"[5.1 PASS] {n_pass}/{len(cases)} cases passed; report at {REPORT}")
    print("[5.1 NOTE] TC-12 just logged you out. Re-login at "
          "http://localhost:5173 before running 5.3 / 5.4.")
    return True


def phase_5_3() -> bool:
    """Inject a deliberate selector failure in TC-10, run, verify, revert.

    Also patches out TC-12 so this phase doesn't log the user out (lets 5.4
    run immediately afterwards without a re-login dance).
    """
    print("\n" + "=" * 70)
    print("PHASE 5.3 — deliberate failure injection (TC-10 selector swap)")
    print("=" * 70)
    patches = [
        ("dir-input selector swap (TC-10 only)", INJECT_FROM, INJECT_TO),
        ("skip TC-12 logout", LOGOUT_FROM, LOGOUT_TO),
    ]
    try:
        apply_patches(patches)
    except RuntimeError as e:
        print(f"[5.3 FAIL] {e}")
        return False

    try:
        rc, fresh = run_walkthrough("5.3")
        if not fresh:
            print(precondition_failure_message("5.3"))
            return False
        cases = load_results()
        print(f"[5.3] cases attempted: {len(cases)}")
        print(fmt_summary(cases))

        # With TC-12 patched out, we expect 11 cases (TC-01..TC-11).
        # TC-10 should have FAIL steps. Other cases should still have run.
        ok = True
        if rc == 0:
            print("[5.3 FAIL] expected non-zero exit (injected failure should fail TC-10)")
            ok = False
        if len(cases) != 11:
            print(f"[5.3 FAIL] expected 11 cases (TC-12 patched out), got {len(cases)}")
            ok = False
        tc10 = next((c for c in cases if c["id"] == "TC-10"), None)
        if tc10 is None:
            print("[5.3 FAIL] TC-10 missing from results")
            ok = False
        else:
            tc10_fails = sum(1 for s in tc10["steps"] if s["status"] == "FAIL")
            if tc10_fails < 1:
                print(f"[5.3 FAIL] TC-10 has {tc10_fails} FAIL steps (want ≥1)")
                ok = False
            if len(tc10["steps"]) < 2:
                print(f"[5.3 FAIL] TC-10 only recorded {len(tc10['steps'])} steps "
                      "(case aborted on first failure?)")
                ok = False
            else:
                print(f"[5.3] TC-10 recorded {len(tc10['steps'])} steps "
                      f"({tc10_fails} failed) — case continued past failure ✓")
        other_passed = [c["id"] for c in cases if c["id"] != "TC-10" and case_passed(c)]
        if not other_passed:
            print("[5.3 FAIL] no non-TC-10 case passed — injection poisoned the whole run")
            ok = False
        else:
            print(f"[5.3] other cases that still passed ({len(other_passed)}): {', '.join(other_passed)}")

        if ok:
            print("[5.3 PASS] failure flagged red, case continued, other cases unaffected")
        return ok
    finally:
        revert_patches(patches)


def phase_5_4() -> bool:
    """Run twice back-to-back; both runs must produce a PASS-overall report.

    Patches out TC-12 so run-1's logout doesn't break run-2's precondition.
    """
    print("\n" + "=" * 70)
    print("PHASE 5.4 — back-to-back re-run (TC-12 patched out for both)")
    print("=" * 70)
    patches = [("skip TC-12 logout", LOGOUT_FROM, LOGOUT_TO)]
    try:
        apply_patches(patches)
    except RuntimeError as e:
        print(f"[5.4 FAIL] {e}")
        return False

    try:
        results = []
        for label in ("5.4 run-1", "5.4 run-2"):
            rc, fresh = run_walkthrough(label)
            if not fresh:
                print(precondition_failure_message(label))
                return False
            cases = load_results()
            n_pass = sum(1 for c in cases if case_passed(c))
            print(f"[{label}] {n_pass}/{len(cases)} passed (exit {rc})")
            print(fmt_summary(cases))
            results.append((label, rc, n_pass, len(cases)))

        ok = True
        for label, rc, n_pass, n_total in results:
            if rc != 0 or n_pass != n_total:
                print(f"[5.4 FAIL] {label}: rc={rc} pass={n_pass}/{n_total}")
                ok = False
        if ok:
            print("[5.4 PASS] both runs PASS overall — re-running is idempotent")
        return ok
    finally:
        revert_patches(patches)


CHECKLIST_5_2 = """
============================================================
PHASE 5.2 — manual visual verification (do this in a browser)
============================================================
Open the report:
  {report}

Tick each item:
  [ ] All 12 TC sections are present (TC-01 .. TC-12)
  [ ] Each TC has at least its declared min_steps screenshots
  [ ] Each step's Chinese narration above the image matches what
      the image shows (no "click X" narration above an image of Y)
  [ ] PASS cases are collapsed by default; any FAIL case is open
      with a red border and an error excerpt under the failing step
  [ ] Header summary shows "N / 12 通過 (X%)" with correct numbers
  [ ] Clicking any screenshot opens it full-size in a new tab
  [ ] Footer shows the run timestamp
""".strip()


# ─── main ────────────────────────────────────────────────────────────────────

def _wait_for_relogin(after_phase: str) -> None:
    print(f"\n[--phase all] {after_phase} just ran TC-12 (logout). "
          "Please re-login at http://localhost:5173, then press Enter to continue.",
          flush=True)
    try:
        input()
    except EOFError:
        pass


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--phase", choices=["5.1", "5.3", "5.4", "all"], default="all")
    args = ap.parse_args()

    if not WALKTHROUGH.exists():
        print(f"[error] cannot find {WALKTHROUGH}", file=sys.stderr)
        return 2

    phases = {"5.1": phase_5_1, "5.3": phase_5_3, "5.4": phase_5_4}
    selected = list(phases) if args.phase == "all" else [args.phase]

    results: dict[str, bool] = {}
    for i, name in enumerate(selected):
        # If a previous phase was 5.1, it logged us out — pause and let user re-auth.
        if i > 0 and selected[i - 1] == "5.1":
            _wait_for_relogin("5.1")
        results[name] = phases[name]()

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    for name, ok in results.items():
        print(f"  {name}  {'PASS' if ok else 'FAIL'}")

    print(CHECKLIST_5_2.format(report=REPORT))

    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
