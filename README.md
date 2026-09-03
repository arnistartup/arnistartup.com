# Arni Startup

Website for [arnistartup.com](https://arnistartup.com).

## Admin GitHub token

Create a token in GitHub → **Settings** → **Developer settings** → **Personal access tokens** (classic `public_repo`, or fine-grained Contents write on this repo).

Admin controls are hidden on the public site. Bookmark:

`https://arnistartup.com/?admin=1`

Then:
- Catalog → **Admin login**
- Reviews → **Approve review**

The page password is only a light reminder (it is in the client JavaScript). The GitHub token is the real secret — paste it at login. It stays in memory for that tab until you log out or refresh; it is not saved in `sessionStorage`.

Never commit the token.

## Reviews

Photos upload to ImgBB on submit (`assets/js/reviews-imgbb-config.js`).

1. Visitor: **Write a review** (name, email, review, photo).
2. You get an email with the photo URL.
3. Open the bookmark URL, then **Approve review** → log in — the form becomes publish mode.
4. Paste name, review, and photo URL (or attach a file), then **Publish review**.
5. **Delete** on a published card removes it from the site.
