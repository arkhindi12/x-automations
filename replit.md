# Workspace

## Overview

X Automation Dashboard — platform manajemen otomasi X.com (Twitter) multi-akun dengan fitur autograb media, upload ke DoodStream, dan auto-posting terjadwal.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 20 runtime installed in Replit environment
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Frontend**: React + Vite (artifacts/x-automation)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Runtime

- Main workflow: `pnpm run dev`
- Frontend preview: Vite on port 5000 with `BASE_PATH=/`
- Backend API: Express on port 3000
- Frontend proxies `/api` to backend through `API_PROXY_TARGET=http://127.0.0.1:3000`
- 9Proxy integration uses backend route `/api/proxy/9proxy`; API key can be saved from Settings and is masked in API responses. `NINEPROXY_API_KEY` secret remains supported as a fallback.

## Features

- **Multi-akun**: Kelola banyak akun X.com masing-masing dengan API keys dan konfigurasi proxy
- **Target Profiles**: Tambah username X.com target yang akan dimonitor
- **Automation Jobs**: Buat job terjadwal (interval/cron/sekali) untuk grab media dan posting
- **Job Content Sources**: Job dapat memilih sumber konten antara grab target profil, grab beranda/home timeline akun, atau media yang sudah tersimpan, sehingga hasil grab/DoodStream bisa diposting ulang lain waktu atau lewat akun lain
- **Media Grabber**: Autograb gambar & video dari profil target
- **Reply Link Grabber**: Job bisa include replies dari target dan extract URL video dari teks reply dengan whitelist domain
- **DoodStream Upload**: Setelah grab, video dapat langsung diupload ke dood.stream via API key dan hasil `doodUrl` disimpan ke tabel media
- **Auto-post Queue**: Setelah grab/upload, job dapat membuat antrean post otomatis di tabel `posts` dengan template dan link hasil DoodStream/original
- **X Image Re-upload**: Scheduled post yang terkait media gambar akan mendownload gambar sumber resolusi besar dan mengupload ulang ke X sebagai attachment sebelum tweet dibuat
- **Source Media Pairing**: Media hasil grab dari tweet yang sama disimpan dengan `sourceTweetId`; jika satu sumber punya gambar + video/link, post queue memakai link video/DoodStream dari sumber itu dan attachment gambar dari sumber yang sama agar tidak tercampur dengan media lain
- **Tweet Text Grab**: Teks asli tweet ikut disimpan di media sebagai `sourceText`; template post mendukung `{tweetText}` dan `{tweetTextNoLinks}` agar caption target bisa ikut diposting
- **Automation Scheduler**: Backend menjalankan job aktif secara berkala dan memproses post pending yang sudah waktunya
- **Dashboard**: Statistik real-time, activity feed, system status
- **Proxy Support**: Per-akun proxy URL untuk keamanan
- **9Proxy API Integration**: Job form can fetch proxy lists from `api.9proxy.com`, filter by country/province/city/district/distance, and append results into job proxy rotation.
- **Downloader Redirect Chain + Smart Fallback**: Halaman Downloader memiliki tombol Redirect Chain yang menampilkan status HTTP, content type, dan URL final. Smart Extract juga mencoba fallback HTML untuk auto-submit POST form, iframe/player embed, dan `<source type="video/mp4">` ketika yt-dlp tidak mendukung host tertentu.

## Account Security

- Account API responses strip sensitive fields before returning data to the frontend.
- Proxy URLs are masked in API responses so embedded proxy credentials are not exposed in account lists.
- Add Account and credential replacement require a server-side validation call to X API before saving.
- Edit Account leaves credential inputs blank; blank credential fields preserve existing stored credentials.
- Masked placeholder values are rejected by the backend to avoid accidentally overwriting real credentials.

## Dual Login Modes (API vs Cookies)

- Each account stores `authMode` ("oauth" or "cookies"). User picks per account; both can coexist.
- **OAuth mode** uses `bearerToken` + `apiKey/apiSecret/accessToken/accessTokenSecret` and calls the official X API v2 for grabbing/posting/uploading.
- **Cookies mode** stores `auth_token` and `ct0` parsed from EditThisCookie JSON export (or raw `Cookie:` header), plus optional `cookieRawHeader` for replay and optional `cookieUserAgent`.
- Cookie-mode requests use the public web bearer + ct0 csrf header + cookie jar against the unofficial GraphQL endpoints (`UserByScreenName`, `UserTweets`, `HomeTimeline`, `CreateTweet`) and the chunked media upload (`INIT/APPEND/FINALIZE`).
- Frontend Add/Edit Account dialog shows tabs (API Login / Cookies Login). The cookie tab includes a textarea for paste, optional User-Agent, and step-by-step instructions for EditThisCookie.
- Account list shows a `COOKIES` or `API` badge in the new "Login" column.
- All flows that talk to X (`scanTargetProfile`, `scanHomeTimeline`, `uploadImageToX`, `postTweet`, `accounts/:id/health`, `accounts/test`) dispatch on `account.authMode`.
- Switching modes during edit requires re-supplying credentials/cookies; the backend wipes the unused credential set on switch.
- All cookie-mode HTTP calls respect the per-account proxy URL (HTTP/HTTPS/SOCKS) the same way OAuth-mode calls do.

## Reply Link Grabber

- Job configuration now includes `includeReplies`, `extractLinksFromReplies`, and `allowedVideoDomains`.
- Manual job run uses the configured account bearer token to fetch the target profile timeline through the official X API.
- If replies are enabled, reply tweets made by the target are scanned for URLs.
- Reply URLs are saved as video media only when the URL hostname matches the job's allowed domain list.
- Default UI domains are `vve.de,cdn.vdeqsp.de` for the example reply-link pattern.

## Grab Processing Pipeline

- Manual job run now processes newly inserted media immediately after saving metadata.
- If `uploadToDood` is enabled for a grabbed video, the server marks the media as `uploading`, calls DoodStream remote URL upload, then stores the returned `doodUrl` with `doodStatus: done`.
- If DoodStream upload fails, the media is marked `failed` and an activity error is recorded.
- If `postToX` is enabled, successful grabbed media creates a pending row in `posts` using the job's `postTemplate`.
- Template variables supported by the job runner: `{targetUsername}`, `{link}`, `{originalUrl}`, `{doodUrl}`, `{tweetText}`, `{tweetTextNoLinks}`.
- Grabbed media now stores `sourceTweetId`; queue creation groups media by that source id so an image attachment and DoodStream/video link from the same tweet stay paired in one scheduled post.
- Grabbed media also stores `sourceText`; new job defaults use `{tweetTextNoLinks}\n{link}` so the target caption is reused while old source URLs are stripped and replaced by the final DoodStream/custom link.
- Physical file storage is still not used in this pipeline; remote URL upload is used for DoodStream instead of downloading files locally.
- Job configuration includes `mediaSource` (`grab`, `home`, or `library`) and optional `savedMediaId`; `home` mode grabs from the actor account's reverse chronological home timeline, while `library` mode reuses a stored media record and queues posts without grabbing from X again.

## Full Automation

- Backend starts an automation scheduler when the API server starts.
- Active interval jobs run automatically when `nextRun` is empty or due; after each run the next run is scheduled based on `scheduleValue` minutes.
- One-time jobs run at their configured time, then are disabled.
- Pending posts with `scheduledAt <= now` are published automatically to X through the account's user credentials.
- If a pending post references image media, the publisher downloads the large image source URL, uploads it to X via media upload, and attaches the returned media id to the tweet.
- Successful posts are marked `posted`, store `xPostId`, and increment the account's post count.
- Failed post attempts are marked `failed` and recorded in the activity log.

## App Update (Via File Upload)

- Halaman `/update` di dashboard memungkinkan upload file `.zip` berisi source code terbaru
- Backend menerima upload, mengekstrak file ke workspace root (melewati `node_modules/`, `dist/`, `.git/`)
- Setelah ekstrak, backend otomatis menjalankan build backend dan dashboard utama di background
- Log proses ditampilkan real-time di halaman update
- Setelah build selesai, user perlu restart workflow Replit untuk menerapkan perubahan
- Route backend: `POST /api/update/upload`, `GET /api/update/status`, `POST /api/update/reset`
- Packages: `multer` (file upload), `adm-zip` (zip extraction)

## Key Commands

- `pnpm run dev` — run backend and frontend together for Replit preview
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/x-automation run dev` — run frontend locally

## DB Tables

- `accounts` — X.com akun dengan credentials dan proxy
- `targets` — profil X.com yang dimonitor
- `jobs` — automation jobs dengan scheduling, reply scan config, and pipeline config
- `media` — media yang sudah didownload/link video yang ditemukan dengan dood upload status, `sourceTweetId` untuk menjaga pasangan sumber, dan `sourceText` untuk caption asli
- `posts` — scheduled posts antrian posting; `mediaId` menunjuk attachment gambar bila ada, sementara `insertLink` dapat berisi link video/DoodStream dari sumber yang sama
- `activity` — log aktivitas sistem
- `settings` — global app configuration including the masked 9Proxy API key source used by backend proxy fetching
- `extractor_profiles` — aturan ekstraksi video per domain; Smart Extract mengecek tabel ini terlebih dahulu sebelum metode generik

## Smart Extractor & Extractor Profiles

- Smart Extract mencoba profil dari DB terlebih dahulu (diurutkan priority DESC), kemudian fallback ke direct-URL, Boodstream, yt-dlp, HTML scraper
- Jika Smart Extract sukses lewat fallback direct-URL, Boodstream, yt-dlp, atau HTML scraper, backend otomatis membuat atau memperbarui Extractor Profile untuk domain URL redirect-chain yang benar-benar berhasil dipakai + metode tersebut agar percobaan berikutnya bisa memakai profil tersimpan.
- Smart Extract memproses Redirect Chain secara berurutan per link: link pertama dicoba dengan semua metode, lalu link kedua, dan seterusnya. Jika link awal sudah menghasilkan video, sistem tidak lanjut memaksa memakai link terakhir.
- Direct URL tidak lagi dianggap video hanya karena path berakhiran `.mp4`/`.m3u8`; backend sekarang memvalidasi status dan content-type/range response agar halaman HTML, gambar, 404, atau redirect palsu tidak tampil sebagai hasil video.
- Redirect Chain yang berakhir atau melewati marketplace iklan Shopee/Tokopedia akan dilewati oleh Smart Extract; domain iklan tersebut tidak diproses sebagai video dan tidak disimpan sebagai Extractor Profile.
- Profil dicocokkan berdasarkan `domainPattern` (support wildcard `*.domain.com`) dan opsional `urlPattern` (regex)
- Metode yang didukung: `html`, `boodstream`, `api`, `direct`, `ytdlp`
- Metode `api` mendukung config JSON: `endpoint` (with `{videoId}` placeholder), `requestMethod`, `videoIdExtractor` (regex), `videoUrlPath` (dot-notation), `headers`, `params`, `bodyTemplate`
- `successCount`/`failCount` per profil diupdate otomatis setelah setiap percobaan
- Halaman UI `/extractor-profiles` untuk CRUD profil via dashboard
- API CRUD: `GET/POST /api/extractor-profiles`, `PUT/DELETE /api/extractor-profiles/:id`, `POST /api/extractor-profiles/:id/record-result`
- Downloader Smart Extract kini membedakan kegagalan karena redirect mati/404/server tujuan error; UI tidak lagi menyarankan Ekstrak Biasa untuk kasus yang kemungkinan tidak bisa diselesaikan lewat HTML scraping.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
