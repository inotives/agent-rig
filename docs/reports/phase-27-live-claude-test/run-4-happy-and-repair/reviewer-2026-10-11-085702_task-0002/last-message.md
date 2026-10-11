I recorded `changes_requested` for task-0002 as handoff #2, addressed to the worker. The task is still in `review`.

**Finding:** `greeting.txt` contains `Good morning` with a capital G. The task requires exactly `good morning` in lowercase, followed by a newline. The worker's handoff said `node check-greeting.mjs` passed. I ran it and it exits 1 with "greeting.txt must be exactly: good morning + newline".

Both acceptance criteria fail. The handoff asks the worker to write the lowercase text and rerun the check. It also tells them not to change `check-greeting.mjs`.
