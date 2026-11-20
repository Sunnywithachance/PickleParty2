# Pickle Party

Guests register a pickle using the number they receive at the door and can optionally give it a name. Each number can be registered once. Guests can browse or search the directory by name or number. Anyone with site access can vote for a registered pickle in each category. The ballot is saved per browser for 30 days. Guests can replace a vote by picking another entry in the same category. The leaderboard shows the current leaders, including ties.

## Run locally

Use Node.js 22.5 or later, run `npm start`, and open `http://127.0.0.1:8787`. The local server stores entries and votes in `pickle-party.sqlite` in the project directory. Set `PICKLE_DB` to use a different file, or to `:memory:` for a temporary database.

The hosted build uses the same request handler with a shared D1 database. Database migrations are in `drizzle/`.
