import {
  Action,
  ActionPanel,
  AI,
  environment,
  getPreferenceValues,
  Icon,
  List,
  open,
} from "@raycast/api";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { useEffect, useState } from "react";
import {
  Bookmark,
  folderPath,
  rankedBookmarks,
  rankingPrompt,
  searchLocally,
} from "./search";

export default function Command() {
  const [searchText, setSearchText] = useState("");
  const query = searchText.trim();

  return (
    <List
      filtering={false}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Describe the page you remember…"
    >
      <List.EmptyView
        icon={Icon.Bookmark}
        title="Describe a saved page"
        description="For example, a tool that checks whether two colors are readable together."
      />
      {query && (
        <List.Item
          icon={Icon.MagnifyingGlass}
          title="Search Bookmarks"
          actions={
            <ActionPanel>
              <Action.Push
                title="Search Bookmarks"
                target={<Results query={query} />}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}

function Results({ query }: { query: string }) {
  const { useAI } = getPreferenceValues<{ useAI: boolean }>();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Reading Safari bookmarks…");
  const [progress, setProgress] = useState<{
    processed: number;
    total: number;
  }>();
  const [local, setLocal] = useState<Bookmark[]>([]);
  const [matches, setMatches] = useState<Bookmark[]>([]);
  const [usingLocal, setUsingLocal] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    setMatches([]);
    setLocal([]);
    setUsingLocal(false);
    setStatus("Reading Safari bookmarks…");
    setProgress(undefined);

    async function search() {
      const indexPath = join(environment.supportPath, "safari-index");
      await mkdir(indexPath, { recursive: true, mode: 0o700 }).catch(() => {});
      if (signal.aborted) return;

      const results = await searchLocally(
        join(environment.assetsPath, "search-safari.js"),
        query,
        signal,
        {
          cachePath: join(indexPath, "embeddings.json"),
          onProgress: (processed, total) => {
            setStatus(
              processed === total
                ? "Preparing matches…"
                : "Searching Safari bookmarks…",
            );
            setProgress({ processed, total });
          },
        },
      );
      if (signal.aborted) return;
      setProgress(undefined);
      if ("error" in results) {
        setStatus(
          results.error === "unreadable"
            ? "Safari bookmarks are unavailable. Give Raycast Full Disk Access in System Settings and relaunch Raycast."
            : "Safari’s bookmark file could not be parsed.",
        );
        return;
      }

      const candidates = results.matches.filter(({ url }) => URL.canParse(url));
      setLocal(candidates);
      if (!results.total || !candidates.length) {
        setStatus(
          results.total
            ? "No local matches found."
            : "No web bookmarks found in Safari.",
        );
        return;
      }

      const localStatus = results.semanticAvailable
        ? "Local matches"
        : "Keyword matches · Semantic model unavailable";
      setStatus(localStatus);
      setMatches(candidates);
      setUsingLocal(true);
      if (!useAI) return;
      if (!environment.canAccess(AI)) {
        setStatus(`${localStatus} · Raycast AI unavailable`);
        return;
      }

      setStatus(`${localStatus} · Reranking with Raycast AI…`);
      const deadline = AbortSignal.timeout(8000);
      try {
        const response = await AI.ask(rankingPrompt(query, candidates), {
          creativity: "none",
          signal: AbortSignal.any([signal, deadline]),
        });
        if (signal.aborted) return;
        const ranked = rankedBookmarks(response, candidates);
        if (ranked.length) {
          setMatches(ranked);
          setUsingLocal(false);
          setStatus("AI-ranked matches");
        } else {
          setStatus(`${localStatus} · AI found no close matches`);
        }
      } catch {
        if (!signal.aborted)
          setStatus(
            deadline.aborted
              ? `${localStatus} · Raycast AI timed out`
              : `${localStatus} · Raycast AI ranking failed`,
          );
      }
    }

    void search()
      .catch(() => {
        if (!signal.aborted)
          setStatus("Safari bookmark search failed. Try searching again.");
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, retry, useAI]);

  const retryAction = (
    <Action
      title="Search Again"
      icon={Icon.ArrowClockwise}
      onAction={() => setRetry(retry + 1)}
    />
  );

  function toggleLocal() {
    setMatches(local);
    setUsingLocal(true);
    setStatus("Local candidates");
  }

  return (
    <List
      navigationTitle={`Safari Bookmarks · ${query}`}
      isLoading={loading}
      searchBarPlaceholder="Filter results…"
    >
      {loading && matches.length === 0 && (
        <List.Item
          icon={Icon.Clock}
          title={status}
          subtitle={
            progress
              ? `${progress.processed.toLocaleString()} of ${progress.total.toLocaleString()} bookmarks`
              : undefined
          }
          keywords={[query]}
        />
      )}
      <List.EmptyView
        icon={Icon.Bookmark}
        title={status}
        actions={
          loading ? undefined : (
            <ActionPanel>
              {local.length > 0 && (
                <Action
                  title="Show Local Candidates"
                  icon={Icon.List}
                  onAction={toggleLocal}
                />
              )}
              {retryAction}
            </ActionPanel>
          )
        }
      />
      <List.Section title={status}>
        {matches.map((bookmark) => {
          const path = folderPath(bookmark);
          return (
            <List.Item
              key={bookmark.id}
              icon={Icon.Bookmark}
              title={bookmark.title}
              subtitle={path}
              keywords={[
                path,
                bookmark.description,
                new URL(bookmark.url).hostname,
              ]}
              actions={
                <ActionPanel>
                  <Action
                    title="Open in Safari"
                    icon={Icon.Globe}
                    onAction={() => open(bookmark.url, "com.apple.Safari")}
                  />
                  <Action.CopyToClipboard
                    title="Copy Safari Folder Path"
                    content={path}
                  />
                  <Action.CopyToClipboard
                    title="Copy Bookmark URL"
                    content={bookmark.url}
                  />
                  {!usingLocal && (
                    <Action
                      title="Show Local Candidates"
                      icon={Icon.List}
                      onAction={toggleLocal}
                    />
                  )}
                  {retryAction}
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
