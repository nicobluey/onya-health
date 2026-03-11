export const COPY = {
    hero: {
        title: "Get a medical certificate online — fast, doctor-issued.",
        subtitle: "Complete a short consult. A licensed Australian doctor reviews your request and issues a valid medical certificate if approved.",
        cta: "Book now",
        trust: [
            "Australia only",
            "AHPRA-approved doctors",
            "Secure checkout"
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
                "Cold / Flu",
                "Gastro",
                "Migraine",
                "Mental Health",
                "Injury",
                "Other"
            ]
        },
        compliance: {
            title: "Before you continue",
            checks: [
                "I am currently in Australia",
                "This is not an emergency",
                "My symptoms are mildly manageable",
                "I understand I should see a doctor if my condition worsens",
                "I agree to the Terms & Conditions and Privacy Policy"
            ]
        },
        description: {
            prompt: "Tell us about your symptoms",
            helper: "Select one or more symptoms that match your condition. You can add optional notes for the doctor."
        },
        dates: {
            question: "When do you need the certificate for?"
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
            message: "An AHPRA-approved Australian doctor is reviewing your request. If approved, your medical certificate will be sent via email or SMS shortly."
        }
    },
    faq: {
        title: "Frequently asked questions",
        items: [
            { q: "Is an online medical certificate valid?", a: "Yes — all certificates are doctor-issued and valid across Australian universities and workplaces." },
            { q: "Can I get a medical certificate online with Onya Health?", a: "Yes. Onya Health allows you to complete a telehealth consult and receive a valid certificate online." },
            { q: "Who is eligible?", a: "Anyone currently in Australia with non-emergency, manageable symptoms." },
            { q: "Do I need to find a doctor near me?", a: "No — our doctors review your consult remotely." },
            { q: "What are your hours of operation?", a: "We operate 24/7, including weekends and public holidays." },
            { q: "What is Onya Health?", a: "Onya Health is an Australian telehealth service connecting patients with licensed doctors for medical certificates and consults." },
            { q: "When will I receive my certificate?", a: "Typically within 30 minutes to a few hours, depending on demand. Priority delivery is available for an additional fee." },
            { q: "Will my employer accept this under the Fair Work Act (up to 2019)?", a: "Yes. Online medical certificates are valid, and we offer complimentary employer and school verification." },
            { q: "Is my information secure?", a: "Yes — all data is encrypted and handled in accordance with Australian privacy laws." },
            { q: "What if I’m not approved?", a: "You won’t be charged, or you’ll receive a full refund depending on the payment method." }
        ]
    },
    howItWorks: {
        title: "How it works",
        steps: [
            { title: "Request a consult", text: "Complete a quick questionnaire describing your symptoms." },
            { title: "Doctor review", text: "An AHPRA-approved Australian doctor reviews your request. They may ask follow-up questions or call you if needed." },
            { title: "Relief", text: "If approved, your fully valid medical certificate is sent via email or SMS. You can download the PDF instantly." }
        ]
    }
};
