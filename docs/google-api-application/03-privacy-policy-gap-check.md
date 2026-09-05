# Privacy Policy — what Google's reviewer checks, against what you have

Your Privacy Policy already covers most of this
(`frontend/src/pages/PrivacyPolicy.jsx`, "Third-Party Services" section). This
is not a rewrite — it's the specific gap that restricted-scope OAuth
verification checks for and your current text doesn't have: **Google's
"Limited Use" disclosure**, in close to Google's own required wording.

Reviewers for `business.manage` verification read this page. A policy that
mentions "Google APIs" in general terms, without the Limited Use language,
is a documented rejection reason.

## What you have now (this is fine, keep it)

> **Google APIs** — Used to fetch and manage your Google Business Profile
> reviews. Governed by Google's Privacy Policy and API Terms of Service.

## What to add right after it

```jsx
<li>
  <strong>Google Business Profile API</strong> — When you connect your
  Google Business Profile, Kirtify requests the{" "}
  <code>https://www.googleapis.com/auth/business.manage</code> scope to
  read your business's reviews (reviewer name, star rating, review text
  and timestamp) and to publish replies you write or approve back to
  Google. Kirtify's use and transfer of information received from Google
  APIs adheres to the{" "}
  <a
    href="https://developers.google.com/terms/api-services-user-data-policy"
    target="_blank"
    rel="noopener noreferrer"
  >
    Google API Services User Data Policy
  </a>
  , including the Limited Use requirements. This data is used only to
  provide the review-management features described in this policy; it is
  never sold, and it is never used for advertising. You can revoke this
  access at any time from Settings → Integrations, or directly at your{" "}
  <a
    href="https://myaccount.google.com/permissions"
    target="_blank"
    rel="noopener noreferrer"
  >
    Google Account permissions
  </a>{" "}
  page.
</li>
```

## Why each piece is there

| Line | Why the reviewer wants it |
|---|---|
| Names the exact scope | Generic "we use Google APIs" language is what gets bounced — reviewers cross-check the scope string against your consent screen |
| Lists the specific fields read | Matches "what data, specifically" — the standard verification question |
| Cites the User Data Policy + "Limited Use" by name | This is the literal phrase Google's checklist looks for on restricted scopes |
| "Never sold... never used for advertising" | Two of Google's explicit Limited Use conditions, stated affirmatively rather than left implicit |
| Revocation instructions, including Google's own permissions page | Google requires you to tell users they can revoke independently of your app — most policies only mention revoking in-app, which isn't sufficient |

## One more thing worth checking while you're in this file

Your Terms & Conditions and Privacy Policy already went through the
Kirtify rename — confirm the domain in the two `<a>` `href`s above and
anywhere else on this page is your real, owned domain before you submit
for verification. A reviewer following a broken or placeholder link is a
worse outcome than a policy that's merely brief.

## Order of operations

1. Add the block above to `PrivacyPolicy.jsx`.
2. Deploy it — the reviewer visits the *live* URL, not your repo.
3. Confirm it live: click the link from Settings → Integrations, or from
   wherever your Privacy Policy is linked, to make sure it resolves.
4. Then submit the OAuth verification in file 02 — submitting before this
   is live just adds a review round-trip.
