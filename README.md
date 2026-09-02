# Arni Startup

Website for [arnistartup.com](https://arnistartup.com).

## Admin GitHub token

Create a token in GitHub → **Settings** → **Developer settings** → **Personal access tokens** (classic `public_repo`, or fine-grained Contents write on this repo).

Paste it only when you sign in on the site:
- Catalog → **Admin login**
- Reviews → **Approve review**

Never commit the token.

## Reviews

Photos upload to ImgBB on submit (`assets/js/reviews-imgbb-config.js`).

1. Visitor: **Write a review** (name, email, review, photo).
2. You get an email with the photo URL.
3. **Approve review** → log in — the form becomes publish mode.
4. Paste name, review, and photo URL (or attach a file), then **Publish review**.
5. **Delete** on a published card removes it from the site.
