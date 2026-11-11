<p align="center">
  <img width="256" alt="Safari Bookmark Search icon" src="assets/safari-bookmark-search-icon.png" />
</p>

# Safari Bookmark Search

Find Safari bookmarks by describing what a page does, and see which folder you saved it in.

## Install

You need Node.js, npm, and Raycast. Run one of these scripts from the project directory.

```sh
# Validate, build, and install the extension in Raycast.
./install_extension.sh

# Start development with live reloading.
./dev_install_extension.sh
```

The installer runs lint and builds into Raycast’s local extensions directory. Lint may need network access to validate the manifest. The development script installs dependencies and starts the Raycast watcher. Press **Ctrl+C** to stop it.

In Raycast, open **Search Safari Bookmarks by Intent**. Describe the page you remember, then press Return. Results show each bookmark's Safari folder path. Press Return on a result to open the page in Safari, or use the action panel to copy the folder path or URL.

If Raycast cannot read the bookmark file, grant **Raycast** Full Disk Access in **System Settings → Privacy & Security → Full Disk Access**, then quit and reopen Raycast.

## How search works

Each search reads Safari's current bookmark tree and scores its web bookmarks locally using keyword overlap and Apple's English sentence embeddings. It uses titles, saved descriptions, folder names, and URL metadata. The results window shows how many bookmarks have been processed. The first search builds a local embedding cache in Raycast’s extension support directory. Later searches reuse embeddings for unchanged metadata. The extension only reads Safari's file. It does not download page content or change bookmarks. Identical URLs saved in different folders are distinct entries.

With **Rerank Matches with Raycast AI** enabled, the extension sends the query and metadata for up to 30 locally selected candidates to Raycast AI. The URL field sent for ranking contains the hostname and path only. Bookmark titles, descriptions, folder names, and URL paths may contain private information. Turn the preference off for on-device search. Local matches appear before reranking. They remain available if AI is unavailable, finds no close matches, fails, or takes longer than eight seconds.

The folder breadcrumb is the saved location. Use it to navigate Safari's bookmark sidebar. The Open in Safari action opens the webpage.

## Development checks

Run `npm run typecheck`, `npm run lint`, and `npm run build`.
