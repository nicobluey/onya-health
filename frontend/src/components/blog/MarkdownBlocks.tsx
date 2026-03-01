import type { ReactNode } from 'react';

type Block =
    | { type: 'h1' | 'h2' | 'h3'; text: string }
    | { type: 'paragraph'; text: string }
    | { type: 'list'; items: string[] };

function parseMarkdown(markdown: string): Block[] {
    const lines = markdown.split(/\r?\n/);
    const blocks: Block[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i].trim();

        if (!line) {
            i += 1;
            continue;
        }

        if (line.startsWith('# ')) {
            blocks.push({ type: 'h1', text: line.slice(2).trim() });
            i += 1;
            continue;
        }

        if (line.startsWith('## ')) {
            blocks.push({ type: 'h2', text: line.slice(3).trim() });
            i += 1;
            continue;
        }

        if (line.startsWith('### ')) {
            blocks.push({ type: 'h3', text: line.slice(4).trim() });
            i += 1;
            continue;
        }

        if (line.startsWith('- ')) {
            const items: string[] = [];
            while (i < lines.length && lines[i].trim().startsWith('- ')) {
                items.push(lines[i].trim().slice(2).trim());
                i += 1;
            }
            blocks.push({ type: 'list', items });
            continue;
        }

        const paragraphLines: string[] = [line];
        i += 1;
        while (i < lines.length) {
            const next = lines[i].trim();
            if (!next || next.startsWith('#') || next.startsWith('- ')) {
                break;
            }
            paragraphLines.push(next);
            i += 1;
        }

        blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
    }

    return blocks;
}

interface MarkdownBlocksProps {
    markdown: string;
}

export function MarkdownBlocks({ markdown }: MarkdownBlocksProps) {
    const blocks = parseMarkdown(markdown);

    return (
        <div className="space-y-5">
            {blocks.map((block, idx) => {
                const key = `${block.type}-${idx}`;

                if (block.type === 'h1') {
                    return <h1 key={key} className="text-3xl font-bold leading-tight text-text-primary md:text-4xl">{block.text}</h1>;
                }

                if (block.type === 'h2') {
                    return <h2 key={key} className="pt-2 text-2xl font-bold text-text-primary md:text-3xl">{block.text}</h2>;
                }

                if (block.type === 'h3') {
                    return <h3 key={key} className="pt-1 text-xl font-semibold text-text-primary">{block.text}</h3>;
                }

                if (block.type === 'list') {
                    return (
                        <ul key={key} className="list-disc space-y-2 pl-5 text-base leading-relaxed text-text-secondary">
                            {block.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    );
                }

                return (
                    <p key={key} className="text-base leading-relaxed text-text-secondary md:text-lg">
                        {block.text}
                    </p>
                );
            })}
        </div>
    );
}

export function formatPublishedDate(isoDate: string): string {
    return new Date(isoDate).toLocaleDateString('en-AU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

export function BlogShell({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-white font-sans">
            <header className="sticky top-0 z-40 border-b border-white/40 bg-white/30 backdrop-blur-xl">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
                    <a href="/" aria-label="Back to home" className="inline-flex items-center">
                        <img src="/logo.png" alt="Onya Health" className="h-11 w-auto object-contain" />
                    </a>
                    <a href="/blog" className="text-sm font-semibold text-text-primary hover:text-primary">Onya Blogs</a>
                </div>
            </header>
            {children}
        </div>
    );
}
