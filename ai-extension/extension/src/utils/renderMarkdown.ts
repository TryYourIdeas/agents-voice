import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

// html: false — raw HTML in agent text is stripped by the parser rather than
// trusted, since it originates from an LLM response, not from us.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

const defaultLinkRenderer =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    token.attrSet("target", "_blank");
    token.attrSet("rel", "noopener noreferrer");
    return defaultLinkRenderer(tokens, idx, options, env, self);
};

export function renderMarkdown(text: string): string {
    // target isn't in DOMPurify's default attribute allow-list.
    return DOMPurify.sanitize(md.render(text), { ADD_ATTR: ["target"] });
}
