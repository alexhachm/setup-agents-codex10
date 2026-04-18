# Local Agent Task Queue

Add tasks as GitHub-flavored markdown checkboxes. The dispatcher polls this file
and spawns parallel worker agents for each unchecked item.

## Format

Each task is one bullet line:

```
- [ ] <free-form task description>
```

The dispatcher checks the task off (`- [x]`) after a worker completes it, and
appends a completion note indented below:

```
- [x] <task>
      > done: <short summary> @ <iso timestamp>
```

## Rules

- One task per line. Multi-line tasks are not supported.
- Tasks are identified by exact line text. Do not edit a pending task in place;
  delete it and add a new one.
- Workers run autonomously; do not add tasks that require interactive approval.

## Queue

<!-- Add tasks below this line -->
