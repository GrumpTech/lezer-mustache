# lezer-mustache

This repository contains a [mustache](https://mustache.github.io/mustache.5.html) grammar for the [lezer](https://lezer.codemirror.net/) parser system. [CodeMirror](https://codemirror.net/) editors use lezer parsers for syntax highlighting.

The code is based on [lezer xml parser](https://github.com/lezer-parser/xml) by Marijn Haverbeke licensed under an MIT license.

## Supported tags

This mustache parser supports the following tags.

- Variables
- Sections
- Inverted sections
- Partials
- Custom delimeters
- Comments

## Getting started

### Npm commands

- Run `npm install` to install the necessary npm packages.
- Run `npm build` to build the mustache parser.
- Run `npm test` to run some test scenarios.

### Example implementation in CodeMirror

The following code integrates lezer-mustache with the CodeMirror HTML language. It highlights the syntax of both mustache and HTML. Add `mustacheLanguage()` as an extension to CodeMirror to implement this combined language.

```ts
import { html, htmlLanguage } from "@codemirror/lang-html";
import { parseMixed } from "@lezer/common";
import { parser } from "@grumptech/lezer-mustache";
import { LRLanguage, indentNodeProp, LanguageSupport } from "@codemirror/language";

export function mustacheLanguage(): LanguageSupport {
  return new LanguageSupport(language, html().support);
}

const mustacheParser = parser.configure({
  props: [
    indentNodeProp.add({
      Element(context) {
        const after = /^(\s*)(<\/)?/.exec(context.textAfter)!;
        if (context.node.to <= context.pos + after[0].length) {
          return context.continue();
        }
        return context.lineIndent(context.node.from);
      },
    }),
  ],
  wrap: parseMixed((node) => {
    return node.type.isTop
      ? {
          parser: htmlLanguage.parser,
          overlay: (node) => node.type.name === "Content",
        }
      : null;
  }),
});

const language = LRLanguage.define({
  name: "mustache",
  parser: mustacheParser,
});
```
