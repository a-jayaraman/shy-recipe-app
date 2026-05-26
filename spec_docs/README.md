# Recipe App — Module Specs

Four Claude Code sessions, one per module. Build in order — each builds on the previous.

## How to use these
1. Open a new Claude Code session in an empty `recipe-app/` directory
2. Drop the relevant `module-N-*.md` file in and say: "Build this. Ask me before any major architectural deviation from the spec."
3. Also include any data files mentioned in the spec (`recipes_standardized.json` for module 1)
4. Each module ends with concrete acceptance criteria — verify those before moving to the next

## Order

| # | Module | Builds on | Why this order |
|---|---|---|---|
| 1 | Backend API + DB | data files | Everything downstream needs the API |
| 2 | Browse / filter / search UI | Module 1 | Highest user value — once done, app is already useful |
| 3 | Add / edit / delete UI | Module 2 | Extends the same frontend project; needs a new backend endpoint for LLM-assist |
| 4 | LLM recommendations | Module 1 | Frontend extends Module 2; backend adds new endpoint and tool wrappers around Module 1's CRUD layer |

## Inter-module contracts

The API contract defined in module 1 is the load-bearing interface. If module 1 changes its API shape, modules 2-4 break.

To minimize churn:
- Once module 1 is done and tested, freeze its API shape
- If you discover a need for a new endpoint in modules 2-4, add it as a strictly additive change (new endpoint, never breaking an existing one)
- Both module 3 and module 4 add new backend endpoints (`POST /parse-recipe` for 3, `POST /recommend` for 4). These should be added to the existing FastAPI app, not a separate service.

## Repo layout once all four are done

```
recipe-app/
  backend/                   # built in module 1, extended in 3 and 4
  frontend/                  # built in module 2, extended in 3 and 4
  recipes_standardized.json  # source data
  docker-compose.yml         # optional, do at the end
  README.md
```

## A note on Claude Code session hygiene

For each module:
- Start the session by pasting the spec
- Let Claude propose a plan before writing code; review the plan
- After implementation, run the acceptance criteria yourself
- If you have feedback or want to iterate, do it within the same session for context continuity
- When the module passes acceptance criteria, commit the working state to git
- Start a fresh session for the next module — don't carry context across modules unnecessarily, it slows Claude down

## What's already done before module 1

- `recipes_standardized.json` — 147 cleaned, tagged recipes ready to import
- `tag_recipes.py` + `standardize_recipes.py` — pipeline for re-tagging if needed
- `requirements.txt` for the tagging pipeline

These tools live alongside the new app but aren't part of it. They're for re-running the pipeline if you ever re-export from Blogger.
