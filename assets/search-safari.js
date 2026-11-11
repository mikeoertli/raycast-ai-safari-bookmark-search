// Runs with macOS JavaScript for Automation to use Foundation and NaturalLanguage.
ObjC.import("Foundation");
ObjC.import("NaturalLanguage");

function value(object, key) {
  return object && !object.isNil() ? object.objectForKey(key) : null;
}

function string(object, key) {
  const result = ObjC.unwrap(value(object, key));
  return typeof result === "string" ? result : "";
}

function readBookmarks(path) {
  const data = $.NSData.dataWithContentsOfFile(path);
  if (data.isNil()) return { error: "unreadable" };

  const root =
    $.NSPropertyListSerialization.propertyListWithDataOptionsFormatError(
      data,
      0,
      null,
      null,
    );
  if (root.isNil() || !root.isKindOfClass($.NSDictionary))
    return { error: "invalid" };
  const bookmarks = [];

  function walk(node, folders, isRoot) {
    if (!node.isKindOfClass($.NSDictionary)) return;
    const type = string(node, "WebBookmarkType");
    if (type === "WebBookmarkTypeLeaf") {
      const url = string(node, "URLString");
      if (!/^https?:\/\//i.test(url)) return;
      bookmarks.push({
        id: bookmarks.length,
        title:
          string(value(node, "URIDictionary"), "title") ||
          string(node, "Title") ||
          url,
        description:
          string(node, "WebBookmarkDescription") || string(node, "Description"),
        url,
        folders,
      });
      return;
    }

    // Reading List is a separate Safari collection.
    const title = string(node, "Title");
    if (title === "com.apple.ReadingList" && folders.length === 0) return;
    const folderName =
      folders.length === 0 && title === "BookmarksBar" ? "Favorites" : title;
    const path = isRoot || !folderName ? folders : folders.concat(folderName);
    const children = value(node, "Children");
    if (!children || children.isNil() || !children.isKindOfClass($.NSArray))
      return;
    for (let i = 0; i < children.count; i++)
      walk(children.objectAtIndex(i), path, false);
  }

  walk(root, [], true);
  return { bookmarks };
}

function unitVector(model, text) {
  if (!model || !text) return null;
  const vector = model.vectorForString(text);
  if (vector.isNil()) return null;
  const values = ObjC.deepUnwrap(vector);
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return norm ? values.map((value) => value / norm) : null;
}

function tokens(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

// Vector cache format changes when the stored precision or model changes.
function readVectors(path, revision) {
  if (!path) return new Map();
  try {
    const data = $.NSData.dataWithContentsOfFile(path);
    if (data.isNil()) return new Map();
    const json = ObjC.unwrap(
      $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding),
    );
    const cache = JSON.parse(json);
    return cache.revision === revision ? new Map(cache.vectors) : new Map();
  } catch {
    return new Map();
  }
}

function saveVectors(path, revision, vectors) {
  if (!path) return;
  try {
    const json = JSON.stringify({ revision, vectors: [...vectors] });
    $(json)
      .dataUsingEncoding($.NSUTF8StringEncoding)
      .writeToFileAtomically(path, true);
  } catch {
    // The cache is optional. Search results are still available.
  }
}

function reportProgress(processed, total) {
  const line = JSON.stringify({ processed, total }) + "\n";
  $.NSFileHandle.fileHandleWithStandardError.writeData(
    $(line).dataUsingEncoding($.NSUTF8StringEncoding),
  );
}

function search(bookmarks, query, cachePath) {
  const model = $.NLEmbedding.sentenceEmbeddingForLanguage("en");
  const embedding = model.isNil() ? null : model;
  const queryVector = unitVector(embedding, query);
  const revision = queryVector ? `english-1-${embedding.revision}` : "";
  const cached = revision ? readVectors(cachePath, revision) : new Map();
  const used = new Map();
  let indexed = false;
  const stopWords = new Set(
    "a an and for i in is it me my of on or that the to was what where which with".split(
      " ",
    ),
  );
  const queryTerms = [
    ...new Set(tokens(query).filter((word) => !stopWords.has(word))),
  ];

  if (bookmarks.length) reportProgress(0, bookmarks.length);
  const ranked = bookmarks.map((bookmark, index) => {
    const url = $.NSURLComponents.componentsWithString(bookmark.url);
    const host = url.isNil() ? "" : ObjC.unwrap(url.host) || "";
    const path = url.isNil() ? "" : ObjC.unwrap(url.path) || "";
    const title = bookmark.title === bookmark.url ? "" : bookmark.title;
    const metadata = [
      title,
      bookmark.description,
      bookmark.folders.join(" "),
      host,
      path,
    ]
      .join(" ")
      .slice(0, 1500);
    const terms = new Set(tokens(metadata));
    const lexical =
      queryTerms.filter((term) => terms.has(term)).length /
      Math.max(1, queryTerms.length);
    const naturalText = [
      title,
      bookmark.description,
      path.replace(/[/_\-.]+/g, " "),
      bookmark.folders.join(" "),
    ]
      .filter(Boolean)
      .join(". ")
      .slice(0, 600);
    const text = naturalText || host;
    let vector = used.get(text);
    if (queryVector && text && !used.has(text)) {
      vector = cached.get(text);
      if (vector === undefined) {
        const normalized = unitVector(embedding, text);
        vector = normalized
          ? normalized.map((value) => Math.round(value * 10000))
          : null;
        indexed = true;
      }
      used.set(text, vector);
    }
    const semantic = vector
      ? vector.reduce((sum, value, i) => sum + value * queryVector[i], 0) /
        10000
      : -1;
    if ((index + 1) % 100 === 0 || index + 1 === bookmarks.length) {
      reportProgress(index + 1, bookmarks.length);
    }
    return { bookmark, score: semantic + 0.35 * lexical, lexical };
  });

  if (revision && (indexed || cached.size !== used.size)) {
    saveVectors(cachePath, revision, used);
  }

  const matches = ranked
    .filter(({ lexical }) => queryVector || lexical > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map(({ bookmark }) => bookmark);

  return { matches, semanticAvailable: Boolean(queryVector) };
}

function run(argv) {
  const input = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  const query = ObjC.unwrap(
    $.NSString.alloc.initWithDataEncoding(input, $.NSUTF8StringEncoding),
  );
  const library = readBookmarks(argv[0]);
  if (library.error) return JSON.stringify(library);
  return JSON.stringify({
    total: library.bookmarks.length,
    ...search(library.bookmarks, query, argv[1]),
  });
}
