# Aktuelt

The maker's page, next to "Skriv til Toke" (the chat with him). Three tabs:

- **Nyt:** news. Only admins post (`announcements`). A new post is a notice in the strip and the bell
  for NEWS_DAYS days, until the kitchen opens Aktuelt.
- **Forslag:** feature proposals, so every kitchen can weigh in before something is built.
- **Om:** what the app is (MIT licensed; kitchens download their own data under Adgang) and the questions a kitchen should be able to ask: who is behind it, that
  it is open source (contributions as pull requests on GitHub), where the data is, who can see
  what, what it costs, how it is looked after, and what happens if Toke stops, someone breaks in,
  or Toke himself cannot be trusted. Static text in the app (i18n `ABOUT_*`); it must stay true,
  so change it together with what it describes.

## Forslag

Only the maker makes proposals. Kitchens ask for features by writing to him; he turns them into
proposals.

| Collection | Fields | Written by | Notes |
| --- | --- | --- | --- |
| `proposals/{id}` | `title` (≤ 120), `body` (≤ 5000), `images` (≤ 6 Cloudinary ids), `status` (`open`, `planned`, `done`, `dropped`), `votes` ({kitchenId: true}), `createdAt`, `updatedAt`, `statusAt` | the maker; a kitchen only its own key in `votes` | `updatedAt` moves on every change by the maker (also an answer), `statusAt` when the status changes. |
| `proposals/{id}/comments/{cid}` | `from` (a kitchen id or `maker`), `text` (≤ 1000), `images` (only the maker's, ≤ 4), `createdAt` | a kitchen (its own, text only), the maker | A kitchen's comment moves `seen/{kid}.lastPostAt` in the same batch: one per 30 seconds, shared with posts. Deleted by the maker, or the kitchen within five minutes. |

- **The list:** cards, open and planned first (most thumbs up first), then implemented, then the ones
  not happening. A card shows the first picture, the status, the text, 👍 and the number of comments.
- **Opened:** all the text and pictures, 👍 ("Det vil vi gerne have"), the comments, and a field to
  comment. The maker's answers stand out and can have pictures; he sets the status there.
- **Notices:** a new proposal, or one that became implemented, since the kitchen last opened Aktuelt
  (within NEWS_DAYS), in the strip and the bell, like news.

### Reads

- The page: one listener on the newest 50 proposals, and one count per proposal (1 read each) for
  the number of comments. Opening one listens to its comments.
- The shell: one listener on proposals changed in the last NEWS_DAYS days (at most 10), for notices.
- Votes are a field on the proposal, so they cost nothing extra.
