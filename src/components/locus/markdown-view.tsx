import {
  codeParts,
  headingLevel,
  headingText,
  listItems,
  parseBlocks,
  parseInline,
  quoteText,
  type InlineNode,
  type MdBlock,
} from "@/lib/vault/markdown";

function Inline({ nodes, onWiki }: { nodes: InlineNode[]; onWiki: (title: string) => void }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.t === "text") return <span key={index}>{node.v}</span>;
        if (node.t === "strong")
          return (
            <strong key={index} className="font-semibold">
              <Inline nodes={node.v} onWiki={onWiki} />
            </strong>
          );
        if (node.t === "em")
          return (
            <em key={index}>
              <Inline nodes={node.v} onWiki={onWiki} />
            </em>
          );
        if (node.t === "code")
          return (
            <code key={index} className="rounded-sm bg-copper-soft px-1 font-mono text-sm text-ink">
              {node.v}
            </code>
          );
        if (node.t === "wiki")
          return (
            <button
              key={index}
              type="button"
              className="text-copper underline decoration-copper/40 underline-offset-4"
              onClick={() => onWiki(node.title)}
            >
              {node.label}
            </button>
          );
        return (
          <a key={index} href={node.href} target="_blank" rel="noreferrer" className="text-copper underline underline-offset-4">
            {node.label}
          </a>
        );
      })}
    </>
  );
}

function BlockView({ block, onWiki }: { block: MdBlock; onWiki: (title: string) => void }) {
  if (block.kind === "rule") return <hr className="border-line" />;
  if (block.kind === "heading") {
    const level = headingLevel(block.raw);
    const className = "font-serif font-medium text-ink";
    const text = <Inline nodes={parseInline(headingText(block.raw))} onWiki={onWiki} />;
    if (level === 1) return <h2 className={`${className} text-3xl`}>{text}</h2>;
    if (level === 2) return <h3 className={`${className} text-2xl`}>{text}</h3>;
    return <h4 className={`${className} text-xl`}>{text}</h4>;
  }
  if (block.kind === "quote")
    return (
      <blockquote className="border-l-2 border-copper pl-4 font-serif text-lg leading-relaxed text-pretty text-ink italic">
        <Inline nodes={parseInline(quoteText(block.raw))} onWiki={onWiki} />
      </blockquote>
    );
  if (block.kind === "code") {
    const { lang, code } = codeParts(block.raw);
    return (
      <pre className="overflow-x-auto rounded-md border border-line bg-paper-2 p-4 font-mono text-sm leading-relaxed text-ink">
        {lang ? <div className="mb-2 text-xs tracking-wide text-muted uppercase">{lang}</div> : null}
        {code}
      </pre>
    );
  }
  if (block.kind === "list") {
    const items = listItems(block.raw);
    const ordered = items[0]?.ordered ?? false;
    const ListTag = ordered ? "ol" : "ul";
    return (
      <ListTag className={`flex flex-col gap-2 pl-5 font-serif text-lg leading-relaxed ${ordered ? "list-decimal" : "list-disc"}`}>
        {items.map((item, index) => (
          <li key={index} className="text-pretty">
            {item.checked === null ? null : (
              <span className="mr-2 font-sans text-sm text-copper">{item.checked ? "feito" : "aberto"}</span>
            )}
            <Inline nodes={parseInline(item.text)} onWiki={onWiki} />
          </li>
        ))}
      </ListTag>
    );
  }
  return (
    <p className="font-serif text-lg leading-relaxed text-pretty text-ink">
      {block.raw.split("\n").map((line, index) => (
        <span key={index}>
          {index > 0 ? <br /> : null}
          <Inline nodes={parseInline(line)} onWiki={onWiki} />
        </span>
      ))}
    </p>
  );
}

export function MarkdownView({ markdown, onWiki }: { markdown: string; onWiki: (title: string) => void }) {
  const blocks = parseBlocks(markdown);
  if (!blocks.length) return <p className="text-muted">Esta nota ainda não tem texto.</p>;
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} onWiki={onWiki} />
      ))}
    </div>
  );
}
