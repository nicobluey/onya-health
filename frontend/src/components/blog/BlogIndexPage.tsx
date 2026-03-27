import { ArrowRight } from 'lucide-react';
import { BLOG_POSTS } from '../../blogs/posts';
import { BlogShell } from './MarkdownBlocks';
import { formatPublishedDate } from './formatPublishedDate';

export function BlogIndexPage() {
    return (
        <BlogShell>
            <main className="px-4 py-10 md:px-8 md:py-14">
                <div className="mx-auto max-w-6xl">
                    <div className="mb-10">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Onya Blogs</p>
                        <h1 className="mt-3 text-4xl font-bold text-text-primary md:text-5xl">Consumer-first telehealth insights</h1>
                        <p className="mt-4 max-w-3xl text-base text-text-secondary md:text-lg">
                            Practical guidance on AI-assisted clinician matching, affordable online care, and getting better outcomes from telehealth.
                        </p>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {BLOG_POSTS.map((post) => (
                            <article key={post.slug} className="flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-white shadow-sm">
                                <img src={post.imageSrc} alt={post.title} className="aspect-[16/10] w-full object-cover" loading="lazy" />
                                <div className="flex h-full flex-col p-5">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <span className="rounded-full bg-sunlight-100 px-3 py-1 text-xs font-semibold text-primary">{post.category}</span>
                                        <span className="text-xs text-bark-500">{post.readTimeMinutes} min read</span>
                                    </div>

                                    <h2 className="text-2xl font-bold leading-tight text-text-primary">{post.title}</h2>
                                    <p className="mt-3 text-sm leading-relaxed text-text-secondary">{post.excerpt}</p>

                                    <p className="mt-4 text-xs text-bark-500">
                                        {formatPublishedDate(post.publishedAt)} · {post.author}
                                    </p>

                                    <a
                                        href={`/blog/${post.slug}`}
                                        className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-semibold text-primary hover:text-primary-hover"
                                    >
                                        Read article
                                        <ArrowRight size={15} />
                                    </a>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </main>
        </BlogShell>
    );
}
