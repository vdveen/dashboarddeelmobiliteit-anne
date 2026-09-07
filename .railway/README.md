# Apply the Voi cron service

The Railway configuration creates `voi-vehicle-monitor` in the existing `dashboarddeelmobiliteit` project. A named partial limits the configuration to this service. The configuration does not manage the dashboard web service.

The cron service deploys from `origin/main`. Apply the configuration only after this commit is available on that branch.

## Prepare the deploy key

The service writes snapshots to the `voi-vehicle-data` branch with a GitHub deploy key. Give the public key write access to this repository. Store the private key in Railway as `VOI_ARCHIVE_SSH_PRIVATE_KEY`.

Do not add the private key to this repository or print it in command output.

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
6. Add the private deploy key to `VOI_ARCHIVE_SSH_PRIVATE_KEY` through standard input. Do not put it in a command-line argument.

The variable update starts a deployment. Wait until the next minute 17 UTC. Then run `railway service logs --service voi-vehicle-monitor`. Confirm that the process published one snapshot and exited.

Railway runs the job at minute 17 of every hour in UTC. The process exits after each snapshot, as Railway cron jobs require.
