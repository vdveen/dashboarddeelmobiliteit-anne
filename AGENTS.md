# Agent instructions

## exe.dev environment

- This repository runs in an exe.dev VM.
- Use only documented exe.dev features. See <https://exe.dev/docs.md> and <https://exe.dev/docs/proxy.md>.
- Do not use undocumented local endpoints. They are internal, unstable, and unsupported.

## Railway service

- Railway deploys the `main` branch of the `vdveen/dashboarddeelmobiliteit-anne` fork to the existing `dashboarddeelmobiliteit` project and its `production` environment.
- The project ID is `85622316-5f8e-4eec-9a0c-d3ca3336b928`. The production environment ID is `5d7678ad-1cd0-46e4-8993-15dcacdc0dfd`.
- The Railway CLI is installed at `~/.local/bin/railway`. Run `railway whoami` before commands that need Railway access.
- If the CLI is not authenticated, ask the owner to run `railway login`. For a remote terminal without a local browser, use `railway login --browserless` and complete the device-code flow on another device.
- After authentication, link this checkout with `railway link --project 85622316-5f8e-4eec-9a0c-d3ca3336b928 --environment 5d7678ad-1cd0-46e4-8993-15dcacdc0dfd`. Select the existing web service if the CLI asks for a service.
- Do not create another Railway project or service for this app unless the user asks for one. A push to `origin/main` starts the normal production deployment through the GitHub integration.
- Use a project-scoped `RAILWAY_TOKEN` for unattended Railway commands. Never commit a Railway token or account credentials.
- `.railway/railway.ts` defines the `voi-vehicle-monitor` cron service as a named partial. Follow `.railway/README.md` to plan and apply it after the user authenticates the CLI.
- The cron service needs `VOI_ARCHIVE_GITHUB_TOKEN` in Railway. The token must have read and write access to repository contents for this fork. Never print or commit its value.

## Commit and push changes

- After completing and validating a small or medium change or fix, commit and push it when there are no significant risks or unresolved design choices. Do not ask for separate confirmation. The user prefers to revert a change they do not want.
- At the end of each such request, state whether you committed and pushed the code. If you did not, state why.
- Never commit or push changes to the core `Stichting-CROW/dashboarddeelmobiliteit-app` repository unless the user specifically asks you to do so. A request to commit or push that does not name a remote authorizes only the `origin` fork, `vdveen/dashboarddeelmobiliteit-anne`.
