# Career Diagram

Source: the user's October 2026 revisions, “整理四次咨询纪要”, and “梳理个人高光与优势”.

The standalone diagram was authored with the installed Diagram Design skill. It uses flowchart grammar, a content-fit 720 × 1968 portrait frame, nine action/decision nodes and ten connections. October and November remain separate; December–January, April–May and June–August are combined only in the overview. Every month remains separate in the complete workbench table. Both work-time and after-work tracks run throughout.

## Appearance

The user explicitly requested the existing Master Board appearance instead of TP purple. Tokens come from the checked-out platform's `index.html`, not a new remote onboarding operation.

| Role | Value | Source |
| --- | --- | --- |
| paper | #e9e3d3 | Existing background |
| paper-2 | #f7f2e4 | Existing panel |
| surface | #fffdf4 | Existing secondary panel |
| ink | #33312a | Existing primary ink |
| ink-strong | #33312a | Existing primary ink |
| muted / soft | #68614f | Darkened secondary text for legibility |
| rule | #ddd5c0 | Existing divider |
| rule-solid | #b3aa90 | Existing strong divider |
| accent | #2f7d3c | Existing green |
| accent-tint | #edf1e4 | Derived light green surface |
| link | #276a35 | Accessible green link |

The existing app keeps its packaged Fusion Pixel family. The standalone diagram uses system CJK faces for readable offline export: PingFang SC / Microsoft YaHei for names and descriptions, Songti SC for the title, system mono for dates. These are disclosed fallbacks, not an exact reproduction of the custom pixel font. The diagram has no shadows, remote fonts or runtime scripts. Palette/typography preference follows the user's site reference.

## Progress

The roadmap is in `data/career-plan.json`; progress is a separate field-timestamp document in `data/career-progress.json`. Browser edits save immediately under `mb.career.progress.v1`. “同步进度” reuses the existing platform's GitHub configuration and merges each field against the remote file; it never rewrites schedule data. The UI explicitly notes that sync writes progress/notes into the configured repository. No API or GitHub credentials are bundled in this module or exported backups.

Completion is derived only from the user's selected “已验收” state. No project, skill or outcome is pre-marked as completed. References to Candy describe shared capacity and business understanding rather than a complete handoff.
