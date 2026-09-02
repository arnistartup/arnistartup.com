# Arni Startup

Website for [arnistartup.com](https://arnistartup.com).

## Admin GitHub token

Create a token in GitHub → **Settings** → **Developer settings** → **Personal access tokens** (classic `public_repo`, or fine-grained Contents write on this repo). Paste it only in **Admin login** on the site. Never commit the token.

## Reviews

Photos upload to ImgBB on submit (`assets/js/reviews-imgbb-config.js`).

1. Visitor submits review + photo → you get an email with the photo link.
2. **Reviews → Admin login** → **Approve & publish**.
3. Or **Publish manually** with a photo file or the ImgBB URL from the email.
4. **Delete** removes a published review from the site.
