# Pickle Party

Guests register a pickle using the number they receive at the door and can optionally give it a name and a nickname. Each number can be registered once. Guests can browse or search the directory by name or number. Anyone with site access can vote for any registered pickle as often as they like. Each click adds a separate vote record in SQLite. The leaderboard refreshes every three seconds and shows up to three entries per category, ranked by vote count then by entry number.

## Run locally

Run `npm start` and open `http://127.0.0.1:8787`. The server requires Node.js 22.5 or later. If your default Node is older, the start script looks for a compatible installation on your PATH. The local server stores entries and votes in `pickle-party.sqlite` in the project directory. Set `PICKLE_DB` to use a different file, or to `:memory:` for a temporary database.

## Delete an entry

Set `PICKLE_DELETE_CODE` to a four-digit server secret. For local use, add `PICKLE_DELETE_CODE=xxxx` to `.env.local`, replacing `xxxx` with your code, and restart the server. Git ignores this file. On the entry page, choose **Delete Pickle** and enter that code. This removes the pickle and its votes.

## Deploy to Vercel

1. Connect this repository to a Vercel project. The repository's `vercel.json` publishes `public/` and exposes the routes in `api/`.
2. Create a [Turso libSQL database](https://docs.turso.tech/libsql) and generate a database authentication token with write access. To carry over existing local entries and votes, create it from a backup of your SQLite file using [Turso's SQLite import](https://docs.turso.tech/cli/db/create#create-database-from-sqlite-file).
3. In the Vercel project's [Environment Variables](https://vercel.com/docs/environment-variables/managing-environment-variables), set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for Production. Optionally set `PICKLE_DELETE_CODE` to enable host-only deletion on the deployed site.
4. Redeploy. The build applies the migrations from `drizzle/` to the configured database. Open `/api/pickles` on the deployment to check the connection. A new database returns an empty `entries` array.

Local development uses its own SQLite file. Vercel keeps entries and votes in the database configured for that environment.

`.env.example` lists the Turso variables using placeholder values. With both placeholders in Vercel, the site can deploy and show its pages. Registration, voting, and results become available after you replace both values in Vercel and redeploy. You can try the full flow locally with `npm start` while the cloud database is being set up.
