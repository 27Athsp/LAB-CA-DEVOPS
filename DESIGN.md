# ClearCSV design

## Direction
Operate mode: a quiet data workbench. Keep the primary upload, inspection and cleaning actions immediately visible. A light paper-like surface, forest-green action color, pale mint cleaning rail, and amber missing cells distinguish actions from problems. No marketing page or unrelated navigation.

## Tokens
- Background: #f7f9f8; content: #ffffff; text: #17231e; muted: #606e67.
- Primary: #22684f; hover: #184e3b; panel: #edf6f0; border: #dce4df.
- Missing: #fff6df with #875d12 text; invalid: #fff0e9 with #a14a20 text.
- Typeface: self-hosted DM Sans Variable; system sans fallback. Main heading 29–42px, section 20px, body 13–17px, data 13px. Tabular numbers.
- 8px panel radius, 6px buttons, 43px primary controls. Thin borders, no decorative shadows.
- Content max width 1320px; desktop main column plus 340px cleaning rail. Stack at 760px; table overflow is contained and focusable. Two-column metrics on small phones.

## Components and states
Header, upload strip, file bar, metrics band, data table with pagination, column quality, cleaning panel and before/after result. Every action has disabled, focus and hover states; file validation has a readable alert. Start empty, offer synthetic sample, highlight missing/invalid values, preserve original data, and invalidate cleaned output when options change.

## Concept
Generated with built-in Image Gen for internal reference. Concept path: C:/Users/Atharva/.codex/generated_images/01a13482-bd56-7422-bb26-75ad27391c02/exec-a83a5041-6efc-4db8-9489-7cc38c85641a.png.
Implementation extensions required for a usable app: pagination, error and empty states, responsive layout, detection-rule disclosure, and before/after results. The reference uses all 10 sample rows visibly; the implementation pages eight rows to bound preview height.
