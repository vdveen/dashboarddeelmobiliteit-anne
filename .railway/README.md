# Apply the Voi cron service

The Railway configuration creates `voi-vehicle-monitor` in the existing `dashboarddeelmobiliteit` project. A named partial limits the configuration to this service. The configuration does not manage the dashboard web service.

The cron service deploys from `origin/main`. Apply the configuration only after this commit is available on that branch.

## Prepare the GitHub token

The service writes snapshots to the `voi-vehicle-data` branch. Create a fine-grained GitHub personal access token. Limit the token to `vdveen/dashboarddeelmobiliteit-anne`. Grant it read and write access to repository contents.

Store the token only in Railway. Do not add it to this repository or pass it as a command-line argument.

## Create the service

1. Install the committed dependencies with `npm ci`.
2. Authenticate with `railway login`. Use `railway login --browserless` from a remote terminal.
3. Link the production environment:

   ```bash
   railway link \
     --project 85622316-5f8e-4eec-9a0c-d3ca3336b928 \
     --environment 5d7678ad-1cd0-46e4-8993-15dcacdc0dfd
   ```

4. Run `railway config plan`. The plan must create only `voi-vehicle-monitor`. Stop if it changes or deletes another service.
5. Run `railway config apply` and confirm the plan.
6. Add the token without putting it in shell history:

   ```bash
   read -rsp "GitHub token: " voi_archive_token
   printf %s "$voi_archive_token" | railway variable set \
     VOI_ARCHIVE_GITHUB_TOKEN \
     --stdin \
     --project 85622316-5f8e-4eec-9a0c-d3ca3336b928 \
     --environment production \
     --service voi-vehicle-monitor
   unset voi_archive_token
   ```

The variable update starts a deployment. Wait until the next minute 17 UTC. Then run `railway service logs --service voi-vehicle-monitor`. Confirm that the process published one snapshot and exited.

Railway runs the job at minute 17 of every hour in UTC. The process exits after each snapshot, as Railway cron jobs require.
