# MPP fixtures

These real Microsoft Project files come from MPXJ, commit
`e7e39898bece864bbc293005a4f3b9a052f09e23` (LGPL-2.1-or-later).
Copyright Packwood Software; license included as `LICENSE`.
Upstream: https://github.com/joniles/mpxj/tree/e7e39898bece864bbc293005a4f3b9a052f09e23/junit/data

| Local name | Upstream path under `junit/data/` | Purpose |
| --- | --- | --- |
| task-dates-2010.mpp | generated/task-dates/task-dates-project2010-mpp14.mpp | Ten task dates; first task matches the corresponding Project 2010 MSPDI export (2014-10-31 08:00–17:00, 1 day) |
| task-links-2016.mpp | generated/task-links/task-links-project2016-mpp14.mpp | FS/SS/FF/SF dependencies and lag |
| resource-type-2016.mpp | generated/resource-type/resource-type-project2016-mpp14.mpp | Resource-only project and resource types |
| gantt.mpp | mpp14gantt.mpp | Preserve tasks with absent current dates; no invented schedule |
| unsupported-mpp12.mpp | generated/task-dates/task-dates-project2010-mpp12.mpp | Explicit legacy-format rejection |

Browser acceptance: open each supported file through the file picker on `/en/view`
and `/zh-CN/view`. Inspect pagination/search and task/resource switching, resize
and scroll in a narrow window, and switch files while parsing. Verify legacy
input shows a clear error. Only application runtime assets should be requested;
project content must never appear in network requests.
