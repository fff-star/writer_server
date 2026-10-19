function decodeEntities(value: string): string {
  return value.replace(/&(#x?\d+|amp|lt|gt|quot|apos|nbsp);/g, (entity) => {
    const entities: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
      "&nbsp;": " ",
      "&#39;": "'",
      "&#34;": '"',
    };
    return entities[entity] ?? entity;
  });
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const withoutScripts = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|canvas)[\s\S]*?<\/\1>/gi, " ");
  const text = decodeEntities(
    withoutScripts
      .replace(/<\/(p|div|section|article|h[1-6]|li|tr|table|blockquote)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();
  return { title: decodeEntities(title), text };
}
