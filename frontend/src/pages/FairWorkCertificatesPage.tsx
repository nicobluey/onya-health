import { ArrowLeft, ExternalLink } from 'lucide-react';

export default function FairWorkCertificatesPage() {
    return (
        <main className="min-h-screen bg-sunlight-50 py-12">
            <div className="mx-auto max-w-3xl px-4">
                <a
                    href="/doctor"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-hover"
                >
                    <ArrowLeft size={16} />
                    Back to medical certificate consult
                </a>

                <article className="mt-4 rounded-3xl border border-border bg-white p-6 shadow-sm md:p-8">
                    <h1 className="text-3xl font-bold leading-tight text-text-primary md:text-4xl">
                        Fair Work Act and online medical certificate acceptance
                    </h1>
                    <p className="mt-4 text-base leading-relaxed text-text-secondary">
                        This page explains the general Fair Work framework for personal and carer's leave evidence
                        in Australia, and how online medical certificates fit within that framework.
                    </p>

                    <section className="mt-8">
                        <h2 className="text-xl font-semibold text-text-primary">What the framework says</h2>
                        <ul className="mt-3 list-disc space-y-2 pl-5 text-text-secondary">
                            <li>
                                The National Employment Standards require employees to give notice and provide
                                evidence if requested for personal/carer's leave.
                            </li>
                            <li>
                                Fair Work Act 2009 section 107 sets the evidence test as evidence that would satisfy
                                a reasonable person.
                            </li>
                            <li>
                                Fair Work Ombudsman guidance states that medical certificates and statutory declarations
                                are accepted examples of evidence.
                            </li>
                        </ul>
                    </section>

                    <section className="mt-8">
                        <h2 className="text-xl font-semibold text-text-primary">How this applies to online certificates</h2>
                        <p className="mt-3 text-text-secondary leading-relaxed">
                            In practice, online medical certificates can be valid evidence when they are legitimate and
                            clinically issued. Employers may still assess evidence against the reasonable-person standard
                            and the specific context of the leave request.
                        </p>
                        <p className="mt-3 text-text-secondary leading-relaxed">
                            For workplace leave, decisions are made in the context of the Fair Work framework and your
                            employment terms. For schools, universities, and other organisations outside Fair Work,
                            acceptance can also depend on that organisation's own policy requirements.
                        </p>
                    </section>

                    <section className="mt-8 rounded-2xl border border-border bg-sand-50 p-4">
                        <p className="text-sm leading-relaxed text-text-secondary">
                            General information only, not legal advice. Workplace rights can depend on your award,
                            enterprise agreement, contract, and individual circumstances.
                        </p>
                    </section>

                    <section className="mt-8">
                        <h2 className="text-xl font-semibold text-text-primary">Official sources</h2>
                        <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                            <li>
                                <a
                                    href="https://www.fairwork.gov.au/leave/sick-and-carers-leave/paid-sick-and-carers-leave/notice-and-medical-certificates"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-hover"
                                >
                                    Fair Work Ombudsman: notice and medical certificates
                                    <ExternalLink size={14} />
                                </a>
                            </li>
                            <li>
                                <a
                                    href="https://www.legislation.gov.au/C2009A00028/latest/text"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-hover"
                                >
                                    Fair Work Act 2009 (Cth)
                                    <ExternalLink size={14} />
                                </a>
                            </li>
                        </ul>
                    </section>
                </article>
            </div>
        </main>
    );
}
