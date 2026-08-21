function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderCorrectionProjectionHtml(segments) {
  return segments.map((segment) => {
    let content = "";
    const hasComments = Array.isArray(segment.comments) && segment.comments.length > 0;
    const commentClass = hasComments ? " correction-comment-highlight" : "";
    const styleClasses = (segment.styles || []).map((style) => (style.styleType === "color"
      ? `correction-color-${style.color}`
      : `correction-style-${style.styleType}`));

    if (segment.type === "deleted" || segment.type === "replaced-original") {
      const classes = ["correction-deleted", ...styleClasses];
      if (hasComments) classes.push("correction-comment-highlight");
      content = `<span class="${classes.join(" ")}">${escapeHtml(segment.text)}</span>`;
    } else if (segment.type === "inserted") {
      const colorClass = segment.color ? ` correction-color-${segment.color}` : "";
      content = `<span class="correction-inserted${colorClass}${commentClass}">${escapeHtml(segment.text)}</span>`;
    } else {
      const classes = [...styleClasses];
      if (hasComments) classes.push("correction-comment-highlight");
      content = `<span class="${classes.join(" ")}">${escapeHtml(segment.text)}</span>`;
    }

    const openBrackets = segment.bracketsBefore
      ? '<span class="correction-bracket">[</span>'.repeat(segment.bracketsBefore)
      : "";
    const closeBrackets = segment.bracketsAfter
      ? '<span class="correction-bracket">]</span>'.repeat(segment.bracketsAfter)
      : "";
    const commentBadges = (segment.commentsAfter || [])
      .map((comment) => `<span class="correction-comment-badge" title="${escapeHtml(comment)}">💬 ${escapeHtml(comment)}</span>`)
      .join("");

    return `${openBrackets}${content}${closeBrackets}${commentBadges}`;
  }).join("");
}
