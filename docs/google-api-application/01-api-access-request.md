# Google Business Profile API — Access Request

Use this for the form at https://developers.google.com/my-business/content/prereqs
("Request access to APIs"). It's a short application form, not a review — but a
vague answer is the single most common reason it stalls, so every answer below
names the exact API method your code calls.

Fill in the blanks marked `< >` before submitting. Everything else is ready to
paste as written.

---

## Company / project information

**Company name:** < your registered business name >

**Company website:** < your production domain, e.g. https://kirtify.com — must
resolve; Google will look >

**Project name in Google Cloud Console:** < the Cloud project you created for
this >

**Describe your business and how you plan to use the API:**

> Kirtify is a B2B SaaS reputation-management platform for clinics and small
> local businesses. It aggregates reviews from Google Business Profile, Yelp
> and Facebook into a single inbox, drafts AI-assisted reply suggestions, and
> lets the business owner publish a reply back to the originating platform.
>
> Each Kirtify customer is a separate business (a "clinic" in the product)
> that connects their own Google Business Profile via OAuth. Kirtify never
> accesses a location the business owner did not explicitly connect, and every
> customer's data is isolated from every other customer's.

## APIs requested

Request **all three** — reviews specifically require the legacy v4 API, which
is granted separately from the newer v1 APIs. Requesting only the v1 pair is
the most common way this ends in an approval that still can't sync reviews.

- [x] **My Business Account Management API** (v1) — `mybusinessaccountmanagement.googleapis.com`
- [x] **My Business Business Information API** (v1) — `mybusinessbusinessinformation.googleapis.com`
- [x] **My Business API** (v4, legacy) — `mybusiness.googleapis.com` — **required for review read/reply; state this explicitly if the form has a free-text field**

## OAuth scope requested

```
https://www.googleapis.com/auth/business.manage
```

This is the only scope the application requests. It is not requested alongside
any broader Google scope.

## What the integration does, method by method

State these plainly if the form asks for endpoint-level detail — it's what a
reviewer actually checks against your OAuth consent screen.

| Step | API call | Purpose |
|---|---|---|
| 1 | `accounts.list` (Account Management v1) | List the Google Business Profile accounts the signed-in user manages, so they can pick the right one |
| 2 | `accounts.locations.list` (Business Information v1) | List that account's locations, so the user can pick the specific business location to connect |
| 3 | `accounts/{a}/locations/{l}/reviews.list` (v4) | Read that location's reviews on a schedule the customer's plan sets (hourly to daily) |
| 4 | `accounts/{a}/locations/{l}/reviews/{r}:reply` (v4, PUT) | Publish a reply the business owner wrote or approved, back to that specific review |

Per review, the fields read are: reviewer display name (or "Anonymous" if the
reviewer is anonymous on Google), star rating, review text, the review and
update timestamps, and any existing owner reply. No reviewer contact
information, no location analytics beyond the review list, and no data from
locations the connected account does not include.

## Data handling

- Refresh and access tokens are encrypted at rest (AES-256-GCM) in the
  application database; never logged, never transmitted anywhere but Google's
  token endpoint.
- Disconnecting a location revokes the token at Google
  (`oauth2.googleapis.com/revoke`) and deletes it from Kirtify's database in
  the same action, regardless of whether Google's revoke call succeeds.
- No review content is shared with, or sold to, any third party. Review text
  is sent to < your AI provider, e.g. OpenAI > solely to draft a reply
  suggestion; the customer approves or edits every reply before it is
  published back to Google.

## Privacy Policy URL

< your production Privacy Policy URL, e.g. https://kirtify.com/privacy — must
be live before you submit >

## Estimated call volume

< your honest estimate, e.g. "under 500 connected locations in year one;
review sync runs 1–24 times/day per location depending on plan tier" >

---

### Before you submit

- [ ] Company website resolves and is not a placeholder
- [ ] Privacy Policy URL resolves and describes this exact integration (see
      file 03 in this folder)
- [ ] The three APIs above are enabled in your Cloud Console project
- [ ] Your OAuth consent screen already lists the same scope and the same
      Privacy Policy URL — mismatches between this form and the consent
      screen are a common cause of delay
