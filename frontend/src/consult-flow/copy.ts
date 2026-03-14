export const COPY = {
    hero: {
        title: "Medical certificates online, reviewed by Australian-registered doctors.",
        subtitle: "Complete a short consult from home. If clinically appropriate, your certificate is issued digitally and sent to you.",
        cta: "Book now",
        trust: [
            "Australia-only service",
            "Doctor-reviewed decisions",
            "Secure payment and data handling"
        ]
    },
    steps: {
        purpose: {
            question: "What is this certificate for?",
            options: [
                "University / School",
                "Work",
                "Carer’s leave",
                "Travel",
                "Other"
            ]
        },
        symptom: {
            question: "What’s your main symptom?",
            options: [
                "Fever / infection symptoms",
                "Gastro symptoms",
                "Headache",
                "Respiratory symptoms",
                "Mental health symptoms",
                "Injury or pain",
                "Other"
            ]
        },
        compliance: {
            title: "Before you continue",
            checks: [
                "I am currently in Australia",
                "This is not an emergency",
                "My symptoms are manageable right now",
                "I understand I should seek urgent care if symptoms become severe or change suddenly",
                "I agree to the Terms & Conditions and Privacy Policy"
            ]
        },
        description: {
            prompt: "Tell us about your symptoms",
            helper: "Include context that helps clinical review, for example: first-ever headache vs recurring headache, when symptoms started, and what has changed.",
            redFlags: [
                "sudden severe headache unlike usual symptoms",
                "chest pain, trouble breathing, or fainting",
                "confusion, seizure, or one-sided weakness",
                "high fever that is worsening despite care",
            ],
        },
        dates: {
            question: "When should the certificate start?",
            helper: "Certificates can start from today onward. Backdating is not available."
        },
        upsell: {
            title: "Need medical certificates more than once?",
            subtitle: "Most people end up needing more than one certificate each year.",
            recommended: {
                tag: "Recommended — Unlimited Certificates",
                title: "Unlimited medical certificates",
                price: "$19 / month — cancel anytime",
                bullets: [
                    "Unlimited doctor-reviewed certificates",
                    "No re-entering details",
                    "Ideal for uni, work, or recurring conditions"
                ],
                cta: "Choose unlimited",
                micro: "Best value if you need more than one certificate"
            },
            oneoff: {
                title: "One-off Certificate",
                price: "$25 one-time",
                bullets: [
                    "One certificate for this consult",
                    "No ongoing commitment"
                ],
                cta: "Just this one"
            },
            footer: "Reviewed by licensed Australian doctors · No lock-in · Cancel anytime"
        },
        details: {
            fields: {
                name: "Full legal name",
                dob: "Date of birth",
                gender: "Gender",
                email: "Email",
                phone: "Phone number",
                address: "Residential address"
            },
            cta: "Book consult"
        },
        checkout: {
            title: "Secure Checkout",
            cta: "Pay & submit consult"
        },
        confirmation: {
            title: "Your consult has been submitted.",
            message: "An Australian-registered doctor is reviewing your request. If approved, your medical certificate will be sent via email or SMS."
        }
    },
    faq: {
        title: "Frequently asked questions",
        items: [
            { q: "Are online medical certificates accepted?", a: "Certificates are issued by an Australian-registered doctor when clinically appropriate. Acceptance decisions are made by your employer, school, or organisation." },
            { q: "Can I request a medical certificate online with Onya Health?", a: "Yes. You can submit a telehealth consult online for doctor review." },
            { q: "Who is eligible?", a: "Anyone currently in Australia with non-emergency, manageable symptoms." },
            { q: "Do I need an in-person clinic visit first?", a: "Not for this online consult pathway. A doctor reviews your information and may request follow-up details if needed." },
            { q: "What are your hours of operation?", a: "Consult submissions are available 24/7. Review times can vary by demand and clinical complexity." },
            { q: "What is Onya Health?", a: "Onya Health is an Australian telehealth service for medical-certificate consult requests and related digital care workflows." },
            { q: "When will I receive an outcome?", a: "Most requests are reviewed promptly, but timing varies. Complex presentations may require additional review." },
            { q: "Can I backdate a certificate?", a: "No. Certificates can only start from the current date onward." },
            { q: "Is my information secure?", a: "Yes. Data is encrypted in transit and handled under Australian privacy obligations." },
            { q: "What if a certificate is not approved?", a: "If not approved, you will receive guidance on next steps." }
        ]
    },
    howItWorks: {
        title: "How it works",
        steps: [
            { title: "Request a consult", text: "Complete a quick questionnaire describing your symptoms." },
            { title: "Doctor review", text: "An Australian-registered doctor reviews your request and may ask follow-up questions where required." },
            { title: "Outcome", text: "If approved, your certificate is sent digitally. If not approved, you receive clear guidance on what to do next." }
        ]
    }
};
