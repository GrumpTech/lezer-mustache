import { styleTags, tags as t } from "@lezer/highlight";

export const mustacheHighlighting = styleTags({
  "StartTag StartSectionTag StartCloseSectionTag MismatchedStartCloseSectionTag StartCommentTag StartPartialTag StartUnescapedTag StartAmpersandTag EndTag EndUnescapedTag DelimiterTag InvalidDelimiterTag":
    t.strong,
  Content: t.content,
  TagKey: t.tagName,
  InvalidTagKey: [t.tagName, t.invalid],
  Comment: t.blockComment,
});
