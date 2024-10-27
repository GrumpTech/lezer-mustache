/* Hand-written tokenizer for mustache tag matching. */

import { ExternalTokenizer, ContextTracker } from "@lezer/lr";
import {
  Content,
  StartTag,
  StartSectionTag,
  StartCloseSectionTag,
  MismatchedStartCloseSectionTag,
  StartCommentTag,
  StartUnescapedTag,
  StartAmpersandTag,
  StartPartialTag,
  EndTag,
  EndUnescapedTag,
  TagKey,
  InvalidTagKey,
  Comment,
  SectionTag,
  CloseSectionTag,
  DelimiterTag,
  InvalidDelimiterTag,
} from "./parser.terms.js";

function tagKeyChar(ch) {
  return (
    ch == 45 ||
    ch == 46 ||
    (ch >= 48 && ch <= 57) ||
    (ch >= 65 && ch <= 90) ||
    ch == 95 ||
    (ch >= 97 && ch <= 122)
  );
}

function delimiterChar(ch) {
  return ch != 32 && ch != 61 && ch > 0;
}

let cachedKey = null,
  cachedInput = null,
  cachedPos = 0;
function tagKeyAfter(input, offset, token) {
  let pos = input.pos + offset;
  if (cachedInput == input && cachedPos == pos) return cachedKey;
  while (input.peek(offset) == 32 /* ' ' */) offset++;
  let first = token.charCodeAt(0);
  let key = "";
  for (;;) {
    let next = input.peek(offset);
    if (!tagKeyChar(next)) break;
    if (next == first) {
      let len = 1;
      for (let l = token.length; len < l; len++)
        if (input.peek(offset + len) != token.charCodeAt(len)) break;
      if (len == token.length) break;
    }
    key += String.fromCharCode(next);
    offset++;
  }
  cachedInput = input;
  cachedPos = pos;
  return (cachedKey = key || null);
}

let cachedDelimiters = null,
  cachedDelimiterInput = null,
  cachedDelimiterPos = 0;
function delimitersAfter(input, offset) {
  let pos = input.pos + offset;
  if (cachedDelimiterInput == input && cachedDelimiterPos == pos)
    return cachedDelimiters;
  let delimiter = "";
  let startDelimiter = "";
  let endDelimiter = "";
  for (;;) {
    let next = input.peek(offset);
    if (!delimiterChar(next)) {
      if (next == 32 /* ' ' */ && startDelimiter == "") {
        startDelimiter = delimiter;
        delimiter = "";
        offset++;
        continue;
      } else if (next == 61 /* '=' */ && startDelimiter != "") {
        endDelimiter = delimiter;
        break;
      } else if (next < 0) {
        return;
      }
    }
    delimiter += String.fromCharCode(next);
    offset++;
  }
  if (startDelimiter == "" || endDelimiter == "") return null;
  cachedDelimiterInput = input;
  cachedDelimiterPos = pos;
  return (cachedDelimiters = [startDelimiter, endDelimiter] || null);
}

function Section(key, parent) {
  this.key = key;
  this.parent = parent;
}

function MustacheContext(section, delimiters) {
  this.section = section;
  this.delimiters = delimiters;
}

export const mustacheContext = new ContextTracker({
  start: new MustacheContext(null, ["{{", "}}"]),
  shift(context, term, stack, input) {
    return term == StartSectionTag
      ? new MustacheContext(
          new Section(
            tagKeyAfter(input, 3, context.delimiters[1]) || "",
            context.section,
          ),
          context.delimiters,
        )
      : term == DelimiterTag
        ? new MustacheContext(
            context.section,
            delimitersAfter(input, context.delimiters[1].length + 1) ??
              context.delimiters,
          )
        : context;
  },
  reduce(context, term) {
    return term == CloseSectionTag && context.section
      ? new MustacheContext(context.section?.parent, context.delimiters)
      : context;
  },
  reuse(context, node, _stack, input) {
    let type = node.type.id;
    return type == StartSectionTag || type == SectionTag
      ? new MustacheContext(
          new Section(
            tagKeyAfter(input, 3, context.delimiters[1]) || "",
            context.section,
          ),
          context.delimiters,
        )
      : context;
  },
  strict: false,
});

export const content = new ExternalTokenizer(
  (input, stack) => {
    if (scanToToken(input, stack.context.delimiters[0])) {
      input.acceptToken(Content);
    }
  },
  { contextual: true },
);

export const startTag = new ExternalTokenizer(
  (input, stack) => {
    let startDelimiter = stack.context.delimiters[0];
    if (scanToken(input, startDelimiter)) {
      let next = input.next;
      if (next == 47 /* '/' */) {
        input.advance();
        let key = tagKeyAfter(input, 0, startDelimiter);
        if (!key) return input.acceptToken(StartCloseSectionTag);
        if (stack.context && key == stack.context.section?.key)
          return input.acceptToken(StartCloseSectionTag);
        for (let s = stack.context.section; s; s = s.parent)
          if (s.key == key)
            return input.acceptToken(MismatchedStartCloseSectionTag);
        input.acceptToken(MismatchedStartCloseSectionTag);
      } else if (next == 35 /* '#' */ || next == 94 /* '^' */) {
        input.advance();
        input.acceptToken(StartSectionTag);
      } else if (next == 33 /* '!' */) {
        input.advance();
        input.acceptToken(StartCommentTag);
      } else if (next == 123 /* '{' */) {
        input.advance();
        input.acceptToken(StartUnescapedTag);
      } else if (next == 61 /* '=' */) {
        input.advance();
        input.acceptToken(
          scanDelimiterTag(input, stack.context.delimiters[1])
            ? DelimiterTag
            : InvalidDelimiterTag,
        );
      } else if (next == 38 /* '&' */) {
        input.advance();
        input.acceptToken(StartAmpersandTag);
      } else if (next == 62 /* '>' */) {
        input.advance();
        input.acceptToken(StartPartialTag);
      } else input.acceptToken(StartTag);
    }
  },
  { contextual: true },
);

export const tagKey = new ExternalTokenizer(
  (input, stack) => {
    if (input.next == 32 /* ' ' */) return;
    let key = tagKeyAfter(input, 0, stack.context.delimiters[1]);
    let len = key?.length ?? 0;
    for (let i = 0; i < len; i++) input.advance();
    if (len > 1 && (key.startsWith(".") || key.indexOf("..") >= 0))
      input.acceptToken(InvalidTagKey);
    else if (len) input.acceptToken(TagKey);
  },
  { contextual: true },
);

export const comment = new ExternalTokenizer(
  (input, stack) => {
    if (scanToToken(input, stack.context.delimiters[1])) {
      input.acceptToken(Comment);
    }
  },
  { contextual: true },
);

export const endTag = new ExternalTokenizer(
  (input, stack) => {
    if (scanToken(input, stack.context.delimiters[1]))
      input.acceptToken(EndTag);
  },
  { contextual: true },
);
export const endUnescapedTag = new ExternalTokenizer(
  (input, stack) => {
    if (scanToken(input, "}" + stack.context.delimiters[1]))
      input.acceptToken(EndUnescapedTag);
  },
  { contextual: true },
);

function scanToken(input, token) {
  for (let i = 0, l = token.length; i < l; i++) {
    if (input.peek(i) != token.charCodeAt(i)) return false;
  }
  for (let i = 0, l = token.length; i < l; i++) input.advance();
  return true;
}

function scanToToken(input, token) {
  let len = 0,
    first = token.charCodeAt(0);
  scan: for (; ; input.advance(), len++) {
    if (input.next < 0) break;
    if (input.next == first) {
      for (let i = 1; i < token.length; i++)
        if (input.peek(i) != token.charCodeAt(i)) continue scan;
      break;
    }
  }
  return len > 0;
}

function scanDelimiterTag(input, endToken) {
  if (input.next == 32 /* ' ' */) return false;
  while (delimiterChar(input.next)) input.advance();
  if (input.next == 32 /* ' ' */) input.advance();
  else return false;
  while (delimiterChar(input.next)) input.advance();
  if (input.next == 61 /* '=' */) input.advance();
  else return false;
  return scanToken(input, endToken);
}
