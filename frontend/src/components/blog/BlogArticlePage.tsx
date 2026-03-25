import { ArrowLeft } from 'lucide-react';
import { getBlogPostBySlug } from '../../blogs/posts';
import { BlogShell, MarkdownBlocks } from './MarkdownBlocks';
import { formatPublishedDate } from './formatPublishedDate';

interface BlogArticlePageProps {
    slug: string;
}

export function BlogArticlePage({ slug }: BlogArticlePageProps) {
    const post = getBlogPostBySlug(slug);

    if (!post) {
        return (
            <BlogShell>
                <main className="mx-auto max-w-3xl px-4 py-14 md:px-8">
                    <h1 className="text-3xl font-bold text-text-primary">Article not found</h1>
                    <p className="mt-3 text-base text-text-secondary">This article does not exist or has moved.</p>
                    <a href="/blog" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-hover">
                        <ArrowLeft size={15} />
                        Back to blogs
                    </a>
                </main>
            </BlogShell>
        );
    }

    return (
        <BlogShell>
            <main className="pb-16">
                <section className="w-full border-b border-border bg-white">
                    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-14">
                        <a href="/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-hover">
                            <ArrowLeft size={15} />
                            Back to blogs
                        </a>

                        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-bark-500">
                            <span className="rounded-full bg-sunlight-100 px-3 py-1 font-semibold text-primary">{post.category}</span>
                            <span>{formatPublishedDate(post.publishedAt)}</span>
                            <span>·</span>
                            <span>{post.author}</span>
                            <span>·</span>
                            <span>{post.readTimeMinutes} min read</span>
                        </div>

                        <h1 className="mt-4 text-4xl font-bold leading-tight text-text-primary md:text-5xl">{post.title}</h1>
                        <p className="mt-4 max-w-3xl text-base text-text-secondary md:text-lg">{post.excerpt}</p>
                    </div>
                </section>

                <section className="mx-auto max-w-5xl px-4 pt-8 md:px-8 md:pt-10">
                    <img
                        src={post.imageSrc}
                        alt={post.title}
                        className="w-full rounded-3xl border border-border object-cover"
                    />

                    <article className="mt-10 rounded-3xl border border-border bg-white p-6 md:p-10">
                        <MarkdownBlocks markdown={post.markdown} />
                    </article>
                </section>
            </main>
        </BlogShell>
    );
}
