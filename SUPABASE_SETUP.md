# Supabase setup for epic-poll

The browser app uses the Supabase project URL and publishable key in `supabase-config.js`. The publishable key is intended for browser apps; row-level security in `supabase-setup.sql` controls database permissions.

## 1. Create the tables and policies

In the Supabase Dashboard, open **SQL Editor**, create a query, paste in `supabase-setup.sql`, and run it.

## 2. Create the admin account

In **Authentication → Users**, add your admin user and finish setting its password. Supabase documents dashboard user management in its [Auth users guide](https://supabase.com/docs/guides/auth/users).

Copy the user UUID from the Users page. In SQL Editor, run this query with the UUID substituted:

```sql
insert into public.poll_admins (user_id)
values ('YOUR_AUTH_USER_UUID');
```

Only IDs listed in `poll_admins` can create, publish, pause, or delete polls. Public signups can remain disabled; participants do not need accounts.

## 3. Publish the site

Deploy the updated static site. Open `admin.html`, sign in with the admin email and password, create a poll, and publish it. The selected poll gets a unique student URL such as `https://your-site/index.html?poll=<poll-id>`; copy it from the Student poll link box. The homepage without a `poll` parameter loads the latest active poll. Both views refresh results automatically.

Do not add a Supabase secret key or database password to browser code. The publishable key is the only project key used by this frontend.
