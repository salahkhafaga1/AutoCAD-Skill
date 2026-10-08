#!/usr/bin/env python3
"""Lightweight static validation for the Engineering CAD Agent Skill.

Run from anywhere:
    python D:/AI/skill/engineering_agent/tests/validate_skill.py

Checks (no AutoCAD, no network, no MCP connection):
  1. Referenced workflow/rule/template/schema files exist.
  2. Referenced MCP tools exist in autocad-mcp's actual tool registry.
  3. Documented tool parameter names match the actual MCP schemas
     (skill docs AND tool_contracts.md, both against acad_core.py).
  4. Obsolete/forbidden patterns are absent.

Tool schemas are loaded from a sibling autocad-mcp checkout (found by
walking up from the skill root) when acad_core.py can be imported
(pywin32 required). Otherwise the script falls back to the tool headings
in tool_contracts.md, skips parameter checks, and says so.

Skill files are validated with paths relative to the skill root; repo-level
docs (README.md, CHANGELOG.md, docs/) are validated with paths relative to
the repository root.
"""

import importlib.util
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = REPO_ROOT / "skill" / "engineering_agent"


def find_mcp_core():
    """First autocad-mcp checkout found walking up from the skill root."""
    for base in (SKILL_ROOT, *SKILL_ROOT.parents):
        candidate = base / "autocad-mcp" / "autocad_mcp" / "acad_core.py"
        if candidate.exists():
            return candidate
    return SKILL_ROOT / "autocad-mcp" / "autocad_mcp" / "acad_core.py"


MCP_CORE = find_mcp_core()

# Split across string literals on purpose: grepping this directory for the
# complete obsolete names must return ZERO hits, yet the checker still needs
# to match them. Do not "simplify" back to single literals.
FORBIDDEN = [
    "get_entity" + "_by_handle",
    "_AGENT" + "_REGISTRY",
    "capture_screenshot" + "(path",
    "capture_screenshot" + " (path",
    "zoom_extents" + "(space",
    "zoom_extents" + " (space",
    "first 3" + " handles",
]

FILE_REF = re.compile(
    r"\b((?:workflows|rules|templates|schemas|examples)/[A-Za-z0-9_./-]+\.(?:md|json))\b"
)
MODE_REF = re.compile(r"`workflows/([A-Z_]+)\.md`")
INLINE_CALL = re.compile(r"\b([a-z][a-z0-9_]*)\s*\(([^()]*)\)")
TOOL_CONTRACT_SECTION = re.compile(r"^### `([a-z][a-z0-9_]*)`\s*$", re.M)
CONTRACT_PARAM = re.compile(r"^\s*-\s+`([a-z][a-z0-9_]*)`\s*\(", re.M)
# A table cell that contains only backticked snake_case tokens is a tool cell.
TOOL_CELL_FULL = re.compile(r"(?:\s*`[a-z][a-z0-9_]+`\s*,?)+")


def load_real_tools():
    spec = importlib.util.spec_from_file_location("acad_core", MCP_CORE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return {t.name: set(t.inputSchema.get("properties", {})) for t in mod.TOOLS}


def load_fallback_tools():
    """Tool names only, from tool_contracts.md headings (no parameter data)."""
    text = (SKILL_ROOT / "tool_contracts.md").read_text(encoding="utf-8")
    return {name: None for name in TOOL_CONTRACT_SECTION.findall(text)}


def main():
    violations = []
    warnings = []
    md_files = sorted(SKILL_ROOT.rglob("*.md"))

    # Repo-level docs live outside the skill folder; refs are repo-root-based.
    repo_docs = [p for p in (REPO_ROOT / "README.md", REPO_ROOT / "CHANGELOG.md") if p.exists()]
    if (REPO_ROOT / "docs").is_dir():
        repo_docs += sorted((REPO_ROOT / "docs").rglob("*.md"))
    all_md = md_files + repo_docs

    # --- 1. Referenced skill files exist -----------------------------------
    refs_checked = 0
    for md in all_md:
        text = md.read_text(encoding="utf-8")
        for ref in FILE_REF.findall(text):
            refs_checked += 1
            if not ((SKILL_ROOT / ref).exists() or (REPO_ROOT / ref).exists()):
                violations.append(f"{md.name}: missing referenced file `{ref}`")
        for mode in MODE_REF.findall(text):
            refs_checked += 1
            target = SKILL_ROOT / "workflows" / (mode.lower() + ".md")
            if not target.exists():
                violations.append(f"{md.name}: missing workflow `workflows/{mode.lower()}.md`")

    # --- 2 & 3. MCP tools and parameter names ------------------------------
    try:
        tools = load_real_tools()
        tool_source = f"acad_core.py ({len(tools)} registered tools)"
    except Exception as exc:  # pragma: no cover - fallback path
        tools = load_fallback_tools()
        tool_source = f"tool_contracts.md headings ({len(tools)} tools, import failed: {exc})"
        warnings.append("could not import acad_core.py — parameter checks skipped")

    tool_refs_checked = 0
    if tools:
        for md in all_md:
            text = md.read_text(encoding="utf-8")

            # Call sites: name(...) — validate tool names and argument keys.
            for name, args in INLINE_CALL.findall(text):
                if name not in tools:
                    if "_" in name:  # snake_case call target ⇒ looks like an MCP tool
                        violations.append(f"{md.name}: call to unknown tool `{name}`")
                    continue
                props = tools[name]
                if props is None:
                    continue
                for key in re.findall(r"([a-z][a-z0-9_]*)\s*:", args):
                    tool_refs_checked += 1
                    if key not in props:
                        allowed = ", ".join(sorted(props)) or "no parameters"
                        violations.append(
                            f"{md.name}: `{name}(...)` uses unknown parameter `{key}` (allowed: {allowed})"
                        )

            # Line-style calls inside fenced code blocks.
            for block in re.findall(r"```[a-z]*\n(.*?)```", text, re.S):
                current = None
                for raw in block.splitlines():
                    line = raw.strip()
                    head = re.match(r"^([a-z][a-z0-9_]*)\s*(?:\(.*)?$", line)
                    if head and head.group(1) in tools:
                        current = head.group(1)
                        continue
                    kv = re.match(r"^([a-z][a-z0-9_]*)\s*:\s*(.+)$", line)
                    if kv and current and tools[current] is not None:
                        tool_refs_checked += 1
                        key = kv.group(1)
                        if key not in tools[current]:
                            allowed = ", ".join(sorted(tools[current])) or "no parameters"
                            violations.append(
                                f"{md.name}: `{current}` call uses unknown parameter "
                                f"`{key}` (allowed: {allowed})"
                            )

            # Table tool cells: | `tool_a`, `tool_b` |
            for line in text.splitlines():
                if "|" not in line or "`" not in line:
                    continue
                for cell in line.split("|")[1:-1]:
                    if not TOOL_CELL_FULL.fullmatch(cell):
                        continue
                    for name in re.findall(r"`([a-z][a-z0-9_]+)`", cell):
                        tool_refs_checked += 1
                        if name not in tools:
                            violations.append(f"{md.name}: table references unknown tool `{name}`")

    # tool_contracts.md documented params vs. real schemas.
    contract_params_checked = 0
    contracts = (SKILL_ROOT / "tool_contracts.md").read_text(encoding="utf-8")
    if tools and all(v is not None for v in tools.values()):
        for section in re.split(r"(?=^### `)", contracts, flags=re.M):
            head = TOOL_CONTRACT_SECTION.match(section)
            if not head:
                continue
            name = head.group(1)
            if name not in tools:
                violations.append(f"tool_contracts.md: documents unknown tool `{name}`")
                continue
            for param in CONTRACT_PARAM.findall(section):
                contract_params_checked += 1
                if param not in tools[name]:
                    allowed = ", ".join(sorted(tools[name])) or "no parameters"
                    violations.append(
                        f"tool_contracts.md: `{name}` documents unknown parameter "
                        f"`{param}` (allowed: {allowed})"
                    )

    # --- 4. Forbidden patterns ---------------------------------------------
    forbidden_hits = []
    for md in all_md:
        text = md.read_text(encoding="utf-8")
        for pattern in FORBIDDEN:
            count = text.count(pattern)
            if count:
                forbidden_hits.append(f"{md.name}: `{pattern}` x{count}")
                violations.extend(f"{md.name}: forbidden pattern `{pattern}`" for _ in range(count))

    # --- Report -------------------------------------------------------------
    print("== Engineering CAD Agent Skill validation ==")
    print(f"skill root : {SKILL_ROOT}")
    print(f"md files   : {len(md_files)} (skill) + {len(repo_docs)} (repo docs)")
    print(f"[1] referenced files ............ {'OK' if not any('missing referenced' in v for v in violations) else 'FAIL'} ({refs_checked} references)")
    print(f"[2] MCP tool registry ........... {tool_source}")
    print(f"[3] parameter names ............. {contract_params_checked + tool_refs_checked} checked"
          + ("" if tool_source.startswith("acad_core") else " (SKIPPED — degraded mode)"))
    print(f"[4] forbidden patterns .......... {'OK' if not forbidden_hits else 'FAIL'}")
    for hit in forbidden_hits:
        print(f"    {hit}")
    for w in warnings:
        print(f"warning: {w}")
    if violations:
        print(f"\nRESULT: FAIL — {len(violations)} violation(s):")
        for v in violations:
            print(f"  - {v}")
        return 1
    print("\nRESULT: PASS — 0 violations")
    return 0


if __name__ == "__main__":
    sys.exit(main())
