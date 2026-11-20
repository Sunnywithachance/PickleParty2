# Pickle Party

Guests register a pickle using the number they receive at the door and can optionally give it a name and a nickname. Each number can be registered once. Guests can browse or search the directory by name or number. Anyone with site access can vote for any registered pickle as often as they like. Each click adds a separate vote record in SQLite. The leaderboard refreshes every three seconds and shows up to three entries per category, ranked by vote count then by entry number.

## Run locally

Run `npm start` and open `http://127.0.0.1:8787`. The server requires Node.js 22.5 or later. If your default Node is older, the start script looks for a compatible installation on your PATH. The local server stores entries and votes in `pickle-party.sqlite` in the project directory. Set `PICKLE_DB` to use a different file, or to `:memory:` for a temporary database.

## Delete an entry

Set `PICKLE_DELETE_CODE` to a four-digit server secret. For local use, add `PICKLE_DELETE_CODE=xxxx` to `.env.local`, replacing `xxxx` with your code, and restart the server. Git ignores this file. On the entry page, choose **Delete Pickle** and enter that code. This removes the pickle and its votes.

The hosted build uses the same request handler with a shared D1 database. Database migrations are in `drizzle/`.
