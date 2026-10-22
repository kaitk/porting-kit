# Tasks

Markdown-based task tracking. One file per task, or one folder for a task with
several subtasks or its own supporting files.

## Naming

`NNN-short-slug.md`: a zero-padded, sequential number plus a kebab-case slug, for
example `001-kit-acceptance.md`.

A task with subtasks or supporting files is a folder with the same name,
`NNN-short-slug/`, holding the task itself as `README.md` and one file per subtask as
`NN-short-slug.md`, numbered within the folder. Subtasks use the same format as tasks.

## Format

```markdown
# NNN: Title

Status: todo | in-progress | done | cancelled

Short description of what and why.

## Acceptance criteria

- [ ] Concrete, verifiable outcome
- [ ] ...
```

Update the status line as work progresses; tick criteria as they are met. A cancelled
task says when and why it was cancelled. A task that measures something records the
numbers in its own file, with how they were measured.

## Archive

When a task is done and nothing still builds on its file, move it to `000-archive/` with
`git mv`, keeping its name. The main folder then lists only open work. Numbers stay
unique across both folders: pick the next number after the highest in either. Refer to
tasks by number ("task 001"), not by path, so a move breaks no reference.

## Order

Work that produces the kit's content runs in snowtime-native, the first port, and is
tracked there. The kit's tasks hold what spans ports.

| Open work | Remaining outcome or dependency |
|---|---|
| 001: the kit's acceptance criteria | Initial replay, independent maintenance, reusable content, and later apps/frameworks. |
| 002: the first crate boundary review | Proposed ownership and runtime contracts; maintainer decision before extraction. |
| snowtime-native 081.41: the first crates | The crate boundaries await a second opinion; the store waits on a check against better-auth-rs v1.0.0-alpha.5. |
