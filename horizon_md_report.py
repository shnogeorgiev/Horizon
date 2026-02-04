#!/usr/bin/env python3
"""
Horizon JSON -> Single-file HTB-style Markdown exporter
Author: Antares / Vergil pipeline

This file is intentionally rigid.
Do NOT refactor unless you understand the reporting contract.
"""

from __future__ import annotations
import argparse, json, re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# -------------------------
# Helpers
# -------------------------
def latex_escape(s: str) -> str:
    return (
        s.replace("&", r"\&")
         .replace("%", r"\%")
         .replace("#", r"\#")
         #.replace("\\", r"\textbackslash{}")
         .replace("$", r"\$")
         .replace("_", r"\_")
         .replace("{", r"\{")
         .replace("}", r"\}")
         #.replace("~", r"\textasciitilde{}")
         #.replace("^", r"\textasciicircum{}")
    )

def render_cwe(cwe_value: str) -> str:
    if not cwe_value:
        return ""

    if isinstance(cwe_value, str):
        m = re.search(r"/definitions/(\d+)\.html", cwe_value)
        if m:
            num = m.group(1)
            return f"**CWE Link:** [CWE-{num}]({cwe_value})\n\n"

    return ""

def latex_fullwidth_table(headers, rows):
    out = ""
    out += "```{=latex}\n"
    out += (
        "\\begin{tabular*}{\\textwidth}"
        "{@{\\extracolsep{\\fill}} "
        + " ".join(["l"] * len(headers)) +
        "}\n"
    )
    out += "\\hline\n"

    out += " & ".join(
        f"\\textbf{{{latex_escape(h)}}}" for h in headers
    ) + " \\\\\n"

    out += "\\hline\n"

    for row in rows:
        out += " & ".join(
            latex_escape(str(c)) for c in row
        ) + " \\\\\n"

    out += "\\hline\n"
    out += "\\end{tabular*}\n"
    out += "```\n"

    return out

def _s(v: Any) -> str:
    if v is None:
        return ""
    return str(v)

def md_escape(v: Any) -> str:
    s = _s(v)
    if not s:
        return ""
    s = s.replace("\\", "\\textbackslash{}")
    s = s.replace("|", "\\|")
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = s.replace("\n", "<br>")
    return s

def compact_cell(v: Any, max_len: int = 70) -> str:
    s = _s(v).strip()
    if not s:
        return ""
    first = s.split("\n", 1)[0]
    if len(first) > max_len:
        first = first[: max_len - 1] + "…"
    return md_escape(first)

def safe_title(v: Any, fallback: str) -> str:
    t = _s(v).strip()
    return t if t else fallback

def md_h(title: str, level: int) -> str:
    return f"{'#' * level} {title}\n\n"

def md_table(headers: List[str], rows: List[List[str]]) -> str:
    out = "| " + " | ".join(headers) + " |\n"
    out += "| " + " | ".join(["---"] * len(headers)) + " |\n"
    for r in rows:
        out += "| " + " | ".join(r) + " |\n"
    return out + "\n"

def md_kv(label: str, value: Any) -> str:
    if not _s(value).strip():
        return ""
    return f"**{label}:** {value}\n\n"

def md_block(label: str, value: Any) -> str:
    v = _s(value).strip()
    if not v:
        return ""
    return f"**{label}:**\n\n{v}\n\n"

def md_code_block(label: str, value: Any) -> str:
    v = _s(value).strip()
    if not v:
        return ""
    return f"**{label}:**\n\n```text\n{v}\n```\n\n"


def try_float(v: Any) -> Optional[float]:
    try:
        return float(_s(v))
    except Exception:
        return None

# -------------------------
# Data model
# -------------------------

@dataclass
class Node:
    id: str
    type: str
    data: Dict[str, Any]

def load_nodes(path: Path) -> List[Node]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    nodes = []
    for n in raw.get("nodes", []):
        nodes.append(Node(
            id=_s(n.get("id")),
            type=_s(n.get("type")).lower(),
            data=n.get("data") or {}
        ))
    return nodes

# -------------------------
# Core exporters
# -------------------------

def export_engagement_overview() -> str:
    return r"""
\newpage
# Engagement Overview
## Confidentiality Notice

This document contains sensitive security information and is intended solely for authorized recipients.

**Unauthorized disclosure, distribution, or use of the contents of this report is prohibited.**

All findings and data are provided exclusively for the purpose of this assessment.

---

## Disclaimer

This report represents a point-in-time assessment based on the information and access available during the engagement.

**Absence of evidence is not evidence of absence: systems not tested may still contain vulnerabilities.**

Security posture may change over time due to configuration changes, patching, or emerging threats.

***

## Methodology

**Testing followed a structured, operator-driven approach:**

1. External and internal enumeration of hosts, services, and applications
2. Vulnerability identification and validation through controlled exploitation
3. Post-exploitation enumeration to identify lateral movement paths and privilege escalation opportunities
4. Evidence collection (screenshots + terminal logs) to support reproducibility
5. Consolidation of findings into an attack chain narrative and remediation guidance

---
""".lstrip()

def export_artifacts_overview() -> str:
    return r"""
The following artifacts were created as a direct and intentional result of controlled security testing activities conducted during this engagement. 
These artifacts may include, but are not limited to, temporary files, modified configurations, injected payloads, test credentials, web shells, database entries, 
or other changes introduced solely to validate the presence and impact of identified security weaknesses.

All artifacts are documented in good faith to assist defenders, system administrators, and security personnel 
in accurately identifying, reviewing, and fully removing any residual test-related changes from the environment. 
Proper cleanup is a critical final step in restoring affected systems to their intended operational and security baseline.

**Failure to identify and remove testing artifacts may introduce unintended risk.** 

Residual artifacts can be abused by malicious actors to regain access, escalate privileges, bypass security controls, or establish persistent footholds long after the conclusion of the assessment. 
In some cases, leftover test files or credentials may be indistinguishable from genuine attacker artifacts, complicating incident response, forensic analysis, and future security investigations.

It is therefore **strongly recommended that all listed artifacts be carefully reviewed, validated, and removed where appropriate**, 
and that affected systems be revalidated to confirm that no unauthorized access paths or security regressions remain as a result of the testing activities.

***

""".lstrip()

def export_chain_of_compromise_overview() -> str:
    return r"""

The Chain of Compromise captures the **identified minimal, coherent path** an external,
unauthenticated adversary could traverse to achieve full compromise of the environment.

This section **intentionally excludes vulnerabilities not directly required to achieve the
final objective**, as well as exploratory or unsuccessful testing activities. Only findings
that were directly leveraged to advance attacker access or privilege are included.

All other identified issues are reported separately. This isolation of the effective attack
path provides a **high-signal view of critical control failures**, enabling accurate risk
assessment and remediation prioritization.

***

""".lstrip()

def export_summary_of_findings(vulns: List[Node]) -> str:
    out = "\n\\newpage\n# Summary of Findings\n"
    if not vulns:
        return out + "_No findings identified._\n\n"

    buckets = {"Critical":0,"High":0,"Medium":0,"Low":0,"Info":0}
    for v in vulns:
        cvss = try_float(v.data.get("cvss"))
        sev = _s(v.data.get("severity")).lower()
        if cvss is not None:
            if cvss >= 9: buckets["Critical"] += 1
            elif cvss >= 7: buckets["High"] += 1
            elif cvss >= 4: buckets["Medium"] += 1
            elif cvss > 0: buckets["Low"] += 1
            else: buckets["Info"] += 1
        else:
            if "critical" in sev: buckets["Critical"] +=1
            elif "high" in sev: buckets["High"] += 1
            elif "medium" in sev: buckets["Medium"] += 1
            elif "low" in sev: buckets["Low"] += 1
            else: buckets["Info"] += 1

    out += "## Finding Severity\n"
    out += latex_fullwidth_table(
        ["Critical","High","Medium","Low","Info"],
        [[str(buckets[k]) for k in ["Critical","High","Medium","Low","Info"]]]
    )

    ordered = sorted(
        vulns,
        key=lambda v: -(try_float(v.data.get("cvss")) or -1)
    )

    rows = []
    for i,v in enumerate(ordered,1):
        rows.append([
            str(i),
            md_escape(v.data.get("cvss")),
            md_escape(v.data.get("severity") or "Unknown"),
            md_escape(safe_title(v.data.get("type"), "Finding"))
        ])

    out += "## Finding List (CVSS Ordered)\n"
    out += latex_fullwidth_table(["#","CVSS","Severity","Finding Name"], rows)
    return out

from pathlib import Path

EVIDENCE_DIR = Path("Evidence")
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".pdf"}

def export_technical_findings(vulns: List[Node]) -> str:
    if not vulns:
        return ""

    out = "\\newpage\n# Technical Findings Details\n"

    ordered = sorted(
        vulns,
        key=lambda v: -(try_float(v.data.get("cvss")) or -1)
    )

    for i, v in enumerate(ordered):
        if i > 0:
            out += "\\newpage\n"

        d = v.data
        title = safe_title(d.get("type"), "Finding")

        out += md_h(
            f"{title} (CVSS: {d.get('cvss')} / Severity: {d.get('severity')})",
            2
        )

        out += md_kv("CVE", d.get("cve"))
        out += render_cwe(d.get("cwe"))
        out += md_block("Affected", d.get("affected"))
        out += md_block("Description", d.get("description"))

        # ---- Evidence (fixed-size, page-safe) ----
        evidence = _s(d.get("evidence")).strip()
        if evidence:
            out += "**Evidence:**\n\n"
            out += (
                "```{=latex}\n"
                "\\IfFileExists{Evidence/" + evidence + "}{%\n"
                "  \\begin{center}\n"
                "  \\includegraphics[width=0.85\\linewidth,height=0.45\\textheight,keepaspectratio]{Evidence/" + evidence + "}\n"
                "  \\end{center}\n"
                "}{%\n"
                "  \\textit{This finding did not require supporting evidence beyond validation during testing.}\n"
                "}\n"
                "```\n\n"
            )
        # -----------------------------------------

        out += md_block("Impact", d.get("impact"))
        out += md_code_block("Exploit / Reproduction", d.get("exploit"))
        out += md_block("Remediation", d.get("remediation"))
        out += "\n\n"

    return out


def export_appendices(hosts, creds, hashes, flags, webs, sqls, zones) -> str:
    out = "\\newpage\n# Appendices\n"

    appendix_ord = ord("A")

    def next_label() -> str:
        nonlocal appendix_ord
        label = chr(appendix_ord)
        appendix_ord += 1
        return label

    # =====================================================
    # Appendix A — Severities (ALWAYS PRESENT)
    # =====================================================
    label = next_label()
    out += f"\n## Appendix {label} - Severity Ratings Explained\n\n"
    out += (
        "Each finding has been assigned a severity rating based on the "
        "potential business impact and the likelihood of exploitation. "
        "The table below explains each severity level in non-technical terms.\n\n"
    )

    out += latex_fullwidth_table(
        ["Severity", "Description"],
        [
            [
                "Critical",
                "Immediate risk of full system or domain compromise with no meaningful barriers to exploitation.",
            ],
            [
                "High",
                "Serious security weakness that allows attackers to gain significant control or sensitive data.",
            ],
            [
                "Medium",
                "Exploitable weakness that may require additional conditions or user interaction.",
            ],
            [
                "Low",
                "Limited impact issue or defense-in-depth gap with minimal exploitation value on its own.",
            ],
            [
                "Info",
                "Informational finding that does not directly pose a security risk but may aid attackers.",
            ],
        ],
    )

    # =====================================================
    # Summary of Identified Objects (ALWAYS PRESENT)
    # =====================================================
    label = next_label()
    out += f"\n## Appendix {label} - Summary of Identified Objects\n"

    out += (
        "```{=latex}\n"
        "\\begin{tabular*}{\\textwidth}{@{\\extracolsep{\\fill}} l r}\n"
        "\\hline\n"
        "\\textbf{Object Type} & \\textbf{Count} \\\\\n"
        "\\hline\n"
    )

    rows = [
        ("Hosts", hosts),
        ("Credentials", creds),
        ("Hashes", hashes),
        ("Flags", flags),
        ("Web", webs),
        ("SQL", sqls),
        ("Zones", zones),
    ]

    for name, collection in rows:
        out += f"{name} & {len(collection)} \\\\\n"

    out += (
        "\\hline\n"
        "\\end{tabular*}\n"
        "```\n"
    )


    # =====================================================
    # Exploited Hosts
    # =====================================================
    if hosts:
        label = next_label()
        out += f"\\newpage\n## Appendix {label} - Exploited Hosts\n"
        rows = []
        for i, h in enumerate(hosts, 1):
            d = h.data
            rows.append([
                str(i),
                md_escape(d.get("hostname")),
                md_escape(d.get("os")),
                compact_cell(d.get("network"))
            ])
        out += latex_fullwidth_table(["#", "Hostname", "OS", "Network"], rows)

    # =====================================================
    # Exploited Infrastructure
    # =====================================================
    if webs or sqls:
        label = next_label()
        out += f"\\newpage\n## Appendix {label} - Exploited Infrastructure\n"
        rows = []

        for w in webs:
            d = w.data
            rows.append([
                str(len(rows) + 1),
                "WEB",
                md_escape(d.get("hostname") or d.get("url")),
                md_escape(d.get("ip"))
            ])

        for s in sqls:
            d = s.data
            rows.append([
                str(len(rows) + 1),
                "SQL",
                md_escape(d.get("hostname")),
                md_escape(d.get("ip")),
                compact_cell(d.get("type"))
            ])

        out += latex_fullwidth_table(["#", "Type", "Name", "IP"], rows)

    # =====================================================
    # Credentials Summary
    # =====================================================
    if creds:
        label = next_label()
        out += f"\\newpage\n## Appendix {label} - Credentials Summary\n"
        rows = []
        for i, c in enumerate(creds, 1):
            d = c.data
            rows.append([
                str(i),
                md_escape(d.get("privilege")),
                md_escape(d.get("username")),
                md_escape(d.get("password")),
            ])
        out += latex_fullwidth_table(
            ["#", "Privilege", "Username", "Password"],
            rows,
        )

    # =====================================================
    # Hashes Summary
    # =====================================================
    if hashes:
        label = next_label()
        out += f"\\newpage\n## Appendix {label} - Hashes Summary\n"
        rows = []
        for i, h in enumerate(hashes, 1):
            d = h.data
            rows.append([
                str(i),
                md_escape(d.get("type")),
                md_escape(d.get("algorithm")),
                "Yes" if d.get("password") else "No",
                md_escape(d.get("target")),
                compact_cell(d.get("source")),
            ])
        out += latex_fullwidth_table(
            ["#", "Type", "Algorithm", "Cracked", "Target", "Source"],
            rows,
        )

    # =====================================================
    # Flags Captured
    # =====================================================
    if flags:
        label = next_label()
        out += f"\\newpage\n## Appendix {label} - Flags Captured\n"
        rows = []
        for i, f in enumerate(flags, 1):
            d = f.data
            rows.append([
                str(i),
                md_escape(d.get("value")),
                compact_cell(d.get("source")),
            ])
        out += latex_fullwidth_table(["#", "Flag", "Source"], rows)

    return out

def export_artifacts_cleanup(artifacts: List[Node]) -> str:
    if not artifacts:
        return ""

    out = "\n\\newpage\n# Artifacts / Cleanup\n\n"

    out += export_artifacts_overview()

    for a in artifacts:
        d = a.data

        title_parts = []
        if _s(d.get("type")).strip():
            title_parts.append(_s(d.get("type")).strip())
        if _s(d.get("location")).strip():
            title_parts.append(_s(d.get("location")).strip())

        title = " - ".join(title_parts) if title_parts else "Unnamed Artifact"
        out += f"\n\\newpage\n## Artifact: {md_escape(title)}\n\n"

        out += md_block("Type", d.get("type"))
        out += md_block("Location", d.get("location"))
        out += md_block("Purpose", d.get("purpose"))
        out += md_block("Cleanup", d.get("cleanup"))
                # ---- Evidence (fixed-size, page-safe) ----
        evidence = _s(d.get("evidence")).strip()
        if evidence:
            out += "**Evidence:**\n\n"
            out += (
                "```{=latex}\n"
                "\\IfFileExists{Evidence/" + evidence + "}{%\n"
                "  \\begin{center}\n"
                "  \\includegraphics[width=0.85\\linewidth,height=0.45\\textheight,keepaspectratio]{Evidence/" + evidence + "}\n"
                "  \\end{center}\n"
                "}{%\n"
                "  \\textit{This artifact did not require supporting evidence beyond validation during testing.}\n"
                "}\n"
                "```\n\n"
            )
        # -----------------------------------------
        out += md_kv("Created By", d.get("created_by"))
        out += md_block("Notes", d.get("notes"))

        out += "\n\n"

    return out

# -------------------------
# Build report
# -------------------------

def build_report(hosts, vulns, creds, hashes, artifacts, flags, webs, sqls, zones) -> str:
    out = ""
    # Metadata
    out += "---\nheader-includes:\n- \\usepackage{graphicx}\n---\n"
    out += "---\ntitle: Penetration Test Report\nauthor: Petar Georgiev\ndate: 2025-12-13\n---"

    # 1. Engagement Overview (Boilerplate)
    out += "\n"
    out += export_engagement_overview()
    
    # 2. Summary of Findings
    out += export_summary_of_findings(vulns)
    
    # 3. Executive Summary
    out += "\\newpage\n# Executive Summary\nPLACEHOLDER FOR ANTARES\n\n"

    # 4. Chain of Compromise
    out += "\\newpage\n# Chain of Compromise\n"
    out += export_chain_of_compromise_overview()
    out += "PLACEHOLDER FOR ANTARES\n\n"

    # 5. Remediation Summary
    out += "\\newpage\n# Remediation Summary\nPLACEHOLDER FOR ANTARES\n\n"
    
    # 6. Appendices
    out += export_technical_findings(vulns)
    out += export_appendices(hosts, creds, hashes, flags, webs, sqls, zones)
    out += export_artifacts_cleanup(artifacts)
    return re.sub(r"\n{3,}", "\n\n", out)

# -------------------------
# Main
# -------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("json", type=Path)
    ap.add_argument("--out", type=Path, default=Path("horizon_report.md"))
    args = ap.parse_args()

    nodes = load_nodes(args.json)
    hosts=[n for n in nodes if n.type=="host"]
    vulns=[n for n in nodes if n.type=="vuln"]
    creds=[n for n in nodes if n.type=="credential"]
    hashes=[n for n in nodes if n.type=="hash"]
    artifacts=[n for n in nodes if n.type=="artifact"]
    flags=[n for n in nodes if n.type=="flag"]
    webs=[n for n in nodes if n.type=="webapp"]
    sqls=[n for n in nodes if n.type=="database"]
    zones=[n for n in nodes if n.type=="zone"]

    report = build_report(hosts,vulns,creds,hashes,artifacts,flags,webs,sqls,zones)
    args.out.write_text(report, encoding="utf-8")
    print(f"Wrote {args.out}")

if __name__ == "__main__":
    main()
