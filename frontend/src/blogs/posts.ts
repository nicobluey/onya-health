import articleHealthcareMadeForYou from './articles/healthcare-made-for-you.md?raw';
import articleAffordableQualityTelehealth from './articles/affordable-quality-telehealth.md?raw';
import articleChooseRightClinician from './articles/how-to-choose-the-right-online-clinician.md?raw';
import articlePersonalCareWithTelehealth from './articles/personal-care-with-telehealth.md?raw';
import articleOnlineDoctorAustraliaGuide from './articles/online-doctor-australia-guide.md?raw';

export interface BlogPost {
    slug: string;
    title: string;
    category: string;
    excerpt: string;
    author: string;
    publishedAt: string;
    readTimeMinutes: number;
    imageSrc: string;
    markdown: string;
}

function estimateReadTime(markdown: string) {
    const words = markdown
        .replace(/[#*_`>-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean).length;

    return Math.max(2, Math.round(words / 220));
}

function buildPost(post: Omit<BlogPost, 'readTimeMinutes'>): BlogPost {
    return {
        ...post,
        readTimeMinutes: estimateReadTime(post.markdown),
    };
}

export const BLOG_POSTS: BlogPost[] = [
    buildPost({
        slug: 'healthcare-made-for-you',
        title: 'Healthcare made for you: AI patient matching for better telehealth outcomes',
        category: 'AI Matching',
        excerpt: 'How AI-assisted patient matching helps people find the right online doctor, nutritionist, or psychologist faster in Australia.',
        author: 'Onya Clinical Team',
        publishedAt: '2026-03-01',
        imageSrc: '/blogs/images/blue-cells.png',
        markdown: articleHealthcareMadeForYou,
    }),
    buildPost({
        slug: 'affordable-quality-telehealth',
        title: 'Affordable telehealth in Australia without compromising care quality',
        category: 'Telehealth',
        excerpt: 'What patients should expect from affordable telehealth in Australia, including quality standards, access, and clinician review.',
        author: 'Onya Clinical Team',
        publishedAt: '2026-02-28',
        imageSrc: '/blogs/images/green-cells.png',
        markdown: articleAffordableQualityTelehealth,
    }),
    buildPost({
        slug: 'how-to-choose-the-right-online-clinician',
        title: 'How to choose the right online clinician for your symptoms and goals',
        category: 'Care Navigation',
        excerpt: 'A practical guide to choosing the right online clinician in Australia based on your symptoms, goals, and care preferences.',
        author: 'Onya Clinical Team',
        publishedAt: '2026-02-27',
        imageSrc: '/blogs/images/microscope.png',
        markdown: articleChooseRightClinician,
    }),
    buildPost({
        slug: 'personal-care-with-telehealth',
        title: 'Personal care plans online: building better daily health with telehealth',
        category: 'Personal Care',
        excerpt: 'Why personal care plans work better when telehealth is easy, consistent, and matched to the right clinician.',
        author: 'Onya Clinical Team',
        publishedAt: '2026-02-26',
        imageSrc: '/blogs/images/pipette.png',
        markdown: articlePersonalCareWithTelehealth,
    }),
    buildPost({
        slug: 'online-doctor-australia-guide',
        title: 'Online doctor Australia guide: how to book safely and confidently',
        category: 'Patient Guide',
        excerpt: 'What to check before booking an online doctor in Australia, including clinician registration, process quality, and safety signals.',
        author: 'Onya Clinical Team',
        publishedAt: '2026-02-24',
        imageSrc: '/blogs/images/lab-equipment.png',
        markdown: articleOnlineDoctorAustraliaGuide,
    }),
];

export function getBlogPostBySlug(slug: string) {
    return BLOG_POSTS.find((post) => post.slug === slug) ?? null;
}
