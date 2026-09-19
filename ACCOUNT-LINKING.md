# Account linking — what Black taps to go live

Live DM delivery is **hard-gated** on these steps. Until every box is checked,
`webhook.js` runs in DRY-RUN and logs what it *would* send. Nothing fires from
any real account before this.

These are Meta's documented steps for Instagram Messaging API automation
(comment-to-DM is Meta's sanctioned pattern: one automated DM per post per person).

## The checklist

1. **Instagram → professional account.** In the Instagram app: profile → menu →
   Settings → Account type and tools → Switch to professional account → choose
   Business (or Creator). The account must be Business or Creator — personal
   accounts cannot use the Messaging API.
2. **Link Instagram to a Facebook Page.** Facebook Page Settings → Linked
   accounts → Instagram → connect the @cumulativeweb account. (Or in IG:
   Settings → Business → connect Facebook Page.) The IG account must be linked
   to the Page or the API cannot act on it.
3. **Create a Meta app** at developers.facebook.com → Create app → type
   Business. Add the **Messenger** product (Instagram messaging runs on the
   Messenger Platform API).
4. **Subscribe the webhook.** In the app dashboard → Messenger → Settings →
   Webhooks: subscribe to the **instagram** topic, field **comments**; set the
   Callback URL to the public HTTPS endpoint running `webhook.js` and the
   Verify Token to the value stored with the app secret (step 6).
5. **Permissions.** Request scopes: `instagram_manage_comments`,
   `instagram_manage_messages`, `pages_messaging`. For anyone beyond test users
   this requires **App Review** — submit with a screencast of the comment →
   receipt DM flow.
6. **Secrets.** Generate the Page access token (long-lived) and note the App
   Secret. Store both in the Secure Vault — never in the repo, never in chat.
   The server reads them from env: `CWI_IG_PAGE_TOKEN`, `CWI_IG_APP_SECRET`,
   `CWI_IG_VERIFY_TOKEN`, `CWI_IG_PAGE_ID`.
7. **Host the webhook.** `node webhook.js --port 8787` behind any public HTTPS
   endpoint ($0 options: Cloudflare Workers free tier via a thin adapter, or any
   always-on host). Meta requires HTTPS; localhost never receives callbacks.
8. **Test with test users**, then flip: `node webhook.js --live` only after
   steps 1–7 are verified end to end.

## Kill note

If the accounts are never linked, the public demo page *is* the product and the
webhook is archived at the 60-day kill review. The demo needs no one's
permission.
